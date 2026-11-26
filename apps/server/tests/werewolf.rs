#[allow(dead_code)]
mod support;
use protocol::{GameView, werewolf::WerewolfView};
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde_json::{Value, json};
use server::Config;
use std::time::Duration;
use support::{Client, TestServer};
use werewolf::{Action, Event, GameState, PlayerId, Role, RoleDeck, Settings};

fn is_awaited(state: &GameState, player: PlayerId) -> bool {
    werewolf::decision(state).is_some_and(|d| d.awaited.contains(&player))
}

fn snapshot(state: &GameState, player: Option<usize>) -> Value {
    let view = match player.filter(|i| state.players[*i].alive || is_awaited(state, PlayerId(*i))) {
        Some(i) => WerewolfView::Player(werewolf::view(state, PlayerId(i)).unwrap()),
        None => WerewolfView::Spectator(werewolf::spectator_view(state)),
    };
    serde_json::to_value(GameView::Werewolf(view)).unwrap()
}

fn check_wire(message: &Value) {
    let text = message.to_string();
    for private in [
        "night_bodyguard_target",
        "night_wolf_target",
        "night_witch_healed",
        "night_witch_poison",
        "wolves_diseased",
        "visibility",
    ] {
        assert!(
            !text.contains(&format!("\"{private}\":")),
            "Raw state/event leaked: {private}"
        );
    }
}

async fn setup_werewolf_room(
    server: &TestServer,
    count: usize,
    settings: Settings,
) -> (Vec<Client>, Vec<Value>, String) {
    let mut host = server.connect().await;
    host.send(json!({"type":"create_room","game":"werewolf","nickname":"Host"}))
        .await;
    let first = host.until("joined").await;
    let code = first["room_code"].as_str().unwrap().to_owned();

    let mut clients = vec![host];
    let mut joined = vec![first];
    for i in 1..count {
        let (client, data) = server.join(&code, &format!("P{i}")).await;
        clients.push(client);
        joined.push(data);
    }

    // Wait for host to observe all seated players before updating settings.
    clients[0]
        .state(|room| {
            room["members"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|m| m["role"] == "player")
                .count()
                == count
        })
        .await;

    clients[0]
        .send(json!({
            "type": "update_settings",
            "settings": { "game": "werewolf", "payload": settings }
        }))
        .await;
    clients[0]
        .state(|room| room["settings"]["payload"] == serde_json::to_value(settings).unwrap())
        .await;

    clients[0].send(json!({"type":"start_game"})).await;
    (clients, joined, code)
}

async fn assert_events_and_view(
    client: &mut Client,
    kind: &str,
    state: &GameState,
    events: &[Event],
    player: Option<usize>,
    seq: u32,
) {
    let msg = client.until(kind).await;
    check_wire(&msg);
    assert_eq!(msg["seq"], seq);
    let recipient = player
        .map(PlayerId)
        .filter(|id| state.players[id.0].alive || is_awaited(state, *id));
    let expected_events = serde_json::to_value(werewolf::filter_events(events, recipient)).unwrap();
    assert_eq!(msg["update"]["game"], "werewolf");
    assert_eq!(msg["update"]["events"], expected_events);
    assert_eq!(msg["update"]["view"], snapshot(state, player)["payload"]);
}

