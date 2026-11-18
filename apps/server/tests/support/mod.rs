use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use server::Config;
use tokio::{net::TcpStream, task::JoinHandle};
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async, tungstenite::Message};

pub struct TestServer {
    pub url: String,
    task: JoinHandle<()>,
    clock_guard: JoinHandle<()>,
}

impl TestServer {
    pub async fn new(config: Config) -> Self {
        // Real socket I/O must not make Tokio auto-advance the paused clock.
        let clock_guard = tokio::spawn(async {
            loop {
                tokio::task::yield_now().await;
            }
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("ws://{}/ws", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            axum::serve(listener, server::app(config)).await.unwrap();
        });
        Self {
            url,
            task,
            clock_guard,
        }
    }
    pub async fn connect(&self) -> Client {
        Client(connect_async(&self.url).await.unwrap().0)
    }
    pub async fn create(&self, name: &str) -> (Client, Value) {
        let mut client = self.connect().await;
        client
            .send(json!({"type":"create_room","nickname":name}))
            .await;
        let joined = client.until("joined").await;
        (client, joined)
    }
    pub async fn join(&self, code: &str, name: &str) -> (Client, Value) {
        let mut client = self.connect().await;
        client
            .send(json!({"type":"join_room","room_code":code,"nickname":name}))
            .await;
        let joined = client.until("joined").await;
        (client, joined)
    }
}
impl Drop for TestServer {
    fn drop(&mut self) {
        self.task.abort();
        self.clock_guard.abort();
    }
}

pub struct Client(pub WebSocketStream<MaybeTlsStream<TcpStream>>);
impl Client {
    pub async fn send(&mut self, mut value: Value) {
        value["v"] = json!(1);
        self.0
            .send(Message::Text(value.to_string().into()))
            .await
            .unwrap();
    }
    pub async fn receive(&mut self) -> Value {
        let text = self.0.next().await.unwrap().unwrap().into_text().unwrap();
        let value: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["v"], 1);
        if value["type"] == "room_state" {
            assert!(
                !text.contains("token"),
                "A public snapshot must not contain session tokens"
            );
        }
        value
    }
    pub async fn until(&mut self, kind: &str) -> Value {
        loop {
            let value = self.receive().await;
            assert_ne!(value["type"], "error", "Unexpected error: {value}");
            if value["type"] == kind {
                return value;
            }
        }
    }
    pub async fn error(&mut self, code: &str) {
        loop {
            let value = self.receive().await;
            if value["type"] == "error" {
                assert_eq!(value["code"], code);
                return;
            }
            assert!(matches!(
                value["type"].as_str(),
                Some("room_state" | "game_started" | "game_update" | "game_over")
            ));
        }
    }
    pub async fn state(&mut self, predicate: impl Fn(&Value) -> bool) -> Value {
        loop {
            let value = self.until("room_state").await;
            if predicate(&value["room"]) {
                return value["room"].clone();
            }
        }
    }
    pub async fn disconnect(&mut self) {
        self.0.close(None).await.unwrap();
        loop {
            if matches!(self.0.next().await.unwrap().unwrap(), Message::Close(_)) {
                break;
            }
        }
    }
}
