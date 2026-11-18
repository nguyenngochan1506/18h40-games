use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Ping {
        v: u32,
        nonce: u32,
    },
    CreateRoom {
        v: u32,
        nickname: String,
    },
    JoinRoom {
        v: u32,
        room_code: String,
        nickname: String,
    },
    RejoinRoom {
        v: u32,
        room_code: String,
        token: String,
    },
    LeaveRoom {
        v: u32,
    },
    TakeSeat {
        v: u32,
    },
    StartGame {
        v: u32,
    },
    GameAction {
        v: u32,
        action: bang::Action,
    },
    HostSkip {
        v: u32,
    },
    EndGame {
        v: u32,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    GameStarted {
        v: u32,
        seq: u32,
        seats: Vec<GameSeat>,
        view: GameView,
    },
    GameUpdate {
        v: u32,
        seq: u32,
        events: GameEvents,
        view: GameView,
    },
    GameOver {
        v: u32,
        seq: u32,
        events: GameEvents,
        view: GameView,
    },
    Joined {
        v: u32,
        room_code: String,
        token: String,
        room: RoomView,
        game: Option<GameSnapshot>,
    },
    RoomState {
        v: u32,
        room: RoomView,
    },
    Left {
        v: u32,
    },
    Pong {
        v: u32,
        nonce: u32,
    },
    Error {
        v: u32,
        code: ErrorCode,
        message: String,
    },
}

/// Public identity fixed at start_game, including members who later leave.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct GameSeat {
    pub player_id: bang::PlayerId,
    pub member_id: String,
    pub nickname: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct GameSnapshot {
    pub seq: u32,
    pub seats: Vec<GameSeat>,
    pub view: GameView,
}

/// Wire snapshots have no variant accepting a raw GameState.
///
/// ```compile_fail
/// fn outgoing(state: bang::GameState) -> protocol::GameView { state.into() }
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "perspective", content = "view", rename_all = "snake_case")]
pub enum GameView {
    Player(bang::PlayerView),
    Spectator(bang::SpectatorView),
}

/// Only filtered event kinds can be constructed for outgoing messages.
///
/// ```compile_fail
/// let raw: Vec<bang::Event> = vec![];
/// let outgoing: protocol::GameEvents = raw.into();
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct GameEvents(Vec<bang::EventKind>);

