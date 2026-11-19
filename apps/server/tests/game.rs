mod support;
use bang::{Action, CardKind, DecisionKind, Event, GameState, PlayerId};
use protocol::GameView;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde_json::{Value, json};
use server::Config;
use std::time::Duration;
use support::{Client, TestServer};

struct Table {
    server: TestServer,
    clients: Vec<Option<Client>>,
    joined: Vec<Value>,
    spectator: Client,
    state: GameState,
    rng: ChaCha8Rng,
    seq: u32,
    seats: Value,
}

fn snapshot(state: &GameState, player: Option<usize>) -> Value {
    let view = match player.filter(|i| state.players[*i].alive) {
        Some(player) => GameView::Player(bang::view(state, PlayerId(player)).unwrap()),
        None => GameView::Spectator(bang::spectator_view(state)),
    };
    serde_json::to_value(view).unwrap()
}

fn game_snapshot(state: &GameState, player: Option<usize>, seq: u32, seats: &Value) -> Value {
    json!({ "seq": seq, "seats": seats, "view": snapshot(state, player) })
}

fn check_wire(message: &Value) {
    let text = message.to_string();
    for private in [
        "draw_pile",
        "discard_pile",
        "pending",
        "next_pending_id",
        "hidden_discards",
        "store_pool",
        "visibility",
    ] {
        assert!(
            !text.contains(&format!("\"{private}\":")),
            "Raw state/event leaked: {private}"
        );
    }
}

impl Table {
    async fn new(count: usize, seed: u64) -> Self {
        let server = TestServer::new(Config {
            game_seed: Some(seed),
            ..Config::default()
        })
        .await;
        let (host, first) = server.create("Host").await;
        assert!(first["game"].is_null());
        let mut clients = vec![Some(host)];
        let mut joined = vec![first];
        for i in 1..count {
            let (client, data) = server
                .join(joined[0]["room_code"].as_str().unwrap(), &format!("P{i}"))
                .await;
            clients.push(Some(client));
            joined.push(data);
        }
        let seats = json!(joined.iter().enumerate().map(|(i, data)| json!({"player_id":i,"member_id":data["room"]["you"],"nickname":if i == 0 {"Host".to_owned()} else {format!("P{i}")}})).collect::<Vec<_>>());
        let early_spectator = if count == 7 {
            Some(
                server
                    .join(joined[0]["room_code"].as_str().unwrap(), "Watcher")
                    .await
                    .0,
            )
        } else {
            None
        };
        clients[0]
            .as_mut()
            .unwrap()
            .send(json!({"type":"start_game"}))
            .await;
        let mut rng = ChaCha8Rng::seed_from_u64(seed);
        let (state, events) = bang::setup(count, &mut rng).unwrap();
        for (i, client) in clients.iter_mut().enumerate() {
            let message = client.as_mut().unwrap().until("game_started").await;
            check_wire(&message);
            assert_eq!(message["seq"], 0);
            assert_eq!(message["seats"], seats);
            assert_eq!(message["view"], snapshot(&state, Some(i)));
        }
        let mut spectator = if let Some(mut client) = early_spectator {
            let message = client.until("game_started").await;
            assert_eq!(message["seq"], 0);
            assert_eq!(message["seats"], seats);
            assert_eq!(message["view"], snapshot(&state, None));
            client
        } else {
            // Join after initial broadcasts have been checked below.
            server.connect().await
        };
        for (i, client) in clients.iter_mut().enumerate() {
            assert_update(client.as_mut().unwrap(), &state, &events, Some(i), 0).await;
            client
                .as_mut()
                .unwrap()
                .state(|room| room["phase"] == "playing")
                .await;
        }
        if count == 7 {
            assert_update(&mut spectator, &state, &events, None, 0).await;
            spectator.state(|room| room["phase"] == "playing").await;
        } else {
            spectator.send(json!({"type":"join_room","room_code":joined[0]["room_code"],"nickname":"Watcher"})).await;
            let data = spectator.until("joined").await;
            assert_eq!(data["game"], game_snapshot(&state, None, 0, &seats));
            spectator.state(|room| room["phase"] == "playing").await;
        }
        Self {
            server,
            clients,
            joined,
            spectator,
            state,
            rng,
            seq: 0,
            seats,
        }
    }

