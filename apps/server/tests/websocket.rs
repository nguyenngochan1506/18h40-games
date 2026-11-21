use futures_util::{SinkExt, StreamExt};
use protocol::{ErrorCode, PROTOCOL_VERSION, ServerMessage};
use serde_json::{Value, json};
use std::time::Duration;
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[tokio::test]
async fn ping_pong_and_errors_keep_the_connection_usable() {
    tokio::time::timeout(Duration::from_secs(10), async {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, server::app(server::Config::default()))
                .await
                .unwrap()
        });
        let (mut socket, _) = connect_async(format!("ws://{address}/ws")).await.unwrap();
        let current_message = |mut value: Value| {
            value["v"] = json!(PROTOCOL_VERSION);
            Message::Text(value.to_string().into())
        };

        let invalid_frames = [
            (
                current_message(json!({"type":"update_settings","settings":{"game":"bang","payload":{"mode":"unknown","roles":{"deputy":0,"outlaw":2,"renegade":1}}}})),
                ErrorCode::InvalidMessage,
            ),
            (
                current_message(json!({"type":"update_settings","settings":{"game":"bang","payload":{"mode":"classic","roles":{"deputy":-1,"outlaw":2,"renegade":1}}}})),
                ErrorCode::InvalidMessage,
            ),
            (
                current_message(json!({"type":"create_room","nickname":"Unknown","game":"unknown"})),
                ErrorCode::InvalidMessage,
            ),
            (
                current_message(json!({"type":"create_room","nickname":"Missing"})),
                ErrorCode::InvalidMessage,
            ),
            (
                current_message(json!({"type":"change_game","game":"unknown"})),
                ErrorCode::InvalidMessage,
            ),
            (
                current_message(json!({"type":"change_game"})),
                ErrorCode::InvalidMessage,
            ),
            (
                Message::Text(r#"{"v":7,"type":"ping","nonce":7}"#.into()),
                ErrorCode::UnsupportedVersion,
            ),
            (
                Message::Text(r#"{"v":6,"type":"game_action","action":{"type":"end_turn","discard":[]}}"#.into()),
                ErrorCode::UnsupportedVersion,
            ),
            (
                Message::Text(r#"{"v":6,"type":"update_settings","settings":{"mode":"classic","roles":{"deputy":0,"outlaw":2,"renegade":1}}}"#.into()),
                ErrorCode::UnsupportedVersion,
            ),
            (Message::Text("{".into()), ErrorCode::InvalidMessage),
            (
                Message::Text(r#"{"type":"ping","nonce":7}"#.into()),
                ErrorCode::InvalidMessage,
            ),
            (
                Message::Text(r#"{"v":"1","type":"ping","nonce":7}"#.into()),
                ErrorCode::InvalidMessage,
            ),
            (
                current_message(json!({"type":"unknown"})),
                ErrorCode::InvalidMessage,
            ),
            (
                current_message(json!({"type":"ping","nonce":"7"})),
                ErrorCode::InvalidMessage,
            ),
            (
                Message::Binary(vec![1, 2, 3].into()),
                ErrorCode::InvalidMessage,
            ),
        ];

        socket
            .send(current_message(json!({"type":"ping","nonce":0})))
            .await
            .unwrap();
        let response = socket.next().await.unwrap().unwrap().into_text().unwrap();
        assert_eq!(
            serde_json::from_str::<ServerMessage>(&response).unwrap(),
            ServerMessage::Pong {
                v: PROTOCOL_VERSION,
                nonce: 0
            }
        );

        for (frame, expected_code) in invalid_frames {
            socket.send(frame).await.unwrap();
            let response = socket.next().await.unwrap().unwrap().into_text().unwrap();
            match serde_json::from_str::<ServerMessage>(&response).unwrap() {
                ServerMessage::Error { v, code, message } => {
                    assert_eq!(v, PROTOCOL_VERSION);
                    assert_eq!(code, expected_code);
                    assert!(!message.is_empty());
                }
                other => panic!("Expected error, got {other:?}"),
            }
            socket
                .send(current_message(json!({"type":"ping","nonce":u32::MAX})))
                .await
                .unwrap();
            let response = socket.next().await.unwrap().unwrap().into_text().unwrap();
            assert_eq!(
                serde_json::from_str::<ServerMessage>(&response).unwrap(),
                ServerMessage::Pong {
                    v: PROTOCOL_VERSION,
                    nonce: u32::MAX
                }
            );
        }

        socket.close(None).await.unwrap();
        assert!(matches!(
            socket.next().await.unwrap().unwrap(),
            Message::Close(_)
        ));
        server.abort();
        assert!(server.await.unwrap_err().is_cancelled());
    })
    .await
    .expect("WebSocket integration test timed out");
}
