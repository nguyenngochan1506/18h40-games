mod config;
mod rooms;

use axum::{
    Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, StatusCode, Uri},
    response::Response,
    routing::get,
};
pub use config::Config;
use futures_util::SinkExt;
use protocol::{ClientMessage, ErrorCode, PROTOCOL_VERSION, ServerMessage};
use serde::Deserialize;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::{mpsc, watch};

pub(crate) const QUEUE_CAPACITY: usize = 64;
const _: () = assert!(QUEUE_CAPACITY >= 2);

#[derive(Clone)]
struct AppState {
    registry: rooms::Registry,
    config: Config,
}

pub fn app(config: Config) -> Router {
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/ws", get(upgrade))
        .with_state(AppState {
            registry: rooms::Registry::new(config.clone()),
            config,
        })
}

fn origin_allowed(headers: &HeaderMap, allowed: &[String]) -> bool {
    let Some(origin) = headers.get("origin") else {
        return true;
    };
    if headers.get_all("origin").iter().count() != 1 {
        return false;
    }
    let Ok(origin) = origin.to_str() else {
        return false;
    };
    if allowed.iter().any(|entry| entry == origin) {
        return true;
    }
    let Some(host) = headers.get("host").and_then(|host| host.to_str().ok()) else {
        return false;
    };
    origin.parse::<Uri>().is_ok_and(|uri| {
        matches!(uri.scheme_str(), Some("http" | "https"))
            && uri
                .authority()
                .is_some_and(|authority| authority.as_str().eq_ignore_ascii_case(host))
            && (uri.path().is_empty() || uri.path() == "/")
            && uri.query().is_none()
    })
}

async fn upgrade(
    State(state): State<AppState>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, StatusCode> {
    if !origin_allowed(&headers, &state.config.allowed_origins) {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(ws
        .max_message_size(state.config.max_message_bytes)
        .max_frame_size(state.config.max_message_bytes)
        .on_upgrade(move |socket| handle_socket(socket, state)))
}

#[derive(Clone)]
pub(crate) struct Peer {
    id: u64,
    outgoing: mpsc::Sender<ServerMessage>,
    shutdown: watch::Sender<Option<u16>>,
}

impl Peer {
    fn send(&self, message: ServerMessage) {
        // A slow client must not grow a queue or block the whole room.
        if self.outgoing.try_send(message).is_err() {
            self.close();
        }
    }

    fn close(&self) {
        let _ = self.shutdown.send(Some(1013));
    }

    fn replace(&self) {
        let _ = self.shutdown.send(Some(4001));
    }
}

#[derive(Deserialize)]
struct Version {
    v: u32,
}

fn error(code: ErrorCode) -> ServerMessage {
    ServerMessage::Error {
        v: PROTOCOL_VERSION,
        code,
        message: match code {
            ErrorCode::UnsupportedVersion => "Unsupported protocol version",
            ErrorCode::InvalidMessage => "Invalid message",
            ErrorCode::RoomNotFound => "Room not found",
            ErrorCode::NicknameTaken => "Nickname already taken",
            ErrorCode::InvalidNickname => "Invalid nickname",
            ErrorCode::InvalidToken => "Invalid session",
            ErrorCode::AlreadyInRoom => "Already in a room",
            ErrorCode::NotInRoom => "Not in a room",
            ErrorCode::NotHost => "Only the host can do this",
            ErrorCode::WrongPhase => "Action unavailable in this phase",
            ErrorCode::NotEnoughPlayers => "Not enough players",
            ErrorCode::NoFreeSeat => "No free player seat",
            ErrorCode::IllegalAction => "Action is not allowed",
            ErrorCode::ServerBusy => "Server capacity reached",
        }
        .into(),
    }
}

fn parse_message(text: &str) -> Result<ClientMessage, ErrorCode> {
    let version = serde_json::from_str::<Version>(text).map_err(|_| ErrorCode::InvalidMessage)?;
    if version.v != PROTOCOL_VERSION {
        return Err(ErrorCode::UnsupportedVersion);
    }
    serde_json::from_str(text).map_err(|_| ErrorCode::InvalidMessage)
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    static NEXT_CONNECTION: AtomicU64 = AtomicU64::new(1);
    let (outgoing, mut receiver) = mpsc::channel(QUEUE_CAPACITY);
    let (shutdown, mut closed) = watch::channel(None);
    let peer = Peer {
        id: NEXT_CONNECTION.fetch_add(1, Ordering::Relaxed),
        outgoing,
        shutdown,
    };
    let mut room = None;
    loop {
        tokio::select! {
            biased;
            _ = closed.changed() => break,
            outgoing = receiver.recv() => {
                let Some(outgoing) = outgoing else { break; };
                let Ok(text) = serde_json::to_string(&outgoing) else { break; };
                tokio::select! {
                    biased;
                    _ = closed.changed() => break,
                    result = socket.send(Message::Text(text.into())) => { if result.is_err() { break; } }
                }
            }
            frame = socket.recv() => {
                let message = match frame {
                    Some(Ok(Message::Text(text))) => match parse_message(&text) {
                        Ok(message) => message,
                        Err(code) => { peer.send(error(code)); continue; }
                    },
                    Some(Ok(Message::Binary(_))) => { peer.send(error(ErrorCode::InvalidMessage)); continue; }
                    Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
                    _ => break,
                };
                if let ClientMessage::Ping { nonce, .. } = message {
                    peer.send(ServerMessage::Pong { v: PROTOCOL_VERSION, nonce });
                    continue;
                }
                let entering = matches!(message, ClientMessage::CreateRoom { .. } | ClientMessage::JoinRoom { .. } | ClientMessage::RejoinRoom { .. });
                if entering && room.is_some() { peer.send(error(ErrorCode::AlreadyInRoom)); continue; }
                let target = match &message {
                    ClientMessage::CreateRoom { nickname, game, .. } => state.registry.create(nickname, *game),
                    ClientMessage::JoinRoom { room_code, .. } | ClientMessage::RejoinRoom { room_code, .. } => state.registry.find(room_code).ok_or(ErrorCode::RoomNotFound),
                    _ => room.clone().ok_or(ErrorCode::NotInRoom),
                };
                match target {
                    Ok(sender) => {
                        room = if rooms::request(&sender, &peer, message).await { Some(sender) } else { None };
                    }
                    Err(code) => peer.send(error(code)),
                }
            }
        }
    }
    if let Some(room) = room {
        let _ = room
            .send(rooms::Command::Disconnect {
                connection_id: peer.id,
            })
            .await;
    }
    let close_code = *closed.borrow();
    let _ = tokio::time::timeout(state.config.offline_timeout, async {
        if let Some(code) = close_code {
            let _ = socket
                .send(Message::Close(Some(axum::extract::ws::CloseFrame {
                    code,
                    reason: if code == 4001 {
                        "Session replaced"
                    } else {
                        "Client too slow"
                    }
                    .into(),
                })))
                .await;
        }
        let _ = socket.close().await;
    })
    .await;
}