impl GameEvents {
    pub fn for_recipient(events: &[bang::Event], player: Option<bang::PlayerId>) -> Self {
        Self(
            bang::filter_events(events, player)
                .into_iter()
                .map(|event| event.kind)
                .collect(),
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    UnsupportedVersion,
    InvalidMessage,
    RoomNotFound,
    NicknameTaken,
    InvalidNickname,
    InvalidToken,
    AlreadyInRoom,
    NotInRoom,
    NotHost,
    WrongPhase,
    NotEnoughPlayers,
    NoFreeSeat,
    ServerBusy,
    IllegalAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct RoomView {
    pub code: String,
    pub phase: Phase,
    pub host: String,
    pub you: String,
    pub min_players: u32,
    pub max_players: u32,
    pub members: Vec<Member>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct Member {
    pub id: String,
    pub nickname: String,
    pub role: Role,
    pub online: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Waiting,
    Playing,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Player,
    Spectator,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    #[test]
    fn room_messages_round_trip_and_require_version_and_field_types() {
        let clients = [
            json!({"v":1,"type":"create_room","nickname":"Hân"}),
            json!({"v":1,"type":"join_room","room_code":"ABCDE","nickname":"Hân"}),
            json!({"v":1,"type":"rejoin_room","room_code":"ABCDE","token":"secret"}),
            json!({"v":1,"type":"leave_room"}),
            json!({"v":1,"type":"take_seat"}),
            json!({"v":1,"type":"start_game"}),
            json!({"v":1,"type":"end_game"}),
        ];
        for value in clients {
            let message: ClientMessage = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(message).unwrap(), value);
            let mut invalid = value.clone();
            invalid.as_object_mut().unwrap().remove("v");
            assert!(serde_json::from_value::<ClientMessage>(invalid).is_err());
            for field in value.as_object().unwrap().keys() {
                let mut invalid = value.clone();
                invalid[field] = Value::Null;
                assert!(serde_json::from_value::<ClientMessage>(invalid).is_err());
            }
        }
        let room = json!({"code":"ABCDE","phase":"waiting","host":"1","you":"1","min_players":4,"max_players":7,"members":[{"id":"1","nickname":"Hân","role":"player","online":true}]});
        for value in [
            json!({"v":1,"type":"joined","room_code":"ABCDE","token":"secret","room":room,"game":null}),
            json!({"v":1,"type":"room_state","room":room}),
            json!({"v":1,"type":"left"}),
        ] {
            let message: ServerMessage = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(message).unwrap(), value);
            let mut invalid = value.clone();
            invalid.as_object_mut().unwrap().remove("v");
            assert!(serde_json::from_value::<ServerMessage>(invalid).is_err());
            for field in value
                .as_object()
                .unwrap()
                .keys()
                .filter(|field| *field != "game")
            {
                let mut invalid = value.clone();
                invalid[field] = Value::Null;
                assert!(serde_json::from_value::<ServerMessage>(invalid).is_err());
            }
        }
        for (field, bad) in [
            ("phase", json!("unknown")),
            ("members", json!([{"id":1}])),
            ("min_players", json!("4")),
        ] {
            let mut invalid = room.clone();
            invalid[field] = bad;
            assert!(serde_json::from_value::<RoomView>(invalid).is_err());
        }
    }

    #[test]
    fn client_round_trip_has_version_and_type() {
        let message = ClientMessage::Ping {
            v: PROTOCOL_VERSION,
            nonce: u32::MAX,
        };
        let value = serde_json::to_value(&message).unwrap();
        assert_eq!(value, json!({"v": 1, "type": "ping", "nonce": u32::MAX}));
        assert_eq!(
            serde_json::from_value::<ClientMessage>(value).unwrap(),
            message
        );
    }

    #[test]
    fn server_round_trips_have_version_and_type() {
        let messages = [
            ServerMessage::Pong { v: 1, nonce: 42 },
            ServerMessage::Error {
                v: 1,
                code: ErrorCode::UnsupportedVersion,
                message: "Unsupported protocol version".into(),
            },
            ServerMessage::Error {
                v: 1,
                code: ErrorCode::InvalidMessage,
                message: "Invalid message".into(),
            },
        ];
        for message in messages {
            let value = serde_json::to_value(&message).unwrap();
            assert_eq!(value["v"], PROTOCOL_VERSION);
            assert!(matches!(value["type"].as_str(), Some("pong" | "error")));
            assert_eq!(
                serde_json::from_value::<ServerMessage>(value).unwrap(),
                message
            );
        }
    }

    #[test]
    fn rejects_missing_version_and_invalid_client_fields() {
        for value in [
            json!({"type": "ping", "nonce": 1}),
            json!({"v": "1", "type": "ping", "nonce": 1}),
            json!({"v": 1, "type": "ping", "nonce": "1"}),
            json!({"v": 1, "type": "ping", "nonce": -1}),
            json!({"v": 1, "type": "ping", "nonce": 4294967296_u64}),
            json!({"v": 1, "type": "ping"}),
            json!({"v": 1, "nonce": 1}),
            json!({"v": 1, "type": "unknown"}),
        ] {
            assert!(serde_json::from_value::<ClientMessage>(value).is_err());
        }
    }

    #[test]
    fn rejects_missing_version_and_invalid_server_fields() {
        for value in [
            json!({"type": "pong", "nonce": 1}),
            json!({"type": "error", "code": "invalid_message", "message": "Invalid"}),
            json!({"v": false, "type": "pong", "nonce": 1}),
            json!({"v": 1, "type": "pong", "nonce": "1"}),
            json!({"v": 1, "type": "error", "code": "unknown", "message": "Invalid"}),
            Value::Null,
        ] {
            assert!(serde_json::from_value::<ServerMessage>(value).is_err());
        }
    }
    #[test]
    fn game_messages_round_trip_require_version_and_filter_private_events() {
        let table = bang::SpectatorView {
            players: vec![],
            turn: bang::TurnState {
                player: bang::PlayerId(0),
                step: bang::TurnStep::Play,
                bangs_played: 0,
            },
            waiting: None,
            draw_count: 80,
            discard_count: 0,
            discard_top: None,
            winner: None,
            store_pool: vec![],
        };
        let player = GameView::Player(bang::PlayerView {
            you: bang::PlayerId(0),
            hand: vec![bang::CardId(0)],
            choices: vec![],
            table: table.clone(),
        });
        let public = GameView::Spectator(table);
        let raw = vec![
            bang::Event {
                visibility: bang::Visibility::Public,
                kind: bang::EventKind::CardsDrawn {
                    player: bang::PlayerId(0),
                    count: 1,
                },
            },
            bang::Event {
                visibility: bang::Visibility::Player(bang::PlayerId(0)),
                kind: bang::EventKind::CardsReceived {
                    player: bang::PlayerId(0),
                    cards: vec![bang::CardId(0)],
                },
            },
        ];
        let hidden = GameEvents::for_recipient(&raw, None);
        assert_eq!(
            serde_json::to_value(&hidden)
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            serde_json::to_value(GameEvents::for_recipient(&raw, Some(bang::PlayerId(0))))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let seats = vec![GameSeat {
            player_id: bang::PlayerId(0),
            member_id: "1".into(),
            nickname: "Hân".into(),
        }];
        for message in [
            ServerMessage::GameStarted {
                v: 1,
                seq: 0,
                seats: seats.clone(),
                view: player.clone(),
            },
            ServerMessage::GameUpdate {
                v: 1,
                seq: 1,
                events: hidden.clone(),
                view: public.clone(),
            },
            ServerMessage::GameOver {
                v: 1,
                seq: 2,
                events: hidden,
                view: public,
            },
        ] {
            let value = serde_json::to_value(&message).unwrap();
            assert_eq!(
                serde_json::from_value::<ServerMessage>(value.clone()).unwrap(),
                message
            );
            for field in value.as_object().unwrap().keys() {
                let mut missing = value.clone();
                missing.as_object_mut().unwrap().remove(field);
                assert!(
                    serde_json::from_value::<ServerMessage>(missing).is_err(),
                    "Missing {field} must fail"
                );
            }
        }
        for message in [
            ClientMessage::HostSkip { v: 1 },
            ClientMessage::GameAction {
                v: 1,
                action: bang::Action::EndTurn { discard: vec![] },
            },
        ] {
            let value = serde_json::to_value(&message).unwrap();
            assert_eq!(
                serde_json::from_value::<ClientMessage>(value.clone()).unwrap(),
                message
            );
            let mut missing = value;
            missing.as_object_mut().unwrap().remove("v");
            assert!(serde_json::from_value::<ClientMessage>(missing).is_err());
        }
        let joined = ServerMessage::Joined { v: 1, room_code: "ABCDE".into(), token: "secret".into(), game: Some(GameSnapshot { seq: 2, seats, view: player }), room: serde_json::from_value(json!({"code":"ABCDE","phase":"playing","host":"1","you":"1","min_players":4,"max_players":7,"members":[]})).unwrap() };
        for field in ["seq", "seats", "view"] {
            let mut value = serde_json::to_value(&joined).unwrap();
            value["game"].as_object_mut().unwrap().remove(field);
            assert!(serde_json::from_value::<ServerMessage>(value).is_err());
        }
        for field in ["player_id", "member_id", "nickname"] {
            let mut value = serde_json::to_value(&joined).unwrap();
            value["game"]["seats"][0]
                .as_object_mut()
                .unwrap()
                .remove(field);
            assert!(serde_json::from_value::<ServerMessage>(value).is_err());
        }
        assert_eq!(
            serde_json::from_str::<ServerMessage>(&serde_json::to_string(&joined).unwrap())
                .unwrap(),
            joined
        );
    }
}
