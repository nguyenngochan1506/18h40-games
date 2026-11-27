pub mod bang;
pub mod cats;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const PROTOCOL_VERSION: u32 = 9;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum GameKind {
    Bang,
    Uno,
    Werewolf,
    Cats,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "game", content = "payload", rename_all = "snake_case")]
pub enum GameSettings {
    Bang(::bang::GameConfig),
    Uno(uno::Settings),
    Werewolf(werewolf::Settings),
    Cats(::cats::Settings),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "game", content = "payload", rename_all = "snake_case")]
pub enum GameAction {
    Bang(::bang::Action),
    Uno(uno::Action),
    Werewolf(werewolf::Action),
    Cats(::cats::Action),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "game", content = "payload", rename_all = "snake_case")]
pub enum GameView {
    Bang(bang::BangView),
    Uno(uno::View),
    Werewolf(werewolf::View),
    Cats(cats::CatsView),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "game", rename_all = "snake_case")]
pub enum GameDelta {
    Bang {
        events: bang::BangEvents,
        view: bang::BangView,
    },
    Uno {
        events: uno::Events,
        view: uno::View,
    },
    Werewolf {
        events: werewolf::Events,
        view: werewolf::View,
    },
    Cats {
        events: cats::CatsEvents,
        view: cats::CatsView,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Ping {
        v: u32,
        nonce: u32,
    },
    VoiceToken {
        v: u32,
        nonce: u32,
    },
    VoiceLeave {
        v: u32,
        nonce: u32,
    },
    CreateRoom {
        v: u32,
        nickname: String,
        game: GameKind,
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
    ChangeGame {
        v: u32,
        game: GameKind,
    },
    StartGame {
        v: u32,
    },
    UpdateSettings {
        v: u32,
        settings: GameSettings,
    },
    GameAction {
        v: u32,
        action: GameAction,
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
        update: GameDelta,
    },
    GameOver {
        v: u32,
        seq: u32,
        update: GameDelta,
    },
    Joined {
        v: u32,
        room_code: String,
        token: String,
        room: RoomView,
        game: Option<GameSnapshot>,
        voice_enabled: bool,
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
    VoiceTokenResult {
        v: u32,
        nonce: u32,
        result: VoiceTokenResult,
    },
    VoiceLeaveResult {
        v: u32,
        nonce: u32,
        error: Option<VoiceError>,
    },
    Error {
        v: u32,
        code: ErrorCode,
        message: String,
    },
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum VoiceTokenResult {
    Ok {
        url: String,
        token: String,
        #[ts(type = "number")]
        expires_at: u64,
    },
    Error {
        code: VoiceError,
    },
}

impl std::fmt::Debug for VoiceTokenResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Ok { expires_at, .. } => f
                .debug_struct("Ok")
                .field("expires_at", expires_at)
                .finish_non_exhaustive(),
            Self::Error { code } => f.debug_struct("Error").field("code", code).finish(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum VoiceError {
    VoiceDisabled,
    NotInRoom,
    VoiceUnavailable,
    RateLimited,
}

/// Public identity fixed at start_game, including members who later leave.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct GameSeat {
    pub player_id: usize,
    pub member_id: String,
    pub nickname: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct GameSnapshot {
    pub seq: u32,
    pub seats: Vec<GameSeat>,
    pub view: GameView,
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
    InvalidSettings,
    GameUnavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
pub struct RoomView {
    pub game: GameKind,
    pub settings: GameSettings,
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
    use crate::bang::{BangEvents, BangView};
    use crate::cats::CatsView;
    use serde_json::{Value, json};

    #[test]
    fn room_messages_round_trip_and_require_version_and_field_types() {
        let clients = [
            json!({"v":PROTOCOL_VERSION,"type":"create_room","game":"bang","nickname":"Hân"}),
            json!({"v":PROTOCOL_VERSION,"type":"join_room","room_code":"ABCDE","nickname":"Hân"}),
            json!({"v":PROTOCOL_VERSION,"type":"rejoin_room","room_code":"ABCDE","token":"secret"}),
            json!({"v":PROTOCOL_VERSION,"type":"leave_room"}),
            json!({"v":PROTOCOL_VERSION,"type":"take_seat"}),
            json!({"v":PROTOCOL_VERSION,"type":"voice_token","nonce":1}),
            json!({"v":PROTOCOL_VERSION,"type":"voice_leave","nonce":2}),
            json!({"v":PROTOCOL_VERSION,"type":"change_game","game":"uno"}),
            json!({"v":PROTOCOL_VERSION,"type":"start_game"}),
            json!({"v":PROTOCOL_VERSION,"type":"end_game"}),
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
        let room = json!({"code":"ABCDE","game":"bang","settings":GameSettings::Bang(::bang::GameConfig::default()),"phase":"waiting","host":"1","you":"1","min_players":4,"max_players":7,"members":[{"id":"1","nickname":"Hân","role":"player","online":true}]});
        for value in [
            json!({"v":PROTOCOL_VERSION,"type":"joined","room_code":"ABCDE","token":"secret","room":room,"game":null,"voice_enabled":false}),
            json!({"v":PROTOCOL_VERSION,"type":"room_state","room":room}),
            json!({"v":PROTOCOL_VERSION,"type":"left"}),
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
            ("game", json!("unknown")),
        ] {
            let mut invalid = room.clone();
            invalid[field] = bad;
            assert!(serde_json::from_value::<RoomView>(invalid).is_err());
        }
    }

    #[test]
    fn creating_a_room_requires_a_known_game_kind() {
        let valid =
            json!({"v":PROTOCOL_VERSION,"type":"create_room","nickname":"Host","game":"bang"});
        assert!(matches!(
            serde_json::from_value::<ClientMessage>(valid.clone()).unwrap(),
            ClientMessage::CreateRoom {
                game: GameKind::Bang,
                ..
            }
        ));
        for game in [json!("unknown"), Value::Null, json!(42)] {
            let mut invalid = valid.clone();
            invalid["game"] = game;
            assert!(serde_json::from_value::<ClientMessage>(invalid).is_err());
        }
        let mut missing = valid;
        missing.as_object_mut().unwrap().remove("game");
        assert!(serde_json::from_value::<ClientMessage>(missing).is_err());
    }

    #[test]
    fn client_round_trip_has_version_and_type() {
        let message = ClientMessage::Ping {
            v: PROTOCOL_VERSION,
            nonce: u32::MAX,
        };
        let value = serde_json::to_value(&message).unwrap();
        assert_eq!(
            value,
            json!({"v": PROTOCOL_VERSION, "type": "ping", "nonce": u32::MAX})
        );
        assert_eq!(
            serde_json::from_value::<ClientMessage>(value).unwrap(),
            message
        );
    }

    #[test]
    fn server_round_trips_have_version_and_type() {
        let messages = [
            ServerMessage::Pong {
                v: PROTOCOL_VERSION,
                nonce: 42,
            },
            ServerMessage::Error {
                v: PROTOCOL_VERSION,
                code: ErrorCode::UnsupportedVersion,
                message: "Unsupported protocol version".into(),
            },
            ServerMessage::Error {
                v: PROTOCOL_VERSION,
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
            json!({"v": PROTOCOL_VERSION, "type": "ping", "nonce": "1"}),
            json!({"v": PROTOCOL_VERSION, "type": "ping", "nonce": -1}),
            json!({"v": PROTOCOL_VERSION, "type": "ping", "nonce": 4294967296_u64}),
            json!({"v": PROTOCOL_VERSION, "type": "ping"}),
            json!({"v": PROTOCOL_VERSION, "nonce": 1}),
            json!({"v": PROTOCOL_VERSION, "type": "unknown"}),
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
            json!({"v": PROTOCOL_VERSION, "type": "pong", "nonce": "1"}),
            json!({"v": PROTOCOL_VERSION, "type": "error", "code": "unknown", "message": "Invalid"}),
            Value::Null,
        ] {
            assert!(serde_json::from_value::<ServerMessage>(value).is_err());
        }
    }
    #[test]
    fn game_messages_round_trip_require_version_and_filter_private_events() {
        let table = ::bang::SpectatorView {
            players: vec![],
            turn: ::bang::TurnState {
                player: ::bang::PlayerId(0),
                step: ::bang::TurnStep::Play,
                bangs_played: 0,
            },
            waiting: None,
            draw_count: 80,
            discard_count: 0,
            discard_top: None,
            winner: None,
            store_slots: 0,
        };
        let player = BangView::Player(::bang::PlayerView {
            you: ::bang::PlayerId(0),
            hand: vec![::bang::CardId(0)],
            choices: vec![],
            table: table.clone(),
        });
        let public = BangView::Spectator(table);
        let raw = vec![
            ::bang::Event {
                visibility: ::bang::Visibility::Public,
                kind: ::bang::EventKind::CardsDrawn {
                    player: ::bang::PlayerId(0),
                    count: 1,
                },
            },
            ::bang::Event {
                visibility: ::bang::Visibility::Player(::bang::PlayerId(0)),
                kind: ::bang::EventKind::CardsReceived {
                    player: ::bang::PlayerId(0),
                    cards: vec![::bang::CardId(0)],
                },
            },
        ];
        let hidden = BangEvents::for_recipient(&raw, None);
        assert_eq!(
            serde_json::to_value(&hidden)
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            serde_json::to_value(BangEvents::for_recipient(&raw, Some(::bang::PlayerId(0))))
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            2
        );
        let seats = vec![GameSeat {
            player_id: 0,
            member_id: "1".into(),
            nickname: "Hân".into(),
        }];
        for message in [
            ServerMessage::GameStarted {
                v: PROTOCOL_VERSION,
                seq: 0,
                seats: seats.clone(),
                view: GameView::Bang(player.clone()),
            },
            ServerMessage::GameUpdate {
                v: PROTOCOL_VERSION,
                seq: 1,
                update: GameDelta::Bang {
                    events: hidden.clone(),
                    view: public.clone(),
                },
            },
            ServerMessage::GameOver {
                v: PROTOCOL_VERSION,
                seq: 2,
                update: GameDelta::Bang {
                    events: hidden,
                    view: public,
                },
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
            ClientMessage::HostSkip {
                v: PROTOCOL_VERSION,
            },
            ClientMessage::GameAction {
                v: PROTOCOL_VERSION,
                action: GameAction::Bang(::bang::Action::EndTurn { discard: vec![] }),
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
        let joined = ServerMessage::Joined { v: PROTOCOL_VERSION, room_code: "ABCDE".into(), token: "secret".into(), game: Some(GameSnapshot { seq: 2, seats, view: GameView::Bang(player) }), voice_enabled: false, room: serde_json::from_value(json!({"code":"ABCDE","game":"bang","settings":GameSettings::Bang(::bang::GameConfig::default()),"phase":"playing","host":"1","you":"1","min_players":4,"max_players":7,"members":[]})).unwrap() };
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

    #[test]
    fn settings_messages_require_typed_modes_and_role_counts() {
        let valid = json!({"v":PROTOCOL_VERSION,"type":"update_settings","settings":GameSettings::Bang(::bang::GameConfig::default())});
        let message: ClientMessage = serde_json::from_value(valid.clone()).unwrap();
        assert_eq!(serde_json::to_value(message).unwrap(), valid);
        for bad in [json!("unknown"), Value::Null, json!(1)] {
            let mut value = valid.clone();
            value["settings"]["payload"]["mode"] = bad;
            assert!(serde_json::from_value::<ClientMessage>(value).is_err());
        }
        for bad in [json!(-1), json!(256), json!(1.5), Value::Null, json!("1")] {
            let mut value = valid.clone();
            value["settings"]["payload"]["roles"]["deputy"] = bad;
            assert!(serde_json::from_value::<ClientMessage>(value).is_err());
        }
        for field in ["mode", "roles"] {
            let mut value = valid.clone();
            value["settings"]["payload"]
                .as_object_mut()
                .unwrap()
                .remove(field);
            assert!(serde_json::from_value::<ClientMessage>(value).is_err());
        }
    }
    #[test]
    fn all_game_envelopes_round_trip_and_require_their_tagged_payloads() {
        for game in ["bang", "uno", "werewolf", "cats"] {
            let create =
                json!({"v":PROTOCOL_VERSION,"type":"create_room","game":game,"nickname":"Host"});
            let decoded: ClientMessage = serde_json::from_value(create.clone()).unwrap();
            assert_eq!(serde_json::to_value(decoded).unwrap(), create);
        }
        for (game, payload) in [
            ("bang", json!(::bang::GameConfig::default())),
            ("uno", json!({})),
            ("werewolf", json!({})),
            ("cats", json!(::cats::Settings::default())),
        ] {
            let value = json!({"game":game,"payload":payload});
            let settings: GameSettings = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(settings).unwrap(), value);
        }
        for game in ["uno", "werewolf"] {
            let view = json!({"game":game,"payload":{}});
            let decoded: GameView = serde_json::from_value(view.clone()).unwrap();
            assert_eq!(serde_json::to_value(decoded).unwrap(), view);
            let update = json!({"game":game,"events":{},"view":{}});
            let decoded: GameDelta = serde_json::from_value(update.clone()).unwrap();
            assert_eq!(serde_json::to_value(decoded).unwrap(), update);
        }
        let cats_view = CatsView::Spectator(::cats::SpectatorView {
            settings: ::cats::Settings::default(),
            players: vec![],
            turn: ::cats::TurnState {
                player: ::cats::PlayerId(0),
                turns_left: 1,
                direction: 1,
            },
            deck_count: 0,
            tower_stash_count: 0,
            top_known: None,
            imploding_face_up: false,
            discard: vec![],
            decision: None,
            last_action: None,
            winner: None,
        });
        let cats_update = GameDelta::Cats {
            events: crate::cats::CatsEvents::for_recipient(&[], None),
            view: cats_view.clone(),
        };
        let value = serde_json::to_value(&cats_update).unwrap();
        assert_eq!(
            serde_json::from_value::<GameDelta>(value.clone()).unwrap(),
            cats_update
        );
        assert_eq!(value["game"], "cats");
        assert!(serde_json::from_value::<GameDelta>(json!({"game":"cats"})).is_err());
        assert!(
            serde_json::from_value::<GameDelta>(json!({"game":"cats","events":[],"view":{}}))
                .is_err()
        );
        let view = serde_json::to_value(GameView::Cats(cats_view)).unwrap();
        assert_eq!(view["game"], "cats");
        assert!(serde_json::from_value::<GameView>(json!({"game":"cats","payload":{}})).is_err());
        for bad in [
            json!({"payload":{}}),
            json!({"game":"unknown","payload":{}}),
            json!({"game":"bang"}),
            json!({"game":"uno","payload":null}),
            json!({"game":"werewolf","payload":42}),
            json!({"game":"cats","payload":42}),
        ] {
            assert!(serde_json::from_value::<GameSettings>(bad.clone()).is_err());
            assert!(serde_json::from_value::<GameAction>(bad.clone()).is_err());
            assert!(serde_json::from_value::<GameView>(bad).is_err());
        }
        let bang_action = json!({"type":"end_turn","discard":[]});
        for game in ["uno", "werewolf", "cats", "unknown"] {
            assert!(
                serde_json::from_value::<GameAction>(json!({"game":game,"payload":bang_action}))
                    .is_err()
            );
        }
        for bad in [
            json!({"game":"bang","events":[],"view":{}}),
            json!({"game":"unknown","events":{},"view":{}}),
            json!({"game":"uno","view":{}}),
            json!({"game":"werewolf","events":{}}),
            json!({"game":"cats","events":{},"view":{}}),
        ] {
            assert!(serde_json::from_value::<GameDelta>(bad).is_err());
        }
    }
}