    async fn updates(&mut self, events: &[Event]) {
        self.seq += 1;
        for (i, client) in self.clients.iter_mut().enumerate() {
            if let Some(client) = client {
                assert_update(client, &self.state, events, Some(i), self.seq).await;
            }
        }
        assert_update(&mut self.spectator, &self.state, events, None, self.seq).await;
    }

    async fn act(&mut self, player: PlayerId, action: Action) {
        self.clients[player.0]
            .as_mut()
            .unwrap()
            .send(json!({"type":"game_action","action":action}))
            .await;
        let events = bang::apply(&mut self.state, player, action, &mut self.rng).unwrap();
        self.updates(&events).await;
    }

    async fn skip(&mut self, host: usize) {
        self.clients[host]
            .as_mut()
            .unwrap()
            .send(json!({"type":"host_skip"}))
            .await;
        let (player, action) = bang::default_action(&self.state).unwrap();
        let events = bang::apply(&mut self.state, player, action, &mut self.rng).unwrap();
        self.updates(&events).await;
    }

    async fn disconnect(&mut self, player: usize) {
        self.clients[player].as_mut().unwrap().disconnect().await;
        self.clients[player] = None;
        let member = self.joined[player]["room"]["you"].clone();
        self.spectator
            .state(|room| {
                room["members"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|m| m["id"] == member && m["online"] == false)
            })
            .await;
    }

    async fn rejoin(&mut self, player: usize) {
        let mut client = self.server.connect().await;
        client.send(json!({"type":"rejoin_room","room_code":self.joined[0]["room_code"],"token":self.joined[player]["token"]})).await;
        let joined = client.until("joined").await;
        assert_eq!(
            joined["game"],
            game_snapshot(&self.state, Some(player), self.seq, &self.seats)
        );
        client.state(|room| room["phase"] == "playing").await;
        self.clients[player] = Some(client);
    }
}

async fn assert_update(
    client: &mut Client,
    state: &GameState,
    events: &[Event],
    player: Option<usize>,
    seq: u32,
) {
    let kind = if state.winner.is_some() {
        "game_over"
    } else {
        "game_update"
    };
    let message = client.until(kind).await;
    check_wire(&message);
    assert_eq!(message["seq"], seq);
    assert_eq!(message["view"], snapshot(state, player));
    let recipient = player.filter(|i| state.players[*i].alive).map(PlayerId);
    let expected: Vec<_> = bang::filter_events(events, recipient)
        .into_iter()
        .map(|event| event.kind)
        .collect();
    assert_eq!(message["events"], serde_json::to_value(expected).unwrap());
}

// Rejecting a command must not silently produce an update before the error.
async fn rejected(client: &mut Client, code: &str) {
    loop {
        let message = client.receive().await;
        if message["type"] == "error" {
            assert_eq!(message["code"], code);
            break;
        }
        assert_eq!(message["type"], "room_state");
    }
}

fn bot_action(state: &GameState, rng: &ChaCha8Rng) -> (PlayerId, Action) {
    let default = bang::default_action(state).unwrap();
    if !state.pending.is_empty() {
        return default;
    }
    let player = default.0;
    for kind in [
        CardKind::Bang,
        CardKind::Duel,
        CardKind::Gatling,
        CardKind::Indians,
        CardKind::Stagecoach,
        CardKind::WellsFargo,
    ] {
        for &card in &state.players[player.0].hand {
            if card.card().unwrap().kind != kind {
                continue;
            }
            for target in (0..state.players.len())
                .map(|i| Some(PlayerId(i)))
                .chain([None])
            {
                let action = Action::Play { card, target };
                if bang::apply(&mut state.clone(), player, action.clone(), &mut rng.clone()).is_ok()
                {
                    return (player, action);
                }
            }
        }
    }
    default
}