#[tokio::test]
async fn werewolf_websocket_hunter_shot_rejoin_and_privacy() {
    let seed = 4242;
    let server = TestServer::new(Config {
        game_seed: Some(seed),
        ..Config::default()
    })
    .await;

    let mut deck = RoleDeck::empty();
    deck.werewolf = 1;
    deck.hunter = 1;
    deck.seer = 1;
    deck.villager = 2;
    let settings = Settings {
        roles: deck,
        reveal_role_on_death: false,
    };

    let (mut clients, joined, code) = setup_werewolf_room(&server, 5, settings).await;

    let mut rng = ChaCha8Rng::seed_from_u64(seed);
    let (mut state, setup_events) = werewolf::setup(5, settings, &mut rng).unwrap();

    for (i, client) in clients.iter_mut().enumerate() {
        let started = client.until("game_started").await;
        check_wire(&started);
        assert_eq!(started["seq"], 0);
        assert_eq!(started["view"], snapshot(&state, Some(i)));
        assert_events_and_view(client, "game_update", &state, &setup_events, Some(i), 0).await;
    }
    // Join a spectator once the game has started; verify spectator snapshot hides secrets and night step.
    let (mut spectator, spec_joined) = server.join(&code, "Watcher").await;
    check_wire(&spec_joined);
    assert_eq!(spec_joined["game"]["seq"], 0);
    assert_eq!(spec_joined["game"]["view"], snapshot(&state, None));
    assert_eq!(
        spec_joined["game"]["view"]["payload"]["perspective"],
        "spectator"
    );

    let wolf = state
        .players
        .iter()
        .find(|p| p.role == Role::Werewolf)
        .unwrap()
        .id;
    let hunter = state
        .players
        .iter()
        .find(|p| p.role == Role::Hunter)
        .unwrap()
        .id;
    let seer = state
        .players
        .iter()
        .find(|p| p.role == Role::Seer)
        .unwrap()
        .id;
    let villager = state
        .players
        .iter()
        .find(|p| p.role == Role::Villager)
        .unwrap()
        .id;

    // Verify illegal action from a non-awaited player returns illegal_action without advancing seq.
    clients[villager.0]
        .send(json!({
            "type": "game_action",
            "action": { "game": "werewolf", "payload": { "type": "seer_inspect", "target": wolf } }
        }))
        .await;
    clients[villager.0].error("illegal_action").await;

    // Night 1: Wolf kills Hunter, Seer inspects Villager -> Dawn enters HunterShot!
    let mut seq = 0u32;
    for (actor, action) in [
        (
            wolf,
            Action::WolfVote {
                target: hunter,
                infect: false,
            },
        ),
        (seer, Action::SeerInspect { target: villager }),
    ] {
        let events = werewolf::apply(&mut state, actor, action.clone(), &mut rng).unwrap();
        seq += 1;
        clients[actor.0]
            .send(json!({
                "type": "game_action",
                "action": { "game": "werewolf", "payload": action }
            }))
            .await;
        for (i, client) in clients.iter_mut().enumerate() {
            assert_events_and_view(client, "game_update", &state, &events, Some(i), seq).await;
        }
        assert_events_and_view(&mut spectator, "game_update", &state, &events, None, seq).await;
    }

    // Verify Hunter is dead, yet received Player view with can_act == true (not Spectator!).
    assert!(!state.players[hunter.0].alive);
    assert!(is_awaited(&state, hunter));

    // Hunter disconnects and rejoins during HunterShot: must STILL receive Player view with can_act == true!
    clients[hunter.0].disconnect().await;
    let mut hunter_rejoined = server.connect().await;
    hunter_rejoined
        .send(json!({
            "type": "rejoin_room",
            "room_code": code,
            "token": joined[hunter.0]["token"]
        }))
        .await;
    let rejoined_msg = hunter_rejoined.until("joined").await;
    check_wire(&rejoined_msg);
    assert_eq!(rejoined_msg["game"]["seq"], seq);
    assert_eq!(
        rejoined_msg["game"]["view"],
        snapshot(&state, Some(hunter.0))
    );
    assert_eq!(
        rejoined_msg["game"]["view"]["payload"]["perspective"],
        "player"
    );
    assert_eq!(
        rejoined_msg["game"]["view"]["payload"]["view"]["can_act"],
        true
    );
    clients[hunter.0] = hunter_rejoined;

    // Hunter shoots Villager over WebSocket -> advances to DayVote, Hunter becomes Spectator!
    let shoot = Action::HunterShoot { target: villager };
    let shoot_events = werewolf::apply(&mut state, hunter, shoot.clone(), &mut rng).unwrap();
    seq += 1;
    clients[hunter.0]
        .send(json!({
            "type": "game_action",
            "action": { "game": "werewolf", "payload": shoot }
        }))
        .await;
    for (i, client) in clients.iter_mut().enumerate() {
        assert_events_and_view(client, "game_update", &state, &shoot_events, Some(i), seq).await;
    }
    assert_events_and_view(
        &mut spectator,
        "game_update",
        &state,
        &shoot_events,
        None,
        seq,
    )
    .await;

    // Verify living player can also rejoin mid-DayVote and get exact Player snapshot.
    clients[seer.0].disconnect().await;
    let mut seer_rejoined = server.connect().await;
    seer_rejoined
        .send(json!({
            "type": "rejoin_room",
            "room_code": code,
            "token": joined[seer.0]["token"]
        }))
        .await;
    let seer_msg = seer_rejoined.until("joined").await;
    assert_eq!(seer_msg["game"]["seq"], seq);
    assert_eq!(seer_msg["game"]["view"], snapshot(&state, Some(seer.0)));
    clients[seer.0] = seer_rejoined;

    // Day 1: remaining living players lynch the Werewolf -> GameOver (Village wins).
    let living: Vec<PlayerId> = state
        .players
        .iter()
        .filter(|p| p.alive)
        .map(|p| p.id)
        .collect();
    for (idx, voter) in living.iter().copied().enumerate() {
        let vote = Action::DayVote { target: Some(wolf) };
        let evs = werewolf::apply(&mut state, voter, vote.clone(), &mut rng).unwrap();
        seq += 1;
        clients[voter.0]
            .send(json!({
                "type": "game_action",
                "action": { "game": "werewolf", "payload": vote }
            }))
            .await;
        let kind = if idx + 1 == living.len() {
            "game_over"
        } else {
            "game_update"
        };
        for (i, client) in clients.iter_mut().enumerate() {
            assert_events_and_view(client, kind, &state, &evs, Some(i), seq).await;
        }
        assert_events_and_view(&mut spectator, kind, &state, &evs, None, seq).await;
    }

    assert_eq!(state.winner, Some(werewolf::Winner::Village));

    // Host ends the game -> returns room to waiting phase.
    clients[0].send(json!({"type": "end_game"})).await;
    let waiting = clients[0].state(|room| room["phase"] == "waiting").await;
    assert_eq!(waiting["game"], "werewolf");
}

