use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use server::Config;
use std::time::Duration;
use tokio::{net::TcpStream, task::JoinHandle};
use tokio_tungstenite::{
    MaybeTlsStream, WebSocketStream, connect_async,
    tungstenite::{self, Message, client::IntoClientRequest},
};

struct TestServer {
    url: String,
    task: JoinHandle<()>,
    clock_guard: JoinHandle<()>,
}

impl TestServer {
    async fn new(config: Config) -> Self {
        // Real socket I/O must not make Tokio auto-advance the paused clock.
        let clock_guard = tokio::spawn(async {
            loop {
                tokio::task::yield_now().await;
            }
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("ws://{}/ws", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            axum::serve(listener, server::app(config)).await.unwrap();
        });
        Self {
            url,
            task,
            clock_guard,
        }
    }
    async fn connect(&self) -> Client {
        Client(connect_async(&self.url).await.unwrap().0)
    }
    async fn create(&self, name: &str) -> (Client, Value) {
        let mut client = self.connect().await;
        client
            .send(json!({"type":"create_room","nickname":name}))
            .await;
        let joined = client.until("joined").await;
        (client, joined)
    }
    async fn join(&self, code: &str, name: &str) -> (Client, Value) {
        let mut client = self.connect().await;
        client
            .send(json!({"type":"join_room","room_code":code,"nickname":name}))
            .await;
        let joined = client.until("joined").await;
        (client, joined)
    }
}
impl Drop for TestServer {
    fn drop(&mut self) {
        self.task.abort();
        self.clock_guard.abort();
    }
}

struct Client(WebSocketStream<MaybeTlsStream<TcpStream>>);
impl Client {
    async fn send(&mut self, mut value: Value) {
        value["v"] = json!(1);
        self.0
            .send(Message::Text(value.to_string().into()))
            .await
            .unwrap();
    }
    async fn receive(&mut self) -> Value {
        let text = self.0.next().await.unwrap().unwrap().into_text().unwrap();
        let value: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["v"], 1);
        if value["type"] == "room_state" {
            assert!(
                !text.contains("token"),
                "A public snapshot must not contain session tokens"
            );
        }
        value
    }
    async fn until(&mut self, kind: &str) -> Value {
        loop {
            let value = self.receive().await;
            assert_ne!(value["type"], "error", "Unexpected error: {value}");
            if value["type"] == kind {
                return value;
            }
        }
    }
    async fn error(&mut self, code: &str) {
        loop {
            let value = self.receive().await;
            if value["type"] == "error" {
                assert_eq!(value["code"], code);
                return;
            }
            assert_eq!(value["type"], "room_state");
        }
    }
    async fn state(&mut self, predicate: impl Fn(&Value) -> bool) -> Value {
        loop {
            let value = self.until("room_state").await;
            if predicate(&value["room"]) {
                return value["room"].clone();
            }
        }
    }
    async fn disconnect(&mut self) {
        self.0.close(None).await.unwrap();
        loop {
            if matches!(self.0.next().await.unwrap().unwrap(), Message::Close(_)) {
                break;
            }
        }
    }
}

fn member<'a>(room: &'a Value, id: &str) -> &'a Value {
    room["members"]
        .as_array()
        .unwrap()
        .iter()
        .find(|member| member["id"] == id)
        .unwrap()
}
fn code(joined: &Value) -> &str {
    joined["room_code"].as_str().unwrap()
}
fn you(joined: &Value) -> &str {
    joined["room"]["you"].as_str().unwrap()
}

