use std::time::Duration;

use crate::VoiceConfig;

#[derive(Clone)]
pub struct Config {
    pub game_seed: Option<u64>,
    pub offline_timeout: Duration,
    pub empty_room_timeout: Duration,
    pub max_members: usize,
    pub max_rooms: usize,
    pub max_message_bytes: usize,
    pub allowed_origins: Vec<String>,
    pub voice: Option<VoiceConfig>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            game_seed: None,
            offline_timeout: Duration::from_secs(60),
            empty_room_timeout: Duration::from_secs(600),
            max_members: 32,
            max_rooms: 1000,
            max_message_bytes: 16 * 1024,
            allowed_origins: Vec::new(),
            voice: None,
        }
    }
}

impl Config {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.offline_timeout.is_zero()
            || self.empty_room_timeout.is_zero()
            || self.max_members == 0
            || self.max_rooms == 0
            || self.max_message_bytes == 0
        {
            return Err("Timeouts and limits must be greater than zero");
        }
        let now = tokio::time::Instant::now();
        if now.checked_add(self.offline_timeout).is_none()
            || now.checked_add(self.empty_room_timeout).is_none()
        {
            return Err("Timeouts are too large");
        }
        Ok(())
    }
}
