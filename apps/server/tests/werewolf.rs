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

fn table_of(msg: &Value) -> &Value {
    let view = &msg["update"]["view"];
    if view["perspective"] == "player" {
        &view["view"]["table"]
    } else {
        &view["view"]
    }
}

async fn collect_updates_until_pong(client: &mut Client, nonce: u64) -> Vec<Value> {
    client.send(json!({"type": "ping", "nonce": nonce})).await;
    let mut updates = Vec::new();
    loop {
        let msg = client.receive().await;
        assert_ne!(msg["type"], "error", "Unexpected error: {msg}");
        match msg["type"].as_str() {
            Some("pong") if msg["nonce"] == nonce => return updates,
            Some("game_update" | "game_over") => updates.push(msg),
            _ => {}
        }
    }
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

    let mut player_seqs = [0u32; 5];
    let mut player_views: Vec<Value> = (0..5).map(|i| snapshot(&state, Some(i))).collect();
    for (i, client) in clients.iter_mut().enumerate() {
        let started = client.until("game_started").await;
        check_wire(&started);
        assert_eq!(started["seq"], 0);
        assert_eq!(started["view"], player_views[i]);
        assert_events_and_view(client, "game_update", &state, &setup_events, Some(i), 0).await;
    }
    // Join a spectator once the game has started; verify spectator snapshot hides secrets and night step.
    let (mut spectator, spec_joined) = server.join(&code, "Watcher").await;
    check_wire(&spec_joined);
    let mut spec_seq = 0u32;
    let mut spec_view = snapshot(&state, None);
    assert_eq!(spec_joined["game"]["seq"], spec_seq);
    assert_eq!(spec_joined["game"]["view"], spec_view);
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
        clients[actor.0]
            .send(json!({
                "type": "game_action",
                "action": { "game": "werewolf", "payload": action }
            }))
            .await;
        for (i, client) in clients.iter_mut().enumerate() {
            let next_view = snapshot(&state, Some(i));
            let recipient =
                Some(PlayerId(i)).filter(|id| state.players[id.0].alive || is_awaited(&state, *id));
            let visible_events = werewolf::filter_events(&events, recipient);
            if !visible_events.is_empty() || next_view != player_views[i] {
                player_seqs[i] += 1;
                player_views[i] = next_view;
                assert_events_and_view(
                    client,
                    "game_update",
                    &state,
                    &events,
                    Some(i),
                    player_seqs[i],
                )
                .await;
            }
        }
        let next_spec_view = snapshot(&state, None);
        let spec_events = werewolf::filter_events(&events, None);
        if !spec_events.is_empty() || next_spec_view != spec_view {
            spec_seq += 1;
            spec_view = next_spec_view;
            assert_events_and_view(
                &mut spectator,
                "game_update",
                &state,
                &events,
                None,
                spec_seq,
            )
            .await;
        }
    }

    // Spectator and non-acting players received only the Dawn update during Night 1 (seq == 1),
    // not the private Wolf -> Seer handoff.
    assert_eq!(spec_seq, 1);
    assert_eq!(player_seqs[hunter.0], 1);
    assert_eq!(player_seqs[villager.0], 1);
    assert_eq!(player_seqs[wolf.0], 2);
    assert_eq!(player_seqs[seer.0], 2);
    assert!(
        collect_updates_until_pong(&mut spectator, 10)
            .await
            .is_empty()
    );

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
    assert_eq!(rejoined_msg["game"]["seq"], player_seqs[hunter.0]);
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
    clients[hunter.0]
        .send(json!({
            "type": "game_action",
            "action": { "game": "werewolf", "payload": shoot }
        }))
        .await;
    for (i, client) in clients.iter_mut().enumerate() {
        player_seqs[i] += 1;
        assert_events_and_view(
            client,
            "game_update",
            &state,
            &shoot_events,
            Some(i),
            player_seqs[i],
        )
        .await;
    }
    spec_seq += 1;
    assert_events_and_view(
        &mut spectator,
        "game_update",
        &state,
        &shoot_events,
        None,
        spec_seq,
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
    assert_eq!(seer_msg["game"]["seq"], player_seqs[seer.0]);
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
            player_seqs[i] += 1;
            assert_events_and_view(client, kind, &state, &evs, Some(i), player_seqs[i]).await;
        }
        spec_seq += 1;
        assert_events_and_view(&mut spectator, kind, &state, &evs, None, spec_seq).await;
    }

    assert_eq!(state.winner, Some(werewolf::Winner::Village));

    // Host ends the game -> returns room to waiting phase.
    clients[0].send(json!({"type": "end_game"})).await;
    let waiting = clients[0].state(|room| room["phase"] == "waiting").await;
    assert_eq!(waiting["game"], "werewolf");
}

