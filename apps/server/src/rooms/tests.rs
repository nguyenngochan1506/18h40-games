use super::*;
use protocol::{GameView, bang::BangView};

fn bang_table(game: &dyn GameSession) -> bang::SpectatorView {
    match game.view("") {
        GameView::Bang(BangView::Spectator(table)) => table,
        _ => panic!("Expected BANG spectator view"),
    }
}

fn start_game(seed: u64, now: Instant) -> Box<dyn GameSession> {
    module(GameKind::Bang)
        .start(
            game_seats(),
            &module(GameKind::Bang).default_settings(),
            Some(seed),
            now,
        )
        .unwrap()
}

fn game_seats() -> Vec<GameSeat> {
    (0..4)
        .map(|i| GameSeat {
            player_id: i,
            member_id: (i + 1).to_string(),
            nickname: format!("P{i}"),
        })
        .collect()
}

fn timer_room(phase: Phase, online: bool) -> (Room, mpsc::Receiver<ServerMessage>) {
    let now = Instant::now();
    let (outgoing, receiver) = mpsc::channel(QUEUE_CAPACITY);
    let (shutdown, _) = tokio::sync::watch::channel(None);
    let room = Room {
        game_kind: GameKind::Bang,
        settings: module(GameKind::Bang).default_settings(),
        code: "ABCDE".into(),
        phase,
        game: None,
        host: if phase == Phase::Playing { "2" } else { "1" }.into(),
        members: vec![
            MemberState {
                view: Member {
                    id: "1".into(),
                    nickname: "Online".into(),
                    role: Role::Player,
                    online,
                },
                token: [0; 16],
                connection: online.then_some(Peer {
                    id: 1,
                    outgoing,
                    shutdown,
                }),
                offline_since: (!online).then_some(now),
            },
            MemberState {
                view: Member {
                    id: "2".into(),
                    nickname: "Offline".into(),
                    role: Role::Player,
                    online: false,
                },
                token: [0; 16],
                connection: None,
                offline_since: Some(now),
            },
        ],
        next_id: 3,
        empty_since: (!online).then_some(now),
        config: Config::default(),
        registry: Weak::new(),
    };
    (room, receiver)
}

#[tokio::test(start_paused = true)]
async fn deadline_survives_clock_advancing_between_expiry_and_scheduling() {
    for phase in [Phase::Waiting, Phase::Playing] {
        let (mut room, mut snapshots) = timer_room(phase, true);
        let deadline = Instant::now() + room.config.offline_timeout;
        tokio::time::advance(std::time::Duration::from_secs(59)).await;
        let now = Instant::now();
        assert!(!room.expire(now));
        tokio::time::advance(std::time::Duration::from_secs(2)).await;
        assert_eq!(room.next_deadline(now), Some(deadline));
        tokio::time::sleep_until(deadline).await;
        assert!(!room.expire(Instant::now()));
        assert_eq!(room.host, "1");
        assert_eq!(
            room.members.len(),
            if phase == Phase::Waiting { 1 } else { 2 }
        );
        assert!(matches!(
            snapshots.try_recv(),
            Ok(ServerMessage::RoomState { .. })
        ));
        assert_eq!(room.next_deadline(Instant::now()), None);
    }
}

#[tokio::test(start_paused = true)]
async fn processed_offline_host_deadline_does_not_spin() {
    let (mut room, _) = timer_room(Phase::Playing, false);
    let cleanup = Instant::now() + room.config.empty_room_timeout;
    tokio::time::advance(room.config.offline_timeout).await;
    assert!(!room.expire(Instant::now()));
    assert_eq!(room.members.len(), 2);
    assert_eq!(room.host, "2");
    assert_eq!(room.next_deadline(Instant::now()), Some(cleanup));
}

#[test]
fn tokens_and_unicode_nicknames() {
    let token = [0xab; 16];
    assert_eq!(decode_token(&encode_token(&token)), Some(token));
    assert!(tokens_equal(&token, &[0xab; 16]));
    for index in 0..16 {
        let mut other = token;
        other[index] ^= 1;
        assert!(!tokens_equal(&token, &other));
    }
    assert!(decode_token("invalid").is_none());
    assert_eq!(nickname("  Hân  "), Ok("Hân".into()));
    assert!(nickname(&"ắ".repeat(21)).is_err());
    assert!(nickname("a\nb").is_err());
}
#[tokio::test(start_paused = true)]
async fn game_deadline_uses_the_same_now_across_expiry_and_scheduling() {
    let (mut room, _) = timer_room(Phase::Playing, true);
    let now = Instant::now();
    let game = (0..100)
        .map(|seed| start_game(seed, now))
        .find(|game| {
            matches!(
                bang_table(game.as_ref()).waiting.unwrap().kind,
                bang::DecisionKind::DrawChoice
            )
        })
        .unwrap();
    let owner = game.awaited_seat().unwrap();
    room.members[1].view.id = game.seats()[owner].member_id.clone();
    room.members[0].view.id = game.seats()[(owner + 1) % 4].member_id.clone();
    room.host = room.members[0].view.id.clone();
    room.game = Some(game);
    let deadline = now + room.config.offline_timeout;
    tokio::time::advance(std::time::Duration::from_secs(59)).await;
    let now = Instant::now();
    assert!(!room.expire(now));
    tokio::time::advance(std::time::Duration::from_secs(2)).await;
    assert_eq!(room.next_deadline(now), Some(deadline));
    tokio::time::sleep_until(deadline).await;
    let now = Instant::now();
    assert!(!room.expire(now));
    assert_eq!(
        bang_table(room.game.as_ref().unwrap().as_ref())
            .waiting
            .unwrap()
            .kind,
        bang::DecisionKind::Turn
    );
    assert_eq!(
        room.game_deadline(),
        Some(now + room.config.offline_timeout)
    );
}