#[tokio::test(start_paused = true)]
async fn joining_validates_names_sessions_and_membership() {
    let server = TestServer::new(Config::default()).await;
    let (mut host, joined) = server.create("  Hân  ").await;
    let room_code = code(&joined);
    assert_eq!(room_code.len(), 5);
    assert!(
        room_code
            .bytes()
            .all(|c| b"23456789ABCDEFGHJKMNPQRSTUVWXYZ".contains(&c))
    );
    assert_eq!(joined["token"].as_str().unwrap().len(), 32);
    assert_eq!(member(&joined["room"], you(&joined))["nickname"], "Hân");
    assert_eq!(joined["room"]["host"], you(&joined));
    let mut guest = server.connect().await;
    for name in ["", "   ", "a\nb", &"ắ".repeat(21)] {
        guest
            .send(json!({"type":"join_room","room_code":room_code,"nickname":name}))
            .await;
        guest.error("invalid_nickname").await;
    }
    guest
        .send(json!({"type":"join_room","room_code":room_code,"nickname":"hÂN"}))
        .await;
    guest.error("nickname_taken").await;
    guest
        .send(json!({"type":"join_room","room_code":"not-a-code","nickname":"B"}))
        .await;
    guest.error("room_not_found").await;
    for token in ["bad", "00000000000000000000000000000000"] {
        guest
            .send(json!({"type":"rejoin_room","room_code":room_code,"token":token}))
            .await;
        guest.error("invalid_token").await;
    }
    guest.send(json!({"type":"take_seat"})).await;
    guest.error("not_in_room").await;
    guest
        .send(json!({"type":"join_room","room_code":room_code.to_lowercase(),"nickname":"B"}))
        .await;
    let other = guest.until("joined").await;
    assert_eq!(member(&other["room"], you(&other))["role"], "player");
    assert_ne!(other["token"], joined["token"]);
    let snapshot = host
        .state(|room| room["members"].as_array().unwrap().len() == 2)
        .await;
    assert_eq!(snapshot["you"], you(&joined));
    assert!(
        !snapshot
            .to_string()
            .contains(other["token"].as_str().unwrap())
    );
    assert!(
        !snapshot
            .to_string()
            .contains(joined["token"].as_str().unwrap())
    );
    host.send(json!({"type":"create_room","nickname":"Other"}))
        .await;
    host.error("already_in_room").await;
    guest.send(json!({"type":"leave_room"})).await;
    guest.until("left").await;
    guest
        .send(json!({"type":"rejoin_room","room_code":room_code,"token":other["token"]}))
        .await;
    guest.error("invalid_token").await;
    guest.send(json!({"type":"ping","nonce":7})).await;
    assert_eq!(guest.until("pong").await["nonce"], 7);
}

#[tokio::test(start_paused = true)]
async fn seats_game_lifecycle_and_host_permissions() {
    let server = TestServer::new(Config::default()).await;
    let (mut host, joined) = server.create("Host").await;
    let room_code = code(&joined);
    host.send(json!({"type":"start_game"})).await;
    host.error("not_enough_players").await;
    host.send(json!({"type":"end_game"})).await;
    host.error("wrong_phase").await;
    let mut guests = Vec::new();
    for i in 1..=7 {
        let (client, data) = server.join(room_code, &format!("P{i}")).await;
        assert_eq!(
            member(&data["room"], you(&data))["role"],
            if i < 7 { "player" } else { "spectator" }
        );
        guests.push(client);
    }
    guests[0].send(json!({"type":"start_game"})).await;
    guests[0].error("not_host").await;
    guests[6].send(json!({"type":"take_seat"})).await;
    guests[6].error("no_free_seat").await;
    host.send(json!({"type":"start_game"})).await;
    host.state(|room| room["phase"] == "playing").await;
    host.send(json!({"type":"start_game"})).await;
    host.error("wrong_phase").await;
    let (mut spectator, data) = server.join(room_code, "Late").await;
    assert_eq!(member(&data["room"], you(&data))["role"], "spectator");
    spectator.send(json!({"type":"take_seat"})).await;
    spectator.error("wrong_phase").await;
    spectator.send(json!({"type":"end_game"})).await;
    spectator.error("not_host").await;
    host.send(json!({"type":"end_game"})).await;
    let waiting = host.state(|room| room["phase"] == "waiting").await;
    assert!(
        waiting["members"]
            .as_array()
            .unwrap()
            .iter()
            .all(|m| m["role"] == "spectator")
    );
    host.send(json!({"type":"start_game"})).await;
    host.error("not_enough_players").await;
    host.send(json!({"type":"take_seat"})).await;
    host.state(|room| member(room, you(&joined))["role"] == "player")
        .await;
    guests[1].send(json!({"type":"take_seat"})).await;
    let state = guests[1]
        .state(|room| member(room, "3")["role"] == "player")
        .await;
    assert_eq!(state["you"], "3");
    host.send(json!({"type":"leave_room"})).await;
    host.until("left").await;
    // P1 joined earlier but is a spectator, so the online player P2 inherits.
    guests[1].state(|room| room["host"] == "3").await;
    spectator.send(json!({"type":"take_seat"})).await;
    spectator
        .state(|room| member(room, you(&data))["role"] == "player")
        .await;
}

