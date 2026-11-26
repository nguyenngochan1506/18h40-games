use serde::{Deserialize, Serialize};

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfPlayerId"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct PlayerId(pub usize);

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfRole"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Villager,
    Werewolf,
    AlphaWolf,
    Minion,
    Sorcerer,
    Seer,
    Bodyguard,
    Witch,
    Hunter,
    Cupid,
    Lycan,
    Cursed,
    Diseased,
    Prince,
    Mayor,
    Tanner,
}

impl Role {
    pub const ALL: [Role; 16] = [
        Role::Villager,
        Role::Werewolf,
        Role::AlphaWolf,
        Role::Minion,
        Role::Sorcerer,
        Role::Seer,
        Role::Bodyguard,
        Role::Witch,
        Role::Hunter,
        Role::Cupid,
        Role::Lycan,
        Role::Cursed,
        Role::Diseased,
        Role::Prince,
        Role::Mayor,
        Role::Tanner,
    ];

    /// Official Ultimate Werewolf: Deluxe Edition balance value.
    pub const fn balance_value(self) -> i32 {
        match self {
            Role::Villager => 1,
            Role::Werewolf => -6,
            Role::AlphaWolf => -9,
            Role::Minion => -6,
            Role::Sorcerer => -3,
            Role::Seer => 7,
            Role::Bodyguard => 3,
            Role::Witch => 4,
            Role::Hunter => 3,
            Role::Cupid => -3,
            Role::Lycan => -1,
            Role::Cursed => -3,
            Role::Diseased => 3,
            Role::Prince => 3,
            Role::Mayor => 2,
            Role::Tanner => -2,
        }
    }

    pub const fn initial_team(self) -> Team {
        match self {
            Role::Werewolf | Role::AlphaWolf | Role::Minion | Role::Sorcerer => Team::Werewolves,
            Role::Tanner => Team::Tanner,
            _ => Team::Village,
        }
    }

    pub const fn starts_in_wolf_pack(self) -> bool {
        matches!(self, Role::Werewolf | Role::AlphaWolf)
    }
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfTeam"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Team {
    Village,
    Werewolves,
    Lovers,
    Tanner,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfRoleDeck"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct RoleDeck {
    pub villager: u8,
    pub werewolf: u8,
    pub alpha_wolf: u8,
    pub minion: u8,
    pub sorcerer: u8,
    pub seer: u8,
    pub bodyguard: u8,
    pub witch: u8,
    pub hunter: u8,
    pub cupid: u8,
    pub lycan: u8,
    pub cursed: u8,
    pub diseased: u8,
    pub prince: u8,
    pub mayor: u8,
    pub tanner: u8,
}

impl Default for RoleDeck {
    fn default() -> Self {
        Self::standard(5)
    }
}

impl RoleDeck {
    pub fn empty() -> Self {
        Self {
            villager: 0,
            werewolf: 0,
            alpha_wolf: 0,
            minion: 0,
            sorcerer: 0,
            seer: 0,
            bodyguard: 0,
            witch: 0,
            hunter: 0,
            cupid: 0,
            lycan: 0,
            cursed: 0,
            diseased: 0,
            prince: 0,
            mayor: 0,
            tanner: 0,
        }
    }

