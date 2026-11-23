use std::{
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use jsonwebtoken::{EncodingKey, Header, encode};
use protocol::{VoiceError, VoiceTokenResult};
use reqwest::{Client, StatusCode, Url};
use serde::Serialize;
use tokio::{
    sync::{OwnedSemaphorePermit, Semaphore},
    time::Instant,
};

const TOKEN_TTL: Duration = Duration::from_secs(60);
const REMOVE_PATH: &str = "/twirp/livekit.RoomService/RemoveParticipant";

#[derive(Clone)]
pub struct VoiceConfig(Arc<LiveKit>);

struct LiveKit {
    public_url: Url,
    remove_url: Url,
    api_key: String,
    api_secret: EncodingKey,
    namespace: String,
    http: Client,
    leases: Arc<Semaphore>,
    removals: Semaphore,
}

#[derive(Serialize)]
struct Claims<'a, T> {
    iss: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    sub: Option<&'a str>,
    nbf: u64,
    exp: u64,
    video: T,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JoinGrant<'a> {
    room: &'a str,
    room_join: bool,
    can_subscribe: bool,
    can_publish: bool,
    can_publish_sources: [&'static str; 1],
    can_publish_data: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminGrant<'a> {
    room: &'a str,
    room_admin: bool,
}

#[derive(Serialize)]
struct Participant<'a> {
    room: &'a str,
    identity: &'a str,
}

impl VoiceConfig {
    pub fn new(
        public_url: &str,
        internal_url: &str,
        api_key: &str,
        api_secret: &str,
        namespace: &str,
    ) -> Result<Self, &'static str> {
        fn endpoint(raw: &str) -> Option<Url> {
            let url = Url::parse(raw).ok()?;
            (url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none()
                && matches!(url.path(), "" | "/")
                && url.query().is_none()
                && url.fragment().is_none())
            .then_some(url)
        }
        const INVALID: &str = "Invalid LiveKit configuration";
        let public_url = endpoint(public_url).ok_or(INVALID)?;
        let mut remove_url = endpoint(internal_url).ok_or(INVALID)?;
        let local = matches!(
            public_url.host_str(),
            Some("localhost" | "127.0.0.1" | "[::1]")
        );
        if !(public_url.scheme() == "wss" || local && public_url.scheme() == "ws")
            || !matches!(remove_url.scheme(), "http" | "https")
            || api_key.trim().is_empty()
            || api_secret.trim().is_empty()
            || !local && api_secret.len() < 32
            || !(1..=24).contains(&namespace.len())
            || !namespace
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-')
        {
            return Err(INVALID);
        }
        remove_url.set_path(REMOVE_PATH);
        let http = Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(3))
            .build()
            .map_err(|_| INVALID)?;
        Ok(Self(Arc::new(LiveKit {
            public_url,
            remove_url,
            api_key: api_key.into(),
            api_secret: EncodingKey::from_secret(api_secret.as_bytes()),
            namespace: namespace.into(),
            http,
            leases: Arc::new(Semaphore::new(1024)),
            removals: Semaphore::new(32),
        })))
    }

    pub(crate) fn room(&self, instance: &str) -> VoiceRoom {
        VoiceRoom {
            service: self.0.clone(),
            name: format!("{}-{instance}", self.0.namespace).into(),
        }
    }
}

#[derive(Clone)]
pub(crate) struct VoiceRoom {
    service: Arc<LiveKit>,
    name: Arc<str>,
}

impl VoiceRoom {
    pub fn grant(&self, identity: String) -> Result<(VoiceTokenResult, VoiceLease), VoiceError> {
        let capacity = self
            .service
            .leases
            .clone()
            .try_acquire_owned()
            .map_err(|_| VoiceError::RateLimited)?;
        let (token, expires_at) = self.service.sign(
            Some(&identity),
            JoinGrant {
                room: &self.name,
                room_join: true,
                can_subscribe: true,
                can_publish: true,
                can_publish_sources: ["microphone"],
                can_publish_data: false,
            },
        )?;
        Ok((
            VoiceTokenResult::Ok {
                url: self.service.public_url.to_string(),
                token,
                expires_at,
            },
            VoiceLease {
                room: self.clone(),
                removal: Some((identity, Instant::now() + TOKEN_TTL, capacity)),
            },
        ))
    }
}

pub(crate) struct VoiceLease {
    room: VoiceRoom,
    removal: Option<(String, Instant, OwnedSemaphorePermit)>,
}

impl Drop for VoiceLease {
    fn drop(&mut self) {
        let Some((identity, expires, capacity)) = self.removal.take() else {
            return;
        };
        let room = self.room.clone();
        tokio::spawn(async move {
            let _capacity = capacity;
            let remove = || room.service.remove_with_retry(&room.name, &identity);
            let sweep = expires + Duration::from_secs(2);
            let may_race_join = Instant::now() < sweep;
            remove().await;
            // Sweep once more after the initial grant expires, in case its join raced removal.
            if may_race_join {
                tokio::time::sleep_until(sweep).await;
                remove().await;
            }
        });
    }
}

impl LiveKit {
    fn sign(&self, sub: Option<&str>, video: impl Serialize) -> Result<(String, u64), VoiceError> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| VoiceError::VoiceUnavailable)?
            .as_secs();
        let exp = now + TOKEN_TTL.as_secs();
        let claims = Claims {
            iss: &self.api_key,
            sub,
            nbf: now,
            exp,
            video,
        };
        encode(&Header::default(), &claims, &self.api_secret)
            .map(|token| (token, exp))
            .map_err(|_| VoiceError::VoiceUnavailable)
    }

    async fn remove_with_retry(&self, room: &str, identity: &str) {
        for delay in [0, 1, 3] {
            if delay > 0 {
                tokio::time::sleep(Duration::from_secs(delay)).await;
            }
            let _request = self
                .removals
                .acquire()
                .await
                .expect("removal semaphore is never closed");
            let Ok((token, _)) = self.sign(
                None,
                AdminGrant {
                    room,
                    room_admin: true,
                },
            ) else {
                break;
            };
            let response = self
                .http
                .post(self.remove_url.clone())
                .bearer_auth(token)
                .json(&Participant { room, identity })
                .send()
                .await;
            if response.is_ok_and(|response| {
                response.status().is_success() || response.status() == StatusCode::NOT_FOUND
            }) {
                return;
            }
        }
        tracing::warn!("LiveKit participant removal failed");
    }
}