#[tokio::test(start_paused = true)]
async fn rejoin_preserves_identity_and_closes_the_previous_connection() {
    let server = TestServer::new(Config::default()).await;
    let (mut original, joined) = server.create("Host").await;
    let (mut observer, _) = server.join(code(&joined), "Observer").await;
    original.disconnect().await;
    observer
        .state(|room| member(room, you(&joined))["online"] == false)
        .await;
    tokio::time::advance(Duration::from_secs(59)).await;
    let mut restored = server.connect().await;
    restored
        .send(json!({"type":"rejoin_room","room_code":code(&joined),"token":joined["token"]}))
        .await;
    let rejoined = restored.until("joined").await;
    assert_eq!(rejoined["token"], joined["token"]);
    assert_eq!(you(&rejoined), you(&joined));
    assert_eq!(member(&rejoined["room"], you(&joined))["role"], "player");
    observer
        .state(|room| member(room, you(&joined))["online"] == true)
        .await;
    let mut replacement = server.connect().await;
    replacement
        .send(json!({"type":"rejoin_room","room_code":code(&joined),"token":joined["token"]}))
        .await;
    assert_eq!(you(&replacement.until("joined").await), you(&joined));
    loop {
        match restored.0.next().await.unwrap().unwrap() {
            Message::Close(frame) => {
                assert_eq!(
                    frame.unwrap().code,
                    tungstenite::protocol::frame::coding::CloseCode::Library(4001)
                );
                break;
            }
            Message::Text(_) => {}
            other => panic!("Unexpected frame: {other:?}"),
        }
    }
    observer
        .state(|room| member(room, you(&joined))["online"] == true)
        .await;
    tokio::time::advance(Duration::from_secs(61)).await;
    replacement.send(json!({"type":"start_game"})).await;
    replacement.error("not_enough_players").await;
    replacement.send(json!({"type":"ping","nonce":42})).await;
    assert_eq!(replacement.until("pong").await["nonce"], 42);
}

#[tokio::test(start_paused = true)]
async fn offline_waiting_members_expire_and_transfer_host() {
    let server = TestServer::new(Config::default()).await;
    let (mut host, joined) = server.create("Host").await;
    let (mut other, other_joined) = server.join(code(&joined), "Other").await;
    host.disconnect().await;
    other
        .state(|room| member(room, you(&joined))["online"] == false)
        .await;
    tokio::time::advance(Duration::from_secs(60)).await;
    let state = other
        .state(|room| room["members"].as_array().unwrap().len() == 1)
        .await;
    assert_eq!(state["host"], you(&other_joined));
    let mut expired = server.connect().await;
    expired
        .send(json!({"type":"rejoin_room","room_code":code(&joined),"token":joined["token"]}))
        .await;
    expired.error("invalid_token").await;
}