    pub fn standard(players: usize) -> Self {
        let mut deck = Self::empty();
        match players {
            0..=5 => {
                deck.werewolf = 1;
                deck.seer = 1;
                deck.bodyguard = 1;
                deck.villager = 2;
            }
            6 => {
                deck.werewolf = 1;
                deck.seer = 1;
                deck.bodyguard = 1;
                deck.witch = 1;
                deck.villager = 2;
            }
            7 => {
                deck.werewolf = 2;
                deck.seer = 1;
                deck.bodyguard = 1;
                deck.witch = 1;
                deck.hunter = 1;
                deck.villager = 1;
            }
            8 => {
                deck.werewolf = 2;
                deck.seer = 1;
                deck.bodyguard = 1;
                deck.witch = 1;
                deck.hunter = 1;
                deck.cupid = 1;
                deck.villager = 1;
            }
            9 => {
                deck.werewolf = 2;
                deck.seer = 1;
                deck.bodyguard = 1;
                deck.witch = 1;
                deck.hunter = 1;
                deck.cupid = 1;
                deck.tanner = 1;
                deck.villager = 1;
            }
            10 => {
                deck.werewolf = 2;
                deck.minion = 1;
                deck.seer = 1;
                deck.bodyguard = 1;
                deck.witch = 1;
                deck.hunter = 1;
                deck.cupid = 1;
                deck.mayor = 1;
                deck.villager = 1;
            }
            11 => {
                deck.werewolf = 2;
                deck.minion = 1;
                deck.seer = 1;
                deck.bodyguard = 1;
                deck.witch = 1;
                deck.hunter = 1;
                deck.cupid = 1;
                deck.prince = 1;
                deck.lycan = 1;
                deck.villager = 1;
            }
            12 => {
                deck.werewolf = 2;
                deck.alpha_wolf = 1;
                deck.sorcerer = 1;
                deck.seer = 1;
                deck.bodyguard = 1;
                deck.witch = 1;
                deck.hunter = 1;
                deck.cupid = 1;
                deck.diseased = 1;
                deck.prince = 1;
                deck.villager = 1;
            }
            13 => {
                deck.werewolf = 2;
                deck.alpha_wolf = 1;
                deck.sorcerer = 1;
                deck.seer = 1;
                deck.bodyguard = 1;
                deck.witch = 1;
                deck.hunter = 1;
                deck.cupid = 1;
                deck.diseased = 1;
                deck.prince = 1;
                deck.cursed = 1;
                deck.tanner = 1;
                deck.villager = 0;
            }
            14 => {
                deck.werewolf = 3;
                deck.alpha_wolf = 1;
                deck.sorcerer = 1;
                deck.seer = 1;
                deck.bodyguard = 1;
                deck.witch = 1;
                deck.hunter = 1;
                deck.cupid = 1;
                deck.diseased = 1;
                deck.prince = 1;
                deck.cursed = 1;
                deck.mayor = 1;
                deck.lycan = 0;
                deck.villager = 0;
            }
            15 => {
                deck.werewolf = 2;
                deck.alpha_wolf = 1;
                deck.minion = 1;
                deck.sorcerer = 1;
                deck.seer = 1;
                deck.bodyguard = 1;
                deck.witch = 1;
                deck.hunter = 1;
                deck.cupid = 1;
                deck.diseased = 1;
                deck.prince = 1;
                deck.cursed = 1;
                deck.mayor = 1;
                deck.lycan = 1;
            }
            _ => {
                deck.werewolf = 2;
                deck.alpha_wolf = 1;
                deck.minion = 1;
                deck.sorcerer = 1;
                deck.seer = 1;
                deck.bodyguard = 1;
                deck.witch = 1;
                deck.hunter = 1;
                deck.cupid = 1;
                deck.diseased = 1;
                deck.prince = 1;
                deck.cursed = 1;
                deck.mayor = 1;
                deck.lycan = 1;
                deck.tanner = 1;
            }
        }
        deck
    }

    pub fn count(&self, role: Role) -> u8 {
        match role {
            Role::Villager => self.villager,
            Role::Werewolf => self.werewolf,
            Role::AlphaWolf => self.alpha_wolf,
            Role::Minion => self.minion,
            Role::Sorcerer => self.sorcerer,
            Role::Seer => self.seer,
            Role::Bodyguard => self.bodyguard,
            Role::Witch => self.witch,
            Role::Hunter => self.hunter,
            Role::Cupid => self.cupid,
            Role::Lycan => self.lycan,
            Role::Cursed => self.cursed,
            Role::Diseased => self.diseased,
            Role::Prince => self.prince,
            Role::Mayor => self.mayor,
            Role::Tanner => self.tanner,
        }
    }

    pub fn total(&self) -> usize {
        Role::ALL.iter().map(|&r| self.count(r) as usize).sum()
    }

    pub fn wolf_pack_count(&self) -> usize {
        self.werewolf as usize + self.alpha_wolf as usize
    }

    pub fn balance_score(&self) -> i32 {
        Role::ALL
            .iter()
            .map(|&r| self.count(r) as i32 * r.balance_value())
            .sum()
    }

    pub fn valid_for(&self, players: usize) -> bool {
        if !(5..=16).contains(&players) {
            return false;
        }
        if self.total() != players {
            return false;
        }
        let wolves = self.wolf_pack_count();
        // Must have at least 1 active wolf and strictly more non-wolves than wolves at start.
        if wolves == 0 || wolves * 2 >= players {
            return false;
        }
        // Special roles are unique (max 1 each).
        for role in Role::ALL {
            if !matches!(role, Role::Villager | Role::Werewolf) && self.count(role) > 1 {
                return false;
            }
        }
        true
    }