#[tokio::test(start_paused = true)]
async fn an_abandoned_game_does_not_spin_when_every_living_seat_has_left() {
    let (mut room, _) = timer_room(Phase::Playing, false);
    let now = Instant::now();
    room.members.clear();
    room.game = Some(start_game(42, now));
    room.drive_game(now);
    let decision = bang_table(room.game.as_ref().unwrap().as_ref()).waiting;
    assert!(matches!(
        decision.map(|d| d.kind),
        Some(bang::DecisionKind::Turn)
    ));
    assert_eq!(
        room.next_deadline(now),
        Some(now + room.config.empty_room_timeout)
    );
    room.drive_game(now);
    assert_eq!(
        bang_table(room.game.as_ref().unwrap().as_ref()).waiting,
        decision
    );
}

#[tokio::test(start_paused = true)]
async fn starting_with_mismatched_roles_rejects_without_repairing_settings() {
    let (mut room, _) = timer_room(Phase::Waiting, true);
    for id in ["3", "4"] {
        room.members.push(MemberState {
            view: Member {
                id: id.into(),
                nickname: id.into(),
                role: Role::Player,
                online: false,
            },
            token: [0; 16],
            connection: None,
            offline_since: None,
        });
    }
    room.settings = GameSettings::Bang(bang::GameConfig {
        roles: bang::RoleCounts::standard(5),
        ..Default::default()
    });
    let before = room.settings.clone();
    let peer = room.members[0].connection.clone().unwrap();
    assert_eq!(
        room.apply(
            &peer,
            ClientMessage::StartGame {
                v: PROTOCOL_VERSION
            },
            Instant::now()
        ),
        Err(ErrorCode::InvalidSettings)
    );
    assert_eq!(room.settings, before);
    assert_eq!(room.phase, Phase::Waiting);
    assert!(room.game.is_none());
}

#[tokio::test(start_paused = true)]
async fn changing_game_broadcasts_the_new_room_and_preserves_rejoin() {
    let (mut room, mut host_messages) = timer_room(Phase::Waiting, true);
    room.game_kind = GameKind::Uno;
    room.settings = module(GameKind::Uno).default_settings();
    let guest_token = [2; 16];
    room.members[1].token = guest_token;
    let (online_outgoing, mut online_messages) = mpsc::channel(QUEUE_CAPACITY);
    let (online_shutdown, _) = tokio::sync::watch::channel(None);
    room.members.push(MemberState {
        view: Member {
            id: "3".into(),
            nickname: "Guest".into(),
            role: Role::Player,
            online: true,
        },
        token: [3; 16],
        connection: Some(Peer {
            id: 3,
            outgoing: online_outgoing,
            shutdown: online_shutdown,
        }),
        offline_since: None,
    });
    room.next_id = 4;
    let previous = room.view("1");
    let host = room.members[0].connection.clone().unwrap();
    let (sender, receiver) = mpsc::channel(QUEUE_CAPACITY);
    let task = tokio::spawn(room.run(receiver));

    assert!(
        request(
            &sender,
            &host,
            ClientMessage::ChangeGame {
                v: PROTOCOL_VERSION,
                game: GameKind::Bang,
            }
        )
        .await
    );
    let ServerMessage::RoomState { room: changed, .. } = host_messages.recv().await.unwrap() else {
        panic!("Expected room state after changing game");
    };
    assert_eq!(changed.code, previous.code);
    assert_eq!(changed.host, previous.host);
    assert_eq!(changed.phase, Phase::Waiting);
    assert_eq!(changed.game, GameKind::Bang);
    assert_eq!(changed.settings, module(GameKind::Bang).default_settings());
    assert_eq!((changed.min_players, changed.max_players), (4, 7));
    let mut previous_members = previous.members;
    for member in &mut previous_members {
        member.role = Role::Spectator;
    }
    assert_eq!(changed.members, previous_members);
    let ServerMessage::RoomState {
        room: online_update,
        ..
    } = online_messages.try_recv().unwrap()
    else {
        panic!("Expected a room state for the connected guest");
    };
    let mut expected_online = changed.clone();
    expected_online.you = "3".into();
    assert_eq!(online_update, expected_online);

    let (outgoing, mut guest_messages) = mpsc::channel(QUEUE_CAPACITY);
    let (shutdown, _) = tokio::sync::watch::channel(None);
    let guest = Peer {
        id: 2,
        outgoing,
        shutdown,
    };
    let token = encode_token(&guest_token);
    assert!(
        request(
            &sender,
            &guest,
            ClientMessage::RejoinRoom {
                v: PROTOCOL_VERSION,
                room_code: changed.code.clone(),
                token: token.clone(),
            }
        )
        .await
    );
    let ServerMessage::Joined {
        room: rejoined,
        token: confirmed,
        game: None,
        ..
    } = guest_messages.recv().await.unwrap()
    else {
        panic!("Expected rejoin to the new game in the waiting room");
    };
    assert_eq!(confirmed, token);
    assert_eq!(rejoined.you, "2");
    let mut expected = changed;
    expected.you = "2".into();
    expected.members[1].online = true;
    assert_eq!(rejoined, expected);
    drop(sender);
    task.await.unwrap();
}
