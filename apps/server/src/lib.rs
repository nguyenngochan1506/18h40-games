use axum::{
    Router,
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::Response,
    routing::get,
};
use futures_util::SinkExt;
use protocol::{ClientMessage, ErrorCode, PROTOCOL_VERSION, ServerMessage};
use serde::Deserialize;

pub fn app() -> Router {
    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/ws", get(upgrade))
}

async fn upgrade(ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(handle_socket)
}

#[derive(Deserialize)]
struct Version {
    v: u32,
}

fn error(code: ErrorCode, message: &str) -> ServerMessage {
    ServerMessage::Error {
        v: PROTOCOL_VERSION,
        code,
        message: message.into(),
    }
}

fn handle_text(text: &str) -> ServerMessage {
    let version = match serde_json::from_str::<Version>(text) {
        Ok(version) => version.v,
        Err(_) => return error(ErrorCode::InvalidMessage, "Invalid message"),
    };
    if version != PROTOCOL_VERSION {
        return error(
            ErrorCode::UnsupportedVersion,
            "Unsupported protocol version",
        );
    }
    match serde_json::from_str::<ClientMessage>(text) {
        Ok(ClientMessage::Ping { nonce, .. }) => ServerMessage::Pong {
            v: PROTOCOL_VERSION,
            nonce,
        },
        Err(_) => error(ErrorCode::InvalidMessage, "Invalid message"),
    }
}

async fn handle_socket(mut socket: WebSocket) {
    while let Some(Ok(frame)) = socket.recv().await {
        let response = match frame {
            Message::Text(text) => handle_text(&text),
            Message::Binary(_) => error(ErrorCode::InvalidMessage, "Expected a text frame"),
            Message::Close(_) => {
                let _ = socket.close().await;
                break;
            }
            Message::Ping(_) | Message::Pong(_) => continue,
        };
        let text = match serde_json::to_string(&response) {
            Ok(text) => text,
            Err(error) => {
                tracing::warn!(%error, "Could not serialize WebSocket response");
                break;
            }
        };
        if socket.send(Message::Text(text.into())).await.is_err() {
            break;
        }
    }
}
