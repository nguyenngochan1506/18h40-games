use crate::model::{CardId, Character, Expansion};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

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
        let (deputy, outlaw, renegade) = match players.clamp(4, 8) {
            4 => (0, 2, 1),
            5 => (1, 2, 1),
            6 => (1, 3, 1),
            7 => (2, 3, 1),
            _ => (2, 3, 2),
        };
        Self {
            deputy,
            outlaw,
            renegade,
        }
    }

    /// Base game: 4 to 7 players.
    pub fn valid_for(self, players: usize) -> bool {
        self.valid_within(players, 7)
    }

    /// Valid for 4..=`max_players` seats (`GameConfig::max_players`).
    pub fn valid_within(self, players: usize, max_players: usize) -> bool {
        (4..=max_players).contains(&players)
            && 1 + usize::from(self.deputy) + usize::from(self.outlaw) + usize::from(self.renegade)
                == players
            && (self.outlaw > 0 || self.renegade > 0)
    }
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GameConfig {
    pub mode: GameMode,
    pub roles: RoleCounts,
    /// Enabled expansions; empty (the default, also when absent) is the plain base game.
    #[serde(default)]
    pub expansions: BTreeSet<Expansion>,
}

impl Default for GameConfig {
    fn default() -> Self {
        Self {
            mode: GameMode::Classic,
            roles: RoleCounts::standard(4),
            expansions: BTreeSet::new(),
        }
    }
}

impl GameConfig {
    pub fn has(&self, expansion: Expansion) -> bool {
        self.expansions.contains(&expansion)
    }

    /// Limit until interactions between expansions are reviewed: at most one expansion.
    pub fn expansions_valid(&self) -> bool {
        self.expansions.len() <= 1
    }

    pub fn max_players(&self) -> usize {
        self.expansions
            .iter()
            .map(|expansion| expansion.pack().max_players)
            .fold(7, usize::max)
    }

    /// Base deck (ids 0..80) followed by every enabled pack.
    pub fn deck(&self) -> Vec<CardId> {
        let mut ids: Vec<_> = (0..crate::model::DECK.len()).collect();
        for expansion in &self.expansions {
            let pack = expansion.pack();
            ids.extend(pack.first_card..pack.first_card + pack.cards.len());
        }
        ids.into_iter().map(|id| CardId(id as u8)).collect()
    }

    pub fn characters(&self) -> Vec<Character> {
        let mut characters = Character::ALL.to_vec();
        for expansion in &self.expansions {
            characters.extend_from_slice(expansion.pack().characters);
        }
        characters
    }
}