async fn night2_spectator_and_villager_updates(kill_seer_night1: bool) -> (Vec<u32>, Vec<u32>) {
    let seed = 9001;
    let server = TestServer::new(Config {
        game_seed: Some(seed),
        ..Config::default()
    })
    .await;

    let mut deck = RoleDeck::empty();
    deck.werewolf = 1;
    deck.seer = 1;
    deck.villager = 3;
    let settings = Settings {
        roles: deck,
        reveal_role_on_death: false,
    };

    let (mut clients, _joined, code) = setup_werewolf_room(&server, 5, settings).await;
    let mut rng = ChaCha8Rng::seed_from_u64(seed);
    let (mut state, _) = werewolf::setup(5, settings, &mut rng).unwrap();

    for client in &mut clients {
        client.until("game_started").await;
        client.until("game_update").await;
    }
    let (mut spectator, _) = server.join(&code, "Spectator").await;

    let wolf = state
        .players
        .iter()
        .find(|p| p.role == Role::Werewolf)
        .unwrap()
        .id;
    let seer = state
        .players
        .iter()
        .find(|p| p.role == Role::Seer)
        .unwrap()
        .id;
    let villagers: Vec<PlayerId> = state
        .players
        .iter()
        .filter(|p| p.role == Role::Villager)
        .map(|p| p.id)
        .collect();
    let night1_victim = if kill_seer_night1 { seer } else { villagers[0] };
    let night2_victim = villagers[1];
    let observing_villager = villagers[2];

    // Night 1: Wolf bites night1_victim, Seer inspects observing_villager -> Dawn Day 1.
    let n1_wolf = Action::WolfVote {
        target: night1_victim,
        infect: false,
    };
    werewolf::apply(&mut state, wolf, n1_wolf.clone(), &mut rng).unwrap();
    clients[wolf.0]
        .send(json!({"type": "game_action", "action": {"game": "werewolf", "payload": n1_wolf}}))
        .await;
    clients[wolf.0].until("game_update").await;
    clients[seer.0].until("game_update").await;

    let n1_seer = Action::SeerInspect {
        target: observing_villager,
    };
    werewolf::apply(&mut state, seer, n1_seer.clone(), &mut rng).unwrap();
    clients[seer.0]
        .send(json!({"type": "game_action", "action": {"game": "werewolf", "payload": n1_seer}}))
        .await;
    // Drain Dawn Day 1 on spectator and observing_villager.
    let spec_day1 = spectator.until("game_update").await;
    assert_eq!(table_of(&spec_day1)["phase"]["kind"], "day_vote");
    let vil_day1 = clients[observing_villager.0].until("game_update").await;
    assert_eq!(table_of(&vil_day1)["phase"]["kind"], "day_vote");
    clients[wolf.0].until("game_update").await;
    if !kill_seer_night1 {
        clients[seer.0].until("game_update").await;
    }

    // Day 1: all 4 living players abstain -> Night 2 starts.
    let living: Vec<PlayerId> = state
        .players
        .iter()
        .filter(|p| p.alive)
        .map(|p| p.id)
        .collect();
    for voter in living {
        let vote = Action::DayVote { target: None };
        werewolf::apply(&mut state, voter, vote.clone(), &mut rng).unwrap();
        clients[voter.0]
            .send(json!({"type": "game_action", "action": {"game": "werewolf", "payload": vote}}))
            .await;
        spectator.until("game_update").await;
        clients[observing_villager.0].until("game_update").await;
        clients[wolf.0].until("game_update").await;
        if !kill_seer_night1 {
            clients[seer.0].until("game_update").await;
        }
    }

    // Confirm no leftover updates before Night 2 actions begin.
    assert!(
        collect_updates_until_pong(&mut spectator, 100)
            .await
            .is_empty()
    );
    assert!(
        collect_updates_until_pong(&mut clients[observing_villager.0], 101)
            .await
            .is_empty()
    );

    // Night 2: Wolf bites night2_victim; if Seer survived Night 1, Seer also inspects.
    let mut spec_night2_seqs = Vec::new();
    let mut vil_night2_seqs = Vec::new();

    let n2_wolf = Action::WolfVote {
        target: night2_victim,
        infect: false,
    };
    werewolf::apply(&mut state, wolf, n2_wolf.clone(), &mut rng).unwrap();
    clients[wolf.0]
        .send(json!({"type": "game_action", "action": {"game": "werewolf", "payload": n2_wolf}}))
        .await;
    clients[wolf.0].until("game_update").await;
    if !kill_seer_night1 {
        clients[seer.0].until("game_update").await;
        // Mid-night check: spectator and non-acting Villager must receive ZERO packets while Seer is awake.
        let mid_spec = collect_updates_until_pong(&mut spectator, 200).await;
        let mid_vil = collect_updates_until_pong(&mut clients[observing_villager.0], 201).await;
        assert!(
            mid_spec.is_empty(),
            "Spectator must not receive intermediate night packet when Seer is alive: {mid_spec:?}"
        );
        assert!(
            mid_vil.is_empty(),
            "Non-acting Villager must not receive intermediate night packet when Seer is alive: {mid_vil:?}"
        );

        let n2_seer = Action::SeerInspect { target: wolf };
        werewolf::apply(&mut state, seer, n2_seer.clone(), &mut rng).unwrap();
        clients[seer.0]
            .send(
                json!({"type": "game_action", "action": {"game": "werewolf", "payload": n2_seer}}),
            )
            .await;
        clients[seer.0].until("game_update").await;
    }

    for msg in collect_updates_until_pong(&mut spectator, 300).await {
        check_wire(&msg);
        spec_night2_seqs.push(msg["seq"].as_u64().unwrap() as u32);
    }
    for msg in collect_updates_until_pong(&mut clients[observing_villager.0], 301).await {
        check_wire(&msg);
        vil_night2_seqs.push(msg["seq"].as_u64().unwrap() as u32);
    }

    (spec_night2_seqs, vil_night2_seqs)
}