#[tokio::test(start_paused = true)]
async fn games_for_four_through_seven_match_engine_views_and_private_events() {
    for count in 4..=7 {
        let mut table = Table::new(count, 42).await;
        let (owner, action) = bang::default_action(&table.state).unwrap();
        let wrong = (owner.0 + 1) % count;
        table.clients[wrong]
            .as_mut()
            .unwrap()
            .send(json!({"type":"game_action","player":owner.0,"action":action}))
            .await;
        rejected(table.clients[wrong].as_mut().unwrap(), "illegal_action").await;
        table
            .spectator
            .send(json!({"type":"game_action","player":owner.0,"action":action}))
            .await;
        rejected(&mut table.spectator, "illegal_action").await;
        table.spectator.send(json!({"type":"host_skip"})).await;
        rejected(&mut table.spectator, "not_host").await;
        for action in [
            Action::Play {
                card: bang::CardId(255),
                target: Some(PlayerId(usize::MAX)),
            },
            Action::Respond {
                pending_id: bang::PendingId(u64::MAX),
                card: Some(bang::CardId(255)),
            },
            Action::SidHeal {
                pending_id: None,
                discard: [bang::CardId(255); 2],
            },
        ] {
            table.clients[owner.0]
                .as_mut()
                .unwrap()
                .send(json!({"type":"game_action","action":action}))
                .await;
            rejected(table.clients[owner.0].as_mut().unwrap(), "illegal_action").await;
        }
        assert_eq!(table.seq, 0);
        table.rejoin(owner.0).await;
        table.skip(0).await; // Exact seq/view/event checks prove errors left sequence, RNG and state unchanged.
        let mut reacted = false;
        for _ in 0..100 {
            let (player, action) = bot_action(&table.state, &table.rng);
            table.act(player, action).await;
            if matches!(
                table.state.decision().map(|d| d.kind),
                Some(DecisionKind::AttackResponse { .. } | DecisionKind::Duel)
            ) {
                reacted = true;
                break;
            }
        }
        assert!(reacted);
        let late = table
            .server
            .join(table.joined[0]["room_code"].as_str().unwrap(), "Late")
            .await
            .1;
        assert_eq!(
            late["game"],
            game_snapshot(&table.state, None, table.seq, &table.seats)
        );
    }
}

#[tokio::test(start_paused = true)]
async fn a_complete_seeded_game_crosses_websocket_then_waits_for_host_end() {
    let mut table = Table::new(4, 42).await;
    let mut steps = 0;
    while table.state.winner.is_none() && steps < 4096 {
        let (player, action) = bot_action(&table.state, &table.rng);
        table.act(player, action).await;
        steps += 1;
    }
    assert!(table.state.winner.is_some(), "Network bot game must finish");
    assert_eq!(table.seq, steps);
    let (mut late, joined) = table
        .server
        .join(table.joined[0]["room_code"].as_str().unwrap(), "After")
        .await;
    assert_eq!(joined["room"]["phase"], "playing");
    assert_eq!(
        joined["game"],
        game_snapshot(&table.state, None, table.seq, &table.seats)
    );
    table.rejoin(0).await;
    table.clients[0]
        .as_mut()
        .unwrap()
        .send(json!({"type":"game_action","action":Action::EndTurn{discard:vec![]}}))
        .await;
    rejected(table.clients[0].as_mut().unwrap(), "wrong_phase").await;
    table.clients[0]
        .as_mut()
        .unwrap()
        .send(json!({"type":"host_skip"}))
        .await;
    rejected(table.clients[0].as_mut().unwrap(), "wrong_phase").await;
    table.clients[0]
        .as_mut()
        .unwrap()
        .send(json!({"type":"end_game"}))
        .await;
    for client in table.clients.iter_mut().flatten() {
        client.state(|room| room["phase"] == "waiting").await;
    }
    late.state(|room| room["phase"] == "waiting").await;
    let (_, snapshot) = table
        .server
        .join(table.joined[0]["room_code"].as_str().unwrap(), "Reset")
        .await;
    assert!(snapshot["game"].is_null());
    println!(
        "Network game: seed=42, players=4, actions={steps}, winner={:?}",
        table.state.winner
    );
}

