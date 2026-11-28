mod support;
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use server::Config;
use std::time::Duration;
use support::TestServer;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{self, Message, client::IntoClientRequest},
};

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
    assert_eq!(joined["room"]["game"], "bang");
    assert_eq!(joined["room"]["min_players"], 4);
    assert_eq!(joined["room"]["max_players"], 7);
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
    assert_eq!(other["room"]["game"], joined["room"]["game"]);
    assert_eq!(member(&other["room"], you(&other))["role"], "player");
    assert_ne!(other["token"], joined["token"]);
    let snapshot = host
        .state(|room| room["members"].as_array().unwrap().len() == 2)
        .await;
    assert_eq!(snapshot["game"], "bang");
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
    host.send(json!({"type":"create_room","game":"bang","nickname":"Other"}))
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
    assert_eq!(rejoined["room"]["game"], "bang");
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
async fn host_can_transfer_host_to_online_member() {
    let server = TestServer::new(Config::default()).await;
    let (mut host, joined) = server.create("Host").await;
    let (mut guest, data) = server.join(code(&joined), "P1").await;
    let guest_id = you(&data).to_string();
    guest
        .send(json!({"type":"transfer_host","member":you(&joined)}))
        .await;
    guest.error("not_host").await;
    host.send(json!({"type":"transfer_host","member":"999"}))
        .await;
    host.error("invalid_message").await;
    host.send(json!({"type":"transfer_host","member":guest_id}))
        .await;
    guest.state(|room| room["host"] == guest_id).await;
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
        .send(json!({"type":"create_room","game":"bang","nickname":"Extra"}))
        .await;
    extra.error("server_busy").await;
    host.send(json!({"type":"leave_room"})).await;
    host.until("left").await;
    guest.send(json!({"type":"leave_room"})).await;
    guest.until("left").await;
    tokio::time::advance(Duration::from_secs(599)).await;
    extra
        .send(json!({"type":"create_room","game":"bang","nickname":"Extra"}))
        .await;
    extra.error("server_busy").await;
    tokio::time::advance(Duration::from_secs(1)).await;
    extra
        .send(json!({"type":"join_room","room_code":code(&joined),"nickname":"Extra"}))
        .await;
    extra.error("room_not_found").await;
    extra
        .send(json!({"type":"create_room","game":"bang","nickname":"Extra"}))
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
        .send(json!({"type":"create_room","game":"bang","nickname":"Extra"}))
        .await;
    extra.error("server_busy").await;
    tokio::time::advance(Duration::from_secs(1)).await;
    extra
        .send(json!({"type":"rejoin_room","room_code":code(&joined),"token":players[0].1["token"]}))
        .await;
    extra.error("room_not_found").await;
    extra
        .send(json!({"type":"create_room","game":"bang","nickname":"Extra"}))
        .await;
    extra.until("joined").await;
}

