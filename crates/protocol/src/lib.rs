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
    EndGame {
        v: u32,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
    Joined {
        v: u32,
        room_code: String,
        token: String,
        room: RoomView,
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
            json!({"v":1,"type":"joined","room_code":"ABCDE","token":"secret","room":room}),
            json!({"v":1,"type":"room_state","room":room}),
            json!({"v":1,"type":"left"}),
        ] {
            let message: ServerMessage = serde_json::from_value(value.clone()).unwrap();
            assert_eq!(serde_json::to_value(message).unwrap(), value);
            let mut invalid = value.clone();
            invalid.as_object_mut().unwrap().remove("v");
            assert!(serde_json::from_value::<ServerMessage>(invalid).is_err());
            for field in value.as_object().unwrap().keys() {
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
}