#[tokio::test(start_paused = true)]
async fn offline_top_decisions_get_their_own_full_window_and_rejoin_cancels_deadline() {
    let seed = (0..100)
        .find(|seed| {
            let (state, _) = bang::setup(4, &mut ChaCha8Rng::seed_from_u64(*seed)).unwrap();
            matches!(state.decision().unwrap().kind, DecisionKind::DrawChoice)
                && state.decision().unwrap().player != PlayerId(0)
        })
        .unwrap();
    let mut table = Table::new(4, seed).await;
    let offline = table.state.decision().unwrap().player.0;
    table.disconnect(offline).await;
    tokio::time::advance(Duration::from_secs(59)).await;
    table
        .spectator
        .send(json!({"type":"game_action","action":Action::EndTurn{discard:vec![]}}))
        .await;
    rejected(&mut table.spectator, "illegal_action").await;
    tokio::time::advance(Duration::from_secs(1)).await;
    let (player, action) = bang::default_action(&table.state).unwrap();
    let events = bang::apply(&mut table.state, player, action, &mut table.rng).unwrap();
    table.updates(&events).await;
    assert_eq!(table.state.decision().unwrap().player.0, offline);
    assert_eq!(table.state.decision().unwrap().kind, DecisionKind::Turn);
    tokio::time::advance(Duration::from_secs(59)).await;
    table
        .spectator
        .send(json!({"type":"game_action","action":Action::EndTurn{discard:vec![]}}))
        .await;
    rejected(&mut table.spectator, "illegal_action").await;
    table.rejoin(offline).await;
    tokio::time::advance(Duration::from_secs(61)).await;
    table
        .spectator
        .send(json!({"type":"game_action","action":Action::EndTurn{discard:vec![]}}))
        .await;
    rejected(&mut table.spectator, "illegal_action").await;
    table.skip(0).await;
}

#[tokio::test(start_paused = true)]
async fn leaving_a_game_defaults_the_reserved_seat_immediately_and_invalidates_its_token() {
    let mut table = Table::new(4, 42).await;
    let leaving = table.state.decision().unwrap().player.0;
    table.clients[leaving]
        .as_mut()
        .unwrap()
        .send(json!({"type":"leave_room"}))
        .await;
    table.clients[leaving].as_mut().unwrap().until("left").await;
    let mut departed = table.clients[leaving].take().unwrap();
    let mut defaults = 0;
    while table
        .state
        .decision()
        .is_some_and(|d| d.player.0 == leaving)
    {
        let (player, action) = bang::default_action(&table.state).unwrap();
        let events = bang::apply(&mut table.state, player, action, &mut table.rng).unwrap();
        table.updates(&events).await;
        defaults += 1;
    }
    assert!(defaults > 0);
    departed.send(json!({"type":"rejoin_room","room_code":table.joined[0]["room_code"],"token":table.joined[leaving]["token"]})).await;
    departed.error("invalid_token").await;
    assert_eq!(table.state.players.len(), 4);
    let (_, late) = table
        .server
        .join(table.joined[0]["room_code"].as_str().unwrap(), "AfterLeave")
        .await;
    assert_eq!(
        late["game"],
        game_snapshot(&table.state, None, table.seq, &table.seats)
    );
    assert!(
        !late["room"]["members"]
            .as_array()
            .unwrap()
            .iter()
            .any(|member| member["id"] == table.seats[leaving]["member_id"])
    );
    assert_eq!(late["game"]["seats"][leaving], table.seats[leaving]);
    // Future turns of the departed seat must also be skipped without advancing virtual time.
    let mut seen_again = false;
    for _ in 0..24 {
        let (player, action) = bang::default_action(&table.state).unwrap();
        table.clients[player.0]
            .as_mut()
            .unwrap()
            .send(json!({"type":"game_action","action":action}))
            .await;
        let events = bang::apply(&mut table.state, player, action, &mut table.rng).unwrap();
        table.updates(&events).await;
        while table
            .state
            .decision()
            .is_some_and(|d| d.player.0 == leaving)
        {
            let (player, action) = bang::default_action(&table.state).unwrap();
            let events = bang::apply(&mut table.state, player, action, &mut table.rng).unwrap();
            table.updates(&events).await;
            seen_again = true;
        }
        if seen_again {
            break;
        }
    }
    assert!(seen_again);
}

