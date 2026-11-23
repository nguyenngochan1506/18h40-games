use server::{Config, VoiceConfig};
use std::{str::FromStr, time::Duration};

fn setting<T: FromStr>(name: &str, default: T) -> Result<T, Box<dyn std::error::Error>> {
    match std::env::var(name) {
        Ok(value) => value.parse().map_err(|_| format!("Invalid {name}").into()),
        Err(std::env::VarError::NotPresent) => Ok(default),
        Err(error) => Err(error.into()),
    }
}

fn voice_config() -> Option<VoiceConfig> {
    let get = |name| std::env::var(name).unwrap_or_default();
    let voice = match setting("VOICE_ENABLED", false) {
        Ok(false) => return None,
        Ok(true) => VoiceConfig::new(
            &get("LIVEKIT_PUBLIC_URL"),
            &get("LIVEKIT_INTERNAL_URL"),
            &get("LIVEKIT_API_KEY"),
            &get("LIVEKIT_API_SECRET"),
            &std::env::var("LIVEKIT_ROOM_NAMESPACE").unwrap_or_else(|_| "18h40".into()),
        ),
        Err(_) => Err("Invalid VOICE_ENABLED"),
    };
    voice
        .inspect_err(|reason| tracing::warn!(%reason, "Room voice disabled"))
        .ok()
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();
    let defaults = Config::default();
    let config = Config {
        game_seed: None,
        offline_timeout: Duration::from_secs(setting(
            "OFFLINE_TIMEOUT_SECS",
            defaults.offline_timeout.as_secs(),
        )?),
        empty_room_timeout: Duration::from_secs(setting(
            "EMPTY_ROOM_TIMEOUT_SECS",
            defaults.empty_room_timeout.as_secs(),
        )?),
        max_members: setting("MAX_ROOM_MEMBERS", defaults.max_members)?,
        max_rooms: setting("MAX_ROOMS", defaults.max_rooms)?,
        max_message_bytes: setting("MAX_MESSAGE_BYTES", defaults.max_message_bytes)?,
        allowed_origins: std::env::var("ALLOWED_ORIGINS")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(str::to_owned)
            .collect(),
        voice: voice_config(),
    };
    config.validate()?;
    let address = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:3000".into());
    let listener = tokio::net::TcpListener::bind(&address).await?;
    tracing::info!(address = %listener.local_addr()?, "Server listening");
    axum::serve(listener, server::app(config)).await?;
    Ok(())
}
