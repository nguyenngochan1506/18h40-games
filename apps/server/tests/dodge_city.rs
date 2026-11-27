#[allow(dead_code)]
mod support;
use bang::{Action, CardKind, Expansion, GameConfig, GameState, PlayerId, RoleCounts};
use protocol::{GameView, bang::BangView};
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde_json::{Value, json};
use server::Config;
use support::{Client, TestServer};

fn code(data: &Value) -> &str {
    data["room_code"].as_str().unwrap()
}

fn dodge(players: usize) -> Value {
    json!({"game":"bang","payload":{"expansions":["dodge_city"],"mode":"classic","roles":serde_json::to_value(RoleCounts::standard(players)).unwrap()}})
}

fn view_of(state: &GameState, player: Option<usize>) -> Value {
    let view = match player.filter(|i| state.players[*i].alive) {
        Some(p) => BangView::Player(bang::view(state, PlayerId(p)).unwrap()),
        None => BangView::Spectator(bang::spectator_view(state)),
    };
    serde_json::to_value(GameView::Bang(view)).unwrap()
}

// A legal opening move that exercises Dodge City actions: a green card, or one that costs a discard.
fn dodge_action(state: &GameState, rng: &ChaCha8Rng) -> Option<(PlayerId, Action, &'static str)> {
    if !state.pending.is_empty() {
        return None;
    }
    let (player, _) = bang::default_action(state)?;
    let hand = &state.players[player.0].hand;
    let ok =
        |a: &Action| bang::apply(&mut state.clone(), player, a.clone(), &mut rng.clone()).is_ok();
    for &card in hand {
        let kind = card.card()?.kind;
        for &discard in hand.iter().filter(|c| **c != card) {
            if matches!(
                kind,
                CardKind::Tequila | CardKind::Whisky | CardKind::Springfield
            ) {
                for target in (0..state.players.len())
                    .map(|i| Some(PlayerId(i)))
                    .chain([None])
                {
                    let a = Action::PlayWithDiscard {
                        card,
                        discard,
                        target,
                    };
                    if ok(&a) {
                        return Some((player, a, "discard"));
                    }
                }
            }
        }
        if kind.is_green() {
            for target in (0..state.players.len())
                .map(|i| Some(PlayerId(i)))
                .chain([None])
            {
                let a = Action::Play { card, target };
                if ok(&a) {
                    return Some((player, a, "green"));
                }
            }
        }
    }
    None
}

async fn expect(client: &mut Client, state: &GameState, player: Option<usize>, seq: u32) {
    let msg = client.until("game_update").await;
    assert_eq!(msg["seq"], seq);
    assert_eq!(msg["update"]["view"], view_of(state, player)["payload"]);
}

#[tokio::test(start_paused = true)]
async fn dodge_city_room_seats_eight_and_plays_through_the_server() {
    let server = TestServer::new(Config {
        game_seed: Some(7),
        ..Config::default()
    })
    .await;
    let (mut host, first) = server.create("Host").await;
    let mut guests = Vec::new();
    // Base room: seven seats; the eighth joins as a spectator.
    for i in 1..8 {
        guests.push(server.join(code(&first), &format!("P{i}")).await);
    }
    assert_eq!(guests[6].1["room"]["members"][7]["role"], "spectator");
    assert_eq!(first["room"]["max_players"], 7);
    host.send(json!({"type":"take_seat"})).await;
    host.send(json!({"type":"update_settings","settings":dodge(7)}))
        .await;
    host.state(|r| r["max_players"] == 8 && r["settings"] == dodge(7))
        .await;
    // The eighth takes a seat once capacity allows; roles reset to the 8-player preset.
    guests[6].0.send(json!({"type":"take_seat"})).await;
    host.state(|r| r["settings"] == dodge(8) && r["members"][7]["role"] == "player")
        .await;
    // Capacity cannot drop below the seated players.
    let mut base8 = dodge(8);
    base8["payload"]["expansions"] = json!([]);
    host.send(json!({"type":"update_settings","settings":base8}))
        .await;
    host.error("invalid_settings").await;
    host.send(json!({"type":"start_game"})).await;

    let mut rng = ChaCha8Rng::seed_from_u64(7);
    let config = GameConfig {
        expansions: [Expansion::DodgeCity].into(),
        roles: RoleCounts::standard(8),
        ..Default::default()
    };
    let (mut state, _) = bang::setup(8, config, &mut rng).unwrap();
    let mut all: Vec<&mut Client> = std::iter::once(&mut host)
        .chain(guests.iter_mut().map(|g| &mut g.0))
        .collect();
    for (i, client) in all.iter_mut().enumerate() {
        let start = client.until("game_started").await;
        assert_eq!(start["view"], view_of(&state, Some(i)));
        client.until("game_update").await;
    }
    // Wrong player and malformed card are refused without consuming a sequence number.
    let (owner, _) = bang::default_action(&state).unwrap();
    let other = (owner.0 + 1) % 8;
    let probe = Action::Play {
        card: bang::CardId(119),
        target: None,
    };
    all[other]
        .send(json!({"type":"game_action","action":{"game":"bang","payload":probe}}))
        .await;
    all[other].error("illegal_action").await;
    // The right player with a card that is not in hand is refused as well (seq stays 0 below).
    let absent = (80..120)
        .map(bang::CardId)
        .find(|c| !state.players[owner.0].hand.contains(c))
        .unwrap();
    let probe = Action::Play {
        card: absent,
        target: None,
    };
    all[owner.0]
        .send(json!({"type":"game_action","action":{"game":"bang","payload":probe}}))
        .await;
    all[owner.0].error("illegal_action").await;

    let (mut seen_green, mut seen_discard, mut seq) = (false, false, 0);
    for _ in 0..400 {
        let (player, action, tag) = match dodge_action(&state, &rng) {
            Some(found) => found,
            None => {
                let (p, a) = bang::default_action(&state).unwrap();
                (p, a, "")
            }
        };
        all[player.0]
            .send(json!({"type":"game_action","action":{"game":"bang","payload":action}}))
            .await;
        bang::apply(&mut state, player, action, &mut rng).unwrap();
        seq += 1;
        for (i, client) in all.iter_mut().enumerate() {
            expect(client, &state, Some(i), seq).await;
        }
        seen_green |= tag == "green";
        seen_discard |= tag == "discard";
        if seen_green && seen_discard || state.winner.is_some() {
            break;
        }
    }
    assert!(
        seen_green && seen_discard,
        "scenario must exercise green and discard actions"
    );

    // Reconnect and a late spectator receive the same full view the engine gives them.
    let mut again = server.connect().await;
    again
        .send(json!({"type":"rejoin_room","room_code":code(&first),"token":first["token"]}))
        .await;
    let joined = again.until("joined").await;
    assert_eq!(joined["game"]["view"], view_of(&state, Some(0)));
    let (_late, data) = server.join(code(&first), "Late").await;
    assert_eq!(data["game"]["view"], view_of(&state, None));
    assert_eq!(data["game"]["view"]["payload"]["perspective"], "spectator");
    let text = data["game"]["view"].to_string();
    assert!(
        !text.contains("\"hand\":["),
        "spectator view leaked a hand: {text}"
    );
}