#[tokio::test]
async fn ping_barrier_follows_the_same_connections_action_update_or_error() {
    tokio::time::timeout(Duration::from_secs(5), async {
        let mut table = Table::new(4, 42).await;
        let host = table.clients[0].as_mut().unwrap();
        host.send(json!({"type":"host_skip"})).await;
        host.send(json!({"type":"ping","nonce":41})).await;
        let mut saw_update = false;
        loop {
            let message = host.receive().await;
            match message["type"].as_str().unwrap() {
                "game_update" => {
                    assert_eq!(message["seq"], 1);
                    saw_update = true;
                }
                "pong" => {
                    assert_eq!(message["nonce"], 41);
                    assert!(saw_update, "The pong must follow the action's update");
                    break;
                }
                "room_state" => {}
                other => panic!("Unexpected message: {other}"),
            }
        }
        host.send(json!({"type":"game_action","action":{"type":"respond","pending_id":4294967295_u32,"card":null}})).await;
        host.send(json!({"type":"ping","nonce":42})).await;
        let error = host.receive().await;
        assert_eq!(error["type"], "error");
        assert_eq!(error["code"], "illegal_action");
        let barrier = host.receive().await;
        assert_eq!(barrier["type"], "pong");
        assert_eq!(barrier["nonce"], 42);
    })
    .await
    .expect("The action/pong barrier timed out");
}

#[tokio::test]
async fn blind_store_stays_private_for_all_connections_and_rejoin_snapshots() {
    let seed = (0..10000)
        .find(|seed| {
            let (state, _) = bang::setup(4, &mut ChaCha8Rng::seed_from_u64(*seed)).unwrap();
            let player = state.turn.player;
            state
                .decision()
                .is_some_and(|d| d.kind == DecisionKind::Turn)
                && state.players[player.0]
                    .hand
                    .iter()
                    .any(|id| id.card().unwrap().kind == CardKind::GeneralStore)
        })
        .unwrap();
    let mut table = Table::new(4, seed).await;
    let owner = table.state.turn.player;
    let card = *table.state.players[owner.0]
        .hand
        .iter()
        .find(|id| id.card().unwrap().kind == CardKind::GeneralStore)
        .unwrap();
    table.act(owner, Action::Play { card, target: None }).await;
    assert_eq!(bang::spectator_view(&table.state).store_slots, 4);
    let pool = match &table.state.pending.last().unwrap().kind {
        bang::PendingKind::GeneralStore { pool, .. } => pool.clone(),
        _ => unreachable!(),
    };
    for player in 0..4 {
        let own = bang::view(&table.state, PlayerId(player)).unwrap();
        assert!(own.choices.is_empty());
        assert!(!own.hand.iter().any(|id| pool.contains(id)));
        table.rejoin(player).await;
    }
    let (_late_watcher, watcher_joined) = table
        .server
        .join(
            table.joined[0]["room_code"].as_str().unwrap(),
            "LateWatcher",
        )
        .await;
    check_wire(&watcher_joined);
    assert_eq!(
        watcher_joined["game"],
        game_snapshot(&table.state, None, table.seq, &table.seats)
    );
    let mut watcher_rejoined = table.server.connect().await;
    watcher_rejoined.send(json!({"type":"rejoin_room","room_code":table.joined[0]["room_code"],"token":watcher_joined["token"]})).await;
    let snapshot = watcher_rejoined.until("joined").await;
    check_wire(&snapshot);
    assert_eq!(
        snapshot["game"],
        game_snapshot(&table.state, None, table.seq, &table.seats)
    );
    for remaining in (1..=4).rev() {
        let decision = table.state.decision().unwrap();
        assert_eq!(bang::spectator_view(&table.state).store_slots, remaining);
        let slot = remaining - 1;
        let selected = match &table.state.pending.last().unwrap().kind {
            bang::PendingKind::GeneralStore { pool, .. } => pool[usize::from(slot)],
            _ => unreachable!(),
        };
        // Table::act checks every real client's filtered events and view against the engine,
        // including the spectator, so a public receipt or raw store IDs fail the wire check.
        table
            .act(
                decision.player,
                Action::ChooseStoreSlot {
                    pending_id: decision.pending_id.unwrap(),
                    slot,
                },
            )
            .await;
        assert!(
            table.state.players[decision.player.0]
                .hand
                .contains(&selected)
        );
    }
    assert_eq!(bang::spectator_view(&table.state).store_slots, 0);
}
