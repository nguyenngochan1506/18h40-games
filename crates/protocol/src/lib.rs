use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Ping { v: u32, nonce: u32 },
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMessage {
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

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    UnsupportedVersion,
    InvalidMessage,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

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
