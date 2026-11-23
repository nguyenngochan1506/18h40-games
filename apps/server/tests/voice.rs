mod support;

use axum::{Json, Router, extract::State, http::HeaderMap, routing::post};
use futures_util::StreamExt;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde_json::{Value, json};
use server::{Config, VoiceConfig};
use std::time::Duration;
use support::{Client, TestServer};
use tokio::{net::TcpListener, sync::mpsc};
use tokio_tungstenite::tungstenite::Message;

const SECRET: &str = "voice-test-secret";
const KEY: &str = "voice-test-key";

fn claims(token: &str) -> Value {
    let claims = decode::<Value>(
        token,
        &DecodingKey::from_secret(SECRET.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .expect("LiveKit JWT signature must be valid")
    .claims;
    assert_eq!(claims["iss"], KEY);
    claims
}

async fn grant(client: &mut Client, nonce: u32) -> Value {
    client
        .send(json!({
            "type": "voice_token", "nonce": nonce, "room": "spoofed",
            "identity": "spoofed", "canPublishData": true,
        }))
        .await;
    let response = client.until("voice_token_result").await;
    assert_eq!(response["nonce"], nonce);
    assert_eq!(response["result"]["status"], "ok");
    assert_eq!(response["result"]["url"], "ws://127.0.0.1:7880/");
    let claims = claims(response["result"]["token"].as_str().unwrap());
    assert_eq!(claims["exp"], response["result"]["expires_at"]);
    assert_eq!(
        claims["exp"].as_u64().unwrap() - claims["nbf"].as_u64().unwrap(),
        60
    );
    assert_eq!(
        claims["video"],
        json!({
            "room": claims["video"]["room"], "roomJoin": true, "canSubscribe": true,
            "canPublish": true, "canPublishSources": ["microphone"], "canPublishData": false,
        })
    );
    assert!(claims["sub"].as_str().unwrap().starts_with("m-"));
    claims
}

async fn expect_removal(removals: &mut mpsc::Receiver<Value>, grant: &Value) {
    let removal = tokio::time::timeout(Duration::from_secs(3), removals.recv())
        .await
        .expect("LiveKit removal must not wait for the room actor")
        .unwrap();
    assert_eq!(
        removal,
        json!({ "room": grant["video"]["room"], "identity": grant["sub"] })
    );
}

#[tokio::test]
async fn voice_is_opt_in_and_uses_an_isolated_error_channel() {
    let server = TestServer::new(Config::default()).await;
    let mut client = server.connect().await;
    client.send(json!({"type":"voice_token","nonce":7})).await;
    let response = client.until("voice_token_result").await;
    assert_eq!(response["nonce"], 7);
    assert_eq!(
        response["result"],
        json!({"status":"error","code":"not_in_room"})
    );
    client.send(json!({"type":"take_seat"})).await;
    client.error("not_in_room").await;

    let (mut host, joined) = server.create("Host").await;
    assert_eq!(joined["voice_enabled"], false);
    host.send(json!({"type":"voice_token","nonce":8})).await;
    assert_eq!(
        host.until("voice_token_result").await["result"],
        json!({"status":"error","code":"voice_disabled"})
    );
    host.send(json!({"type":"ping","nonce":8})).await;
    assert_eq!(host.until("pong").await["nonce"], 8);
}

#[tokio::test]
async fn voice_grants_follow_membership_and_cleanup_targets_only_the_revoked_attempt() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let (removed, mut removals) = mpsc::channel::<Value>(8);
    let room_service = Router::new()
        .route(
            "/twirp/livekit.RoomService/RemoveParticipant",
            post(
                async |State(removed): State<mpsc::Sender<Value>>,
                       headers: HeaderMap,
                       Json(body): Json<Value>| {
                    let bearer = headers["authorization"]
                        .to_str()
                        .unwrap()
                        .strip_prefix("Bearer ")
                        .unwrap();
                    assert_eq!(
                        claims(bearer)["video"],
                        json!({ "room": body["room"], "roomAdmin": true })
                    );
                    removed.send(body).await.unwrap();
                    Json(json!({}))
                },
            ),
        )
        .with_state(removed);
    let service = tokio::spawn(async move {
        axum::serve(listener, room_service).await.unwrap();
    });
    let voice = VoiceConfig::new("ws://127.0.0.1:7880", &url, KEY, SECRET, "test").unwrap();
    let server = TestServer::new(Config {
        voice: Some(voice),
        game_seed: Some(42),
        ..Config::default()
    })
    .await;
    let (mut host, joined) = server.create("Host").await;
    let code = joined["room_code"].as_str().unwrap();
    assert_eq!(joined["voice_enabled"], true);
    let host_voice = grant(&mut host, 1).await;
    let _guest_a = server.join(code, "A").await;
    let _guest_b = server.join(code, "B").await;
    let _guest_c = server.join(code, "C").await;
    host.send(json!({"type":"start_game"})).await;
    host.state(|room| room["phase"] == "playing").await;

    let (mut spectator, spectator_joined) = server.join(code, "Spectator").await;
    let me = spectator_joined["room"]["you"].as_str().unwrap();
    assert!(
        spectator_joined["room"]["members"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["id"] == me && m["role"] == "spectator")
    );
    let spectator_voice = grant(&mut spectator, 1).await;
    assert_eq!(
        host_voice["video"]["room"],
        spectator_voice["video"]["room"]
    );

    let mut replacement = server.connect().await;
    replacement
        .send(json!({"type":"rejoin_room","room_code":code,"token":spectator_joined["token"]}))
        .await;
    assert_eq!(replacement.until("joined").await["room"]["you"], me);
    let replacement_voice = grant(&mut replacement, 1).await;
    assert_ne!(spectator_voice["sub"], replacement_voice["sub"]);
    loop {
        if let Message::Close(Some(frame)) = spectator.0.next().await.unwrap().unwrap() {
            assert_eq!(u16::from(frame.code), 4001);
            break;
        }
    }
    expect_removal(&mut removals, &spectator_voice).await;

    host.send(json!({"type":"end_game"})).await;
    replacement.state(|room| room["phase"] == "waiting").await;
    assert!(
        removals.try_recv().is_err(),
        "Changing phase must not remove a voice participant"
    );
    replacement
        .send(json!({"type":"voice_leave","nonce":2}))
        .await;
    assert_eq!(
        replacement.until("voice_leave_result").await,
        json!({
            "type":"voice_leave_result","v":protocol::PROTOCOL_VERSION,"nonce":2,"error":null
        })
    );
    expect_removal(&mut removals, &replacement_voice).await;
    replacement.send(json!({"type":"take_seat"})).await;
    replacement
        .state(|room| {
            room["members"]
                .as_array()
                .unwrap()
                .iter()
                .any(|m| m["id"] == me && m["role"] == "player")
        })
        .await;

    let (mut other_room, _) = server.create("Other").await;
    let other_voice = grant(&mut other_room, 1).await;
    assert_ne!(host_voice["video"]["room"], other_voice["video"]["room"]);
    host.send(json!({"type":"leave_room"})).await;
    host.until("left").await;
    expect_removal(&mut removals, &host_voice).await;
    other_room.disconnect().await;
    expect_removal(&mut removals, &other_voice).await;
    service.abort();
}
