use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GameMode {
    #[default]
    Classic,
    Club,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RoleCounts {
    pub deputy: u8,
    pub outlaw: u8,
    pub renegade: u8,
}

impl RoleCounts {
    pub fn standard(players: usize) -> Self {
        // Waiting rooms below four players display the four-player preset.
        let (deputy, outlaw) = match players.clamp(4, 7) {
            4 => (0, 2),
            5 => (1, 2),
            6 => (1, 3),
            _ => (2, 3),
        };
        Self {
            deputy,
            outlaw,
            renegade: 1,
        }
    }

    pub fn valid_for(self, players: usize) -> bool {
        (4..=7).contains(&players)
            && 1 + usize::from(self.deputy) + usize::from(self.outlaw) + usize::from(self.renegade)
                == players
            && (self.outlaw > 0 || self.renegade > 0)
    }
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameConfig {
    pub mode: GameMode,
    pub roles: RoleCounts,
}

impl Default for GameConfig {
    fn default() -> Self {
        Self {
            mode: GameMode::Classic,
            roles: RoleCounts::standard(4),
        }
    }
}