    pub fn to_vec(&self) -> Vec<Role> {
        let mut roles = Vec::with_capacity(self.total());
        for role in Role::ALL {
            for _ in 0..self.count(role) {
                roles.push(role);
            }
        }
        roles
    }
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfSettings"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Settings {
    pub roles: RoleDeck,
    pub reveal_role_on_death: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            roles: RoleDeck::standard(5),
            reveal_role_on_death: true,
        }
    }
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfAction"))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    CupidLink {
        first: PlayerId,
        second: PlayerId,
    },
    BodyguardProtect {
        target: PlayerId,
    },
    WolfVote {
        target: PlayerId,
        infect: bool,
    },
    SeerInspect {
        target: PlayerId,
    },
    SorcererInspect {
        target: PlayerId,
    },
    WitchAct {
        heal: bool,
        poison: Option<PlayerId>,
    },
    HunterShoot {
        target: PlayerId,
    },
    DayVote {
        target: Option<PlayerId>,
    },
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfDeathCause"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeathCause {
    WerewolfAttack,
    WitchPoison,
    VillageLynch,
    HunterShot,
    LoverHeartbreak,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfWinner"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Winner {
    Village,
    Werewolves,
    Lovers,
    Tanner,
    Draw,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfNightStep"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NightStep {
    Cupid,
    Bodyguard,
    Werewolves,
    Seer,
    Sorcerer,
    Witch,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfPublicPhase"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PublicPhase {
    Night { night: u32, step: NightStep },
    DayVote { day: u32 },
    HunterShot { hunter: PlayerId },
    GameOver,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Decision {
    pub phase: PublicPhase,
    pub awaited: Vec<PlayerId>,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfSeerInspection"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SeerInspection {
    pub night: u32,
    pub target: PlayerId,
    pub is_wolf: bool,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfSorcererInspection"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct SorcererInspection {
    pub night: u32,
    pub target: PlayerId,
    pub is_seer: bool,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfWolfVote"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WolfVoteEntry {
    pub wolf: PlayerId,
    pub target: PlayerId,
    pub infect: bool,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfDayVote"))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum DayVoteChoice {
    Target { target: PlayerId },
    Abstain,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfPublicPlayer"))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublicPlayer {
    pub id: PlayerId,
    pub alive: bool,
    pub role: Option<Role>,
    pub death_cause: Option<DeathCause>,
    pub day_vote: Option<DayVoteChoice>,
    pub is_revealed_prince: bool,
    pub is_revealed_mayor: bool,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfSpectatorView"))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SpectatorView {
    pub players: Vec<PublicPlayer>,
    pub phase: PublicPhase,
    pub day_number: u32,
    pub role_counts: RoleDeck,
    pub reveal_role_on_death: bool,
    pub winner: Option<Winner>,
    pub winning_players: Vec<PlayerId>,
    pub awaited_count: usize,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfPlayerView"))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlayerView {
    pub you: PlayerId,
    pub your_role: Role,
    pub your_team: Team,
    pub is_wolf_pack: bool,
    pub known_wolves: Vec<PlayerId>,
    pub lover: Option<PlayerId>,
    pub cupid_lovers: Option<(PlayerId, PlayerId)>,
    pub seer_history: Vec<SeerInspection>,
    pub sorcerer_history: Vec<SorcererInspection>,
    pub wolf_votes: Vec<WolfVoteEntry>,
    pub witch_victim: Option<PlayerId>,
    pub witch_heal_available: bool,
    pub witch_poison_available: bool,
    pub alpha_infect_available: bool,
    pub bodyguard_last_protected: Option<PlayerId>,
    pub can_act: bool,
    pub table: SpectatorView,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Visibility {
    Public,
    Player(PlayerId),
    Players(Vec<PlayerId>),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Event {
    pub visibility: Visibility,
    pub kind: EventKind,
}

#[cfg_attr(feature = "ts", derive(ts_rs::TS))]
#[cfg_attr(feature = "ts", ts(rename = "WerewolfEventKind"))]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EventKind {
    GameStarted {
        player_count: usize,
    },
    RoleAssigned {
        player: PlayerId,
        role: Role,
    },
    NightStarted {
        night: u32,
    },
    NightStepStarted {
        night: u32,
        step: NightStep,
    },
    LoversLinked {
        first: PlayerId,
        second: PlayerId,
    },
    BodyguardProtected {
        target: PlayerId,
    },
    WolfVoted {
        wolf: PlayerId,
        target: PlayerId,
        infect: bool,
    },
    WolvesSickSkipped {
        night: u32,
    },
    SeerInspected {
        target: PlayerId,
        is_wolf: bool,
    },
    SorcererInspected {
        target: PlayerId,
        is_seer: bool,
    },
    WitchUsedHeal {
        target: PlayerId,
    },
    WitchUsedPoison {
        target: PlayerId,
    },
    PlayerTurnedWolf {
        player: PlayerId,
    },
    DawnPeaceful {
        day: u32,
    },
    PlayerDied {
        player: PlayerId,
        cause: DeathCause,
        revealed_role: Option<Role>,
    },
    DayStarted {
        day: u32,
    },
    DayVoted {
        voter: PlayerId,
        target: Option<PlayerId>,
        weight: u8,
    },
    PrinceRevealed {
        player: PlayerId,
    },
    DayNoLynch {
        day: u32,
    },
    HunterTriggered {
        hunter: PlayerId,
    },
    GameOver {
        winner: Winner,
        winning_players: Vec<PlayerId>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SetupError {
    InvalidPlayerCount,
    InvalidSettings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActionError {
    GameOver,
    InvalidPlayer,
    NotAlive,
    WrongPhase,
    NotYourTurn,
    AlreadyActed,
    InvalidTarget,
    CannotRepeatProtection,
    AbilityUnavailable,
}