#[tokio::test(start_paused = true)]
async fn create_room_delivers_joined_then_initial_snapshot() {
    let server = TestServer::new(Config::default()).await;
    let mut client = server.connect().await;
    client
        .send(json!({"type":"create_room","game":"bang","nickname":"Host"}))
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

#[tokio::test(start_paused = true)]
async fn change_game_checks_membership_host_phase_and_availability() {
    let server = TestServer::new(Config::default()).await;
    let (mut host, joined) = server.create("Host").await;
    let mut guest = server.connect().await;
    let change = json!({"type":"change_game","game":"uno"});
    guest.send(change.clone()).await;
    guest.error("not_in_room").await;
    guest
        .send(json!({"type":"join_room","room_code":code(&joined),"nickname":"Guest"}))
        .await;
    guest.until("joined").await;
    guest.send(change.clone()).await;
    guest.error("not_host").await;
    host.send(change.clone()).await;
    host.error("game_unavailable").await;

    let (_third, _) = server.join(code(&joined), "Third").await;
    let (_fourth, _) = server.join(code(&joined), "Fourth").await;
    let mut custom = joined["room"]["settings"].clone();
    custom["payload"]["mode"] = json!("club");
    host.send(json!({"type":"update_settings","settings":custom}))
        .await;
    let room = host.state(|room| room["settings"] == custom).await;
    assert_eq!(room["game"], "bang");
    host.send(json!({"type":"change_game","game":"bang"})).await;
    host.send(json!({"type":"ping","nonce":8})).await;
    assert_eq!(host.receive().await["type"], "pong");

    host.send(json!({"type":"start_game"})).await;
    host.until("game_started").await;
    let playing = host.state(|room| room["phase"] == "playing").await;
    assert_eq!(playing["settings"], custom);
    assert_eq!(playing["members"], room["members"]);
    host.send(change).await;
    host.error("wrong_phase").await;
    host.send(json!({"type":"end_game"})).await;
    let waiting = host.state(|room| room["phase"] == "waiting").await;
    assert_eq!(waiting["game"], "bang");
    assert_eq!(waiting["settings"], custom);
}

#[tokio::test(start_paused = true)]
async fn room_settings_are_host_only_validate_roles_and_reset_on_seat_changes() {
    let server = TestServer::new(Config {
        game_seed: Some(42),
        ..Default::default()
    })
    .await;
    let (mut host, joined) = server.create("Host").await;
    let defaults = json!({"game":"bang","payload":{"expansions":[],"mode":"classic","roles":{"deputy":0,"outlaw":2,"renegade":1}}});
    assert_eq!(joined["room"]["settings"], defaults);
    host.send(json!({"type":"update_settings","settings":{"game":"bang","payload":{"mode":"club","roles":{"deputy":1,"outlaw":1,"renegade":1}}}})).await;
    host.error("invalid_settings").await;
    let mut club = defaults.clone();
    club["payload"]["mode"] = json!("club");
    host.send(json!({"type":"update_settings","settings":club}))
        .await;
    host.state(|room| room["settings"] == club).await;
    let mut guests = Vec::new();
    for i in 1..4 {
        let (guest, data) = server.join(code(&joined), &format!("Guest{i}")).await;
        assert_eq!(data["room"]["settings"], club);
        guests.push(guest);
    }
    let custom = json!({"game":"bang","payload":{"expansions":[],"mode":"club","roles":{"deputy":1,"outlaw":1,"renegade":1}}});
    guests[0]
        .send(json!({"type":"update_settings","settings":custom}))
        .await;
    guests[0].error("not_host").await;
    for roles in [
        json!({"deputy":3,"outlaw":0,"renegade":0}),
        json!({"deputy":0,"outlaw":1,"renegade":1}),
        json!({"deputy":255,"outlaw":255,"renegade":255}),
    ] {
        host.send(json!({"type":"update_settings","settings":{"game":"bang","payload":{"mode":"club","roles":roles}}}))
            .await;
        host.error("invalid_settings").await;
        host.send(json!({"type":"ping","nonce":123})).await;
        assert_eq!(host.until("pong").await["nonce"], 123);
    }
    // Dodge City is accepted for a valid role split; the host can switch it off again.
    let mut dodge = custom.clone();
    dodge["payload"]["expansions"] = json!(["dodge_city"]);
    host.send(json!({"type":"update_settings","settings":dodge}))
        .await;
    host.state(|room| room["settings"] == dodge && room["max_players"] == 8)
        .await;
    // Legacy clients omit `expansions`; the room treats that as the plain base game.
    let mut legacy = custom.clone();
    legacy["payload"]
        .as_object_mut()
        .unwrap()
        .remove("expansions");
    host.send(json!({"type":"update_settings","settings":legacy}))
        .await;
    for guest in &mut guests {
        guest.state(|room| room["settings"] == custom).await;
    }
    let (mut fifth, fifth_data) = server.join(code(&joined), "Fifth").await;
    let five = json!({"game":"bang","payload":{"expansions":[],"mode":"club","roles":{"deputy":1,"outlaw":2,"renegade":1}}});
    assert_eq!(fifth_data["room"]["settings"], five);
    fifth.send(json!({"type":"leave_room"})).await;
    fifth.until("left").await;
    host.state(|room| room["settings"] == club).await;
    host.send(json!({"type":"update_settings","settings":custom}))
        .await;
    host.state(|room| room["settings"] == custom).await;
    guests[2].disconnect().await;
    host.state(|room| room["members"][3]["online"] == false)
        .await;
    tokio::time::advance(Duration::from_secs(60)).await;
    host.state(|room| room["members"].as_array().unwrap().len() == 3 && room["settings"] == club)
        .await;
    let (fourth, _) = server.join(code(&joined), "Fourth").await;
    guests[2] = fourth;
    host.send(json!({"type":"update_settings","settings":custom}))
        .await;
    host.state(|room| room["settings"] == custom).await;
    let mut rejoined = server.connect().await;
    rejoined
        .send(json!({"type":"rejoin_room","room_code":code(&joined),"token":joined["token"]}))
        .await;
    assert_eq!(rejoined.until("joined").await["room"]["settings"], custom);
    host = rejoined;
    host.send(json!({"type":"start_game"})).await;
    let mut counts = std::collections::BTreeMap::new();
    for client in std::iter::once(&mut host).chain(guests.iter_mut()) {
        let start = client.until("game_started").await;
        assert_eq!(start["view"]["payload"]["perspective"], "player");
        let own = &start["view"]["payload"]["view"];
        let role = own["table"]["players"][own["you"].as_u64().unwrap() as usize]["role"]
            .as_str()
            .unwrap();
        *counts.entry(role.to_owned()).or_insert(0) += 1;
    }
    assert_eq!(
        counts,
        std::collections::BTreeMap::from([
            ("sheriff".into(), 1),
            ("deputy".into(), 1),
            ("outlaw".into(), 1),
            ("renegade".into(), 1)
        ])
    );
    host.send(json!({"type":"update_settings","settings":custom}))
        .await;
    host.error("wrong_phase").await;
    host.send(json!({"type":"ping","nonce":456})).await;
    assert_eq!(host.until("pong").await["nonce"], 456);
    host.send(json!({"type":"end_game"})).await;
    host.state(|room| room["phase"] == "waiting" && room["settings"] == custom)
        .await;
    host.send(json!({"type":"take_seat"})).await;
    host.state(|room| room["settings"] == club).await;
}

#[tokio::test(start_paused = true)]
async fn disabled_games_and_mismatched_settings_reject_without_fallback() {
    let server = TestServer::new(Config {
        max_rooms: 1,
        ..Default::default()
    })
    .await;
    let mut client = server.connect().await;
    for game in ["uno"] {
        client
            .send(json!({"type":"create_room","game":game,"nickname":"Host"}))
            .await;
        client.error("game_unavailable").await;
        client.send(json!({"type":"ping","nonce":7})).await;
        assert_eq!(client.until("pong").await["nonce"], 7);
    }
    // Disabled games do not allocate rooms or attach the connection to one.
    client
        .send(json!({"type":"create_room","game":"bang","nickname":"Host"}))
        .await;
    let joined = client.until("joined").await;
    let settings = joined["room"]["settings"].clone();
    for game in ["uno"] {
        client
            .send(json!({"type":"update_settings","settings":{"game":game,"payload":{}}}))
            .await;
        client.error("invalid_settings").await;
        let (_, snapshot) = server.join(code(&joined), game).await;
        assert_eq!(snapshot["room"]["settings"], settings);
    }
    client.send(json!({"type":"ping","nonce":8})).await;
    assert_eq!(client.until("pong").await["nonce"], 8);
}