#[tokio::test(start_paused = true)]
async fn playing_keeps_offline_player_seats_but_expires_spectators() {
    let server = TestServer::new(Config::default()).await;
    let (mut host, joined) = server.create("Host").await;
    let (mut next_host, next) = server.join(code(&joined), "Next").await;
    let (mut player, player_data) = server.join(code(&joined), "Player").await;
    let (_fourth, _) = server.join(code(&joined), "Fourth").await;
    host.send(json!({"type":"start_game"})).await;
    host.state(|room| room["phase"] == "playing").await;
    let (mut spectator, spectator_data) = server.join(code(&joined), "Spectator").await;
    host.disconnect().await;
    player.disconnect().await;
    spectator.disconnect().await;
    next_host
        .state(|room| {
            room["members"]
                .as_array()
                .unwrap()
                .iter()
                .any(|m| m["id"] == you(&spectator_data) && m["online"] == false)
        })
        .await;
    let mut returning_spectator = server.connect().await;
    returning_spectator
        .send(
            json!({"type":"rejoin_room","room_code":code(&joined),"token":spectator_data["token"]}),
        )
        .await;
    let returned = returning_spectator.until("joined").await;
    assert_eq!(you(&returned), you(&spectator_data));
    assert_eq!(
        member(&returned["room"], you(&returned))["role"],
        "spectator"
    );
    next_host
        .state(|room| member(room, you(&spectator_data))["online"] == true)
        .await;
    returning_spectator.disconnect().await;
    next_host
        .state(|room| member(room, you(&spectator_data))["online"] == false)
        .await;
    tokio::time::advance(Duration::from_secs(60)).await;
    let state = next_host
        .state(|room| room["members"].as_array().unwrap().len() == 4 && room["host"] == you(&next))
        .await;
    assert_eq!(member(&state, you(&joined))["online"], false);
    assert_eq!(member(&state, you(&joined))["role"], "player");
    assert_eq!(member(&state, you(&player_data))["role"], "player");
    let mut restored = server.connect().await;
    restored
        .send(json!({"type":"rejoin_room","room_code":code(&joined),"token":joined["token"]}))
        .await;
    let state = restored.until("joined").await;
    assert_eq!(you(&state), you(&joined));
    assert_eq!(state["room"]["host"], you(&next));
    next_host.send(json!({"type":"end_game"})).await;
    next_host
        .state(|room| room["phase"] == "waiting" && room["members"].as_array().unwrap().len() == 3)
        .await;
}

#[tokio::test(start_paused = true)]
async fn resource_limits_and_empty_room_cleanup_use_virtual_time() {
    let server = TestServer::new(Config {
        max_members: 2,
        max_rooms: 1,
        ..Config::default()
    })
    .await;
    let (mut host, joined) = server.create("Host").await;
    let (mut guest, _) = server.join(code(&joined), "Guest").await;
    let mut extra = server.connect().await;
    extra
        .send(json!({"type":"join_room","room_code":code(&joined),"nickname":"Extra"}))
        .await;
    extra.error("server_busy").await;
    extra
        .send(json!({"type":"create_room","nickname":"Extra"}))
        .await;
    extra.error("server_busy").await;
    host.send(json!({"type":"leave_room"})).await;
    host.until("left").await;
    guest.send(json!({"type":"leave_room"})).await;
    guest.until("left").await;
    tokio::time::advance(Duration::from_secs(599)).await;
    extra
        .send(json!({"type":"create_room","nickname":"Extra"}))
        .await;
    extra.error("server_busy").await;
    tokio::time::advance(Duration::from_secs(1)).await;
    extra
        .send(json!({"type":"join_room","room_code":code(&joined),"nickname":"Extra"}))
        .await;
    extra.error("room_not_found").await;
    extra
        .send(json!({"type":"create_room","nickname":"Extra"}))
        .await;
    extra.until("joined").await;
}

