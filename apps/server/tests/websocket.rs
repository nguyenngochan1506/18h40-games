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
            let sent_version = match &frame {
                Message::Text(text) => serde_json::from_str::<Value>(text).ok().and_then(|v| v["v"].as_u64()),
                _ => None,
            };
            socket.send(frame).await.unwrap();
            let response = socket.next().await.unwrap().unwrap().into_text().unwrap();
            match serde_json::from_str::<ServerMessage>(&response).unwrap() {
                ServerMessage::Error { v, code, message } => {
                    // A mismatched version is echoed so that client can read the error.
                    let expected_v = match (expected_code, sent_version) {
                        (ErrorCode::UnsupportedVersion, Some(sent)) => sent as u32,
                        _ => PROTOCOL_VERSION,
                    };
                    assert_eq!(v, expected_v);
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

// A deployed v9 client rejects frames whose `v` is not 9, so the version error must echo 9.
#[tokio::test]
async fn a_v9_client_gets_a_readable_version_error_and_cannot_enter_or_play() {
    tokio::time::timeout(Duration::from_secs(10), async {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, server::app(server::Config::default()))
                .await
                .unwrap()
        });
        let (mut socket, _) = connect_async(format!("ws://{address}/ws")).await.unwrap();
        for old in [
            r#"{"v":9,"type":"create_room","nickname":"Old","game":"bang"}"#,
            r#"{"v":9,"type":"rejoin_room","room_code":"ABCDE","token":"00000000000000000000000000000000"}"#,
            r#"{"v":9,"type":"game_action","action":{"game":"bang","payload":{"type":"chuck_draw"}}}"#,
        ] {
            socket.send(Message::Text(old.into())).await.unwrap();
            let reply = socket.next().await.unwrap().unwrap().into_text().unwrap();
            let reply: Value = serde_json::from_str(&reply).unwrap();
            assert_eq!(reply["type"], "error");
            assert_eq!(reply["code"], "unsupported_version");
            assert_eq!(reply["v"], 9);
            // The connection stays usable and, having been refused, is not in any room.
            socket
                .send(Message::Text(
                    json!({"v":PROTOCOL_VERSION,"type":"ping","nonce":5}).to_string().into(),
                ))
                .await
                .unwrap();
            let pong = socket.next().await.unwrap().unwrap().into_text().unwrap();
            assert_eq!(
                serde_json::from_str::<ServerMessage>(&pong).unwrap(),
                ServerMessage::Pong { v: PROTOCOL_VERSION, nonce: 5 }
            );
        }
        socket
            .send(Message::Text(
                json!({"v":PROTOCOL_VERSION,"type":"leave_room"}).to_string().into(),
            ))
            .await
            .unwrap();
        let reply = socket.next().await.unwrap().unwrap().into_text().unwrap();
        assert_eq!(serde_json::from_str::<Value>(&reply).unwrap()["code"], "not_in_room");
        server.abort();
    })
    .await
    .expect("WebSocket integration test timed out");
}

// A deployed v10 client predates Cats and rejects frames whose `v` is not 10, so the
// server must reject v10 messages with `unsupported_version` echoing `v: 10`.
#[tokio::test]
async fn a_v10_client_gets_a_readable_version_error_and_cannot_enter_or_play() {
    tokio::time::timeout(Duration::from_secs(10), async {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, server::app(server::Config::default()))
                .await
                .unwrap()
        });
        let (mut socket, _) = connect_async(format!("ws://{address}/ws")).await.unwrap();
        for old in [
            r#"{"v":10,"type":"create_room","nickname":"Old","game":"bang"}"#,
            r#"{"v":10,"type":"create_room","nickname":"Old","game":"cats"}"#,
            r#"{"v":10,"type":"join_room","room_code":"ABCDE","nickname":"Old"}"#,
            r#"{"v":10,"type":"rejoin_room","room_code":"ABCDE","token":"00000000000000000000000000000000"}"#,
            r#"{"v":10,"type":"game_action","action":{"game":"cats","payload":{"type":"draw"}}}"#,
        ] {
            socket.send(Message::Text(old.into())).await.unwrap();
            let reply = socket.next().await.unwrap().unwrap().into_text().unwrap();
            let reply: Value = serde_json::from_str(&reply).unwrap();
            assert_eq!(reply["type"], "error");
            assert_eq!(reply["code"], "unsupported_version");
            assert_eq!(reply["v"], 10);
            socket
                .send(Message::Text(
                    json!({"v":PROTOCOL_VERSION,"type":"ping","nonce":6}).to_string().into(),
                ))
                .await
                .unwrap();
            let pong = socket.next().await.unwrap().unwrap().into_text().unwrap();
            assert_eq!(
                serde_json::from_str::<ServerMessage>(&pong).unwrap(),
                ServerMessage::Pong { v: PROTOCOL_VERSION, nonce: 6 }
            );
        }
        socket
            .send(Message::Text(
                json!({"v":PROTOCOL_VERSION,"type":"leave_room"}).to_string().into(),
            ))
            .await
            .unwrap();
        let reply = socket.next().await.unwrap().unwrap().into_text().unwrap();
        assert_eq!(serde_json::from_str::<Value>(&reply).unwrap()["code"], "not_in_room");
        server.abort();
    })
    .await
    .expect("WebSocket integration test timed out");
}