#[tokio::test]
async fn werewolf_websocket_spectator_update_count_hides_seer_survival() {
    let (spec_seer_dead, vil_seer_dead) = night2_spectator_and_villager_updates(true).await;
    let (spec_villager_dead, vil_villager_dead) =
        night2_spectator_and_villager_updates(false).await;

    assert_eq!(spec_seer_dead.len(), 1);
    assert_eq!(
        spec_seer_dead, spec_villager_dead,
        "Spectator Night 2 WebSocket update count and seq must not depend on whether Seer died"
    );
    assert_eq!(vil_seer_dead.len(), 1);
    assert_eq!(
        vil_seer_dead, vil_villager_dead,
        "Living Villager Night 2 WebSocket update count and seq must not depend on whether Seer died"
    );
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
    let wolf = state
        .players
        .iter()
        .find(|p| p.role == Role::Werewolf)
        .unwrap()
        .id;
    let villager = state
        .players
        .iter()
        .find(|p| p.role == Role::Villager)
        .unwrap()
        .id;
    clients[awaited.0].disconnect().await;
    clients[wolf.0]
        .state(|room| !room["members"][awaited.0]["online"].as_bool().unwrap())
        .await;

    // Advance paused clock past offline_turn_grace -> server applies default_action automatically.
    tokio::time::advance(Duration::from_secs(6)).await;
    let expected_events = werewolf::apply(&mut state, awaited, default_act, &mut rng).unwrap();
    assert_events_and_view(
        &mut clients[wolf.0],
        "game_update",
        &state,
        &expected_events,
        Some(wolf.0),
        1,
    )
    .await;
    // Non-acting Villager must not receive an update on Bodyguard -> Werewolf handoff.
    assert!(
        collect_updates_until_pong(&mut clients[villager.0], 42)
            .await
            .is_empty()
    );

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

#[tokio::test(start_paused = true)]
async fn werewolf_websocket_concurrent_vote_preserves_offline_timeout() {
    let seed = 1337;
    let server = TestServer::new(Config {
        game_seed: Some(seed),
        offline_timeout: Duration::from_secs(60),
        empty_room_timeout: Duration::from_secs(600),
        ..Config::default()
    })
    .await;

    let mut deck = RoleDeck::empty();
    deck.werewolf = 1;
    deck.seer = 1;
    deck.villager = 3;
    let settings = Settings {
        roles: deck,
        reveal_role_on_death: false,
    };

    let (mut clients, _joined, _code) = setup_werewolf_room(&server, 5, settings).await;
    let mut rng = ChaCha8Rng::seed_from_u64(seed);
    let (mut state, _) = werewolf::setup(5, settings, &mut rng).unwrap();
    for client in &mut clients {
        client.until("game_started").await;
        client.until("game_update").await;
    }

    let wolf = state
        .players
        .iter()
        .find(|p| p.role == Role::Werewolf)
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

    // Finish Night 1 -> enter concurrent DayVote phase.
    let n1_wolf = Action::WolfVote {
        target: villager,
        infect: false,
    };
    werewolf::apply(&mut state, wolf, n1_wolf.clone(), &mut rng).unwrap();
    clients[wolf.0]
        .send(json!({"type": "game_action", "action": {"game": "werewolf", "payload": n1_wolf}}))
        .await;
    clients[wolf.0].until("game_update").await;
    clients[seer.0].until("game_update").await;

    let n1_seer = Action::SeerInspect { target: wolf };
    werewolf::apply(&mut state, seer, n1_seer.clone(), &mut rng).unwrap();
    clients[seer.0]
        .send(json!({"type": "game_action", "action": {"game": "werewolf", "payload": n1_seer}}))
        .await;
    for client in &mut clients {
        let dawn = client.until("game_update").await;
        assert_eq!(table_of(&dawn)["phase"]["kind"], "day_vote");
    }

    let awaited = werewolf::decision(&state).unwrap().awaited;
    let first_offline = awaited[0];
    let other_voter = awaited[1];

    // Disconnect the first awaited seat at the start of DayVote (t = 0s).
    clients[first_offline.0].disconnect().await;
    clients[other_voter.0]
        .state(|room| {
            !room["members"][first_offline.0]["online"]
                .as_bool()
                .unwrap()
        })
        .await;

    // Another player votes at t = 59s; this must NOT reset first_offline's 60s timeout.
    tokio::time::advance(Duration::from_secs(59)).await;
    let other_vote = Action::DayVote { target: None };
    werewolf::apply(&mut state, other_voter, other_vote.clone(), &mut rng).unwrap();
    clients[other_voter.0]
        .send(json!({"type": "game_action", "action": {"game": "werewolf", "payload": other_vote}}))
        .await;
    let after_other = clients[other_voter.0].until("game_update").await;
    assert!(
        table_of(&after_other)["players"][first_offline.0]["day_vote"].is_null(),
        "First offline seat must not have defaulted yet at 59s"
    );

    // At t = 61s (only 2s after other_voter's vote), first_offline MUST receive default abstain.
    tokio::time::advance(Duration::from_secs(2)).await;
    let (default_actor, default_action) = werewolf::default_action(&state).unwrap();
    assert_eq!(default_actor, first_offline);
    assert_eq!(default_action, Action::DayVote { target: None });
    let expected_events =
        werewolf::apply(&mut state, default_actor, default_action, &mut rng).unwrap();
    let timeout_msg = clients[other_voter.0].until("game_update").await;
    check_wire(&timeout_msg);
    let expected_json =
        serde_json::to_value(werewolf::filter_events(&expected_events, Some(other_voter))).unwrap();
    assert_eq!(timeout_msg["update"]["events"], expected_json);
    assert_eq!(
        timeout_msg["update"]["view"],
        snapshot(&state, Some(other_voter.0))["payload"]
    );
}