#[tokio::test(start_paused = true)]
async fn websocket_origin_and_size_limits() {
    let server = TestServer::new(Config {
        allowed_origins: vec!["https://trusted.example".into()],
        ..Config::default()
    })
    .await;
    let authority = server
        .url
        .strip_prefix("ws://")
        .unwrap()
        .strip_suffix("/ws")
        .unwrap();
    for origin in [
        format!("http://{authority}"),
        format!("https://{authority}"),
        "https://trusted.example".into(),
    ] {
        let mut request = server.url.as_str().into_client_request().unwrap();
        request
            .headers_mut()
            .insert("origin", origin.parse().unwrap());
        let (mut socket, _) = connect_async(request).await.unwrap();
        socket.close(None).await.unwrap();
    }
    for origin in [
        "https://evil.example".to_owned(),
        "null".into(),
        format!("http://{authority}.evil"),
    ] {
        let mut request = server.url.as_str().into_client_request().unwrap();
        request
            .headers_mut()
            .insert("origin", origin.parse().unwrap());
        match connect_async(request).await {
            Err(tungstenite::Error::Http(response)) => assert_eq!(response.status(), 403),
            _ => panic!("Wrong origin must be rejected"),
        }
    }
    let mut oversized = server.connect().await;
    let _ = oversized
        .0
        .send(Message::Text("x".repeat(16 * 1024 + 1).into()))
        .await;
    assert!(matches!(
        oversized.0.next().await,
        None | Some(Err(_)) | Some(Ok(Message::Close(_)))
    ));

    use tungstenite::protocol::frame::{
        Frame,
        coding::{Data, OpCode},
    };
    let mut fragmented = server.connect().await;
    fragmented
        .0
        .send(Message::Frame(Frame::message(
            vec![b'a'; 9000],
            OpCode::Data(Data::Text),
            false,
        )))
        .await
        .unwrap();
    let _ = fragmented
        .0
        .send(Message::Frame(Frame::message(
            vec![b'a'; 9000],
            OpCode::Data(Data::Continue),
            true,
        )))
        .await;
    assert!(matches!(
        fragmented.0.next().await,
        None | Some(Err(_)) | Some(Ok(Message::Close(_)))
    ));
    let mut healthy = server.connect().await;
    healthy.send(json!({"type":"ping","nonce":1})).await;
    healthy.until("pong").await;
}

#[tokio::test(start_paused = true)]
async fn empty_playing_rooms_expire_even_with_reserved_player_seats() {
    let server = TestServer::new(Config {
        max_rooms: 1,
        ..Config::default()
    })
    .await;
    let (mut host, joined) = server.create("Host").await;
    let mut players = Vec::new();
    for i in 0..3 {
        players.push(server.join(code(&joined), &format!("P{i}")).await);
    }
    host.send(json!({"type":"start_game"})).await;
    host.state(|room| room["phase"] == "playing").await;
    for (client, data) in &mut players {
        client.disconnect().await;
        host.state(|room| member(room, you(data))["online"] == false)
            .await;
    }
    host.send(json!({"type":"leave_room"})).await;
    host.until("left").await;
    tokio::time::advance(Duration::from_secs(599)).await;
    let mut extra = server.connect().await;
    extra
        .send(json!({"type":"create_room","nickname":"Extra"}))
        .await;
    extra.error("server_busy").await;
    tokio::time::advance(Duration::from_secs(1)).await;
    extra
        .send(json!({"type":"rejoin_room","room_code":code(&joined),"token":players[0].1["token"]}))
        .await;
    extra.error("room_not_found").await;
    extra
        .send(json!({"type":"create_room","nickname":"Extra"}))
        .await;
    extra.until("joined").await;
}

#[tokio::test(start_paused = true)]
async fn create_room_delivers_joined_then_initial_snapshot() {
    let server = TestServer::new(Config::default()).await;
    let mut client = server.connect().await;
    client
        .send(json!({"type":"create_room","nickname":"Host"}))
        .await;
    let first = client.0.next().await.unwrap().unwrap();
    assert!(
        matches!(first, Message::Text(_)),
        "Expected joined, received {first:?}"
    );
    let joined: Value = serde_json::from_str(first.to_text().unwrap()).unwrap();
    assert_eq!(joined["type"], "joined");
    let state = client.receive().await;
    assert_eq!(state["type"], "room_state");
    assert_eq!(state["room"], joined["room"]);
    client.send(json!({"type":"ping","nonce":9})).await;
    assert_eq!(client.until("pong").await["nonce"], 9);
}