#[tokio::test(start_paused = true)]
async fn werewolf_websocket_offline_default_action_and_abandoned_stop() {
    let seed = 777;
    let server = TestServer::new(Config {
        game_seed: Some(seed),
        offline_timeout: Duration::from_secs(5),
        empty_room_timeout: Duration::from_secs(600),
        ..Config::default()
    })
    .await;

    let settings = Settings::default();
    let (mut clients, _joined, _code) = setup_werewolf_room(&server, 5, settings).await;

    let mut rng = ChaCha8Rng::seed_from_u64(seed);
    let (mut state, _) = werewolf::setup(5, settings, &mut rng).unwrap();
    for client in &mut clients {
        client.until("game_started").await;
        client.until("game_update").await;
    }

    // Disconnect the currently awaited Night 1 actor (Bodyguard).
    let (awaited, default_act) = werewolf::default_action(&state).unwrap();
    let observer = (awaited.0 + 1) % 5;
    clients[awaited.0].disconnect().await;
    clients[observer]
        .state(|room| !room["members"][awaited.0]["online"].as_bool().unwrap())
        .await;

    // Advance paused clock past offline_turn_grace -> server applies default_action automatically.
    tokio::time::advance(Duration::from_secs(6)).await;
    let expected_events = werewolf::apply(&mut state, awaited, default_act, &mut rng).unwrap();
    assert_events_and_view(
        &mut clients[observer],
        "game_update",
        &state,
        &expected_events,
        Some(observer),
        1,
    )
    .await;

    // Disconnect all remaining players -> abandoned game must not spin forever.
    for (i, mut client) in clients.into_iter().enumerate() {
        if i != awaited.0 {
            client.disconnect().await;
        }
    }
    tokio::time::advance(Duration::from_secs(30)).await;
    // Server remains healthy and responsive.
    let mut probe = server.connect().await;
    probe.send(json!({"type":"ping","nonce":1})).await;
    let pong = probe.until("pong").await;
    assert_eq!(pong["nonce"], 1);
}
