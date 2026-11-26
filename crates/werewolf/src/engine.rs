use crate::types::*;
use rand::Rng;
use rand::seq::SliceRandom;
use std::collections::BTreeMap;

#[derive(Debug, Clone)]
pub struct PlayerState {
    pub id: PlayerId,
    pub role: Role,
    pub is_wolf_pack: bool,
    pub alive: bool,
    pub death_cause: Option<DeathCause>,
    pub prince_revealed: bool,
    pub mayor_revealed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AfterHunter {
    StartDay(u32),
    StartNight(u32),
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Phase {
    Night {
        night: u32,
        step: NightStep,
    },
    DayVote {
        day: u32,
    },
    HunterShot {
        hunter: PlayerId,
        after: AfterHunter,
    },
    GameOver,
}

/// Authoritative game state. Intentionally does NOT derive Serialize/Deserialize.
#[derive(Debug, Clone)]
pub struct GameState {
    pub settings: Settings,
    pub players: Vec<PlayerState>,
    phase: Phase,
    pub day_number: u32,
    lovers: Option<(PlayerId, PlayerId)>,
    bodyguard_last_protected: Option<PlayerId>,
    night_bodyguard_target: Option<PlayerId>,
    night_wolf_votes: BTreeMap<PlayerId, (PlayerId, bool)>,
    night_wolf_target: Option<PlayerId>,
    night_wolf_infect: bool,
    night_witch_healed: bool,
    night_witch_poison: Option<PlayerId>,
    wolves_diseased: bool,
    witch_heal_available: bool,
    witch_poison_available: bool,
    alpha_infect_available: bool,
    seer_history: Vec<SeerInspection>,
    sorcerer_history: Vec<SorcererInspection>,
    day_votes: BTreeMap<PlayerId, Option<PlayerId>>,
    pub winner: Option<Winner>,
    pub winning_players: Vec<PlayerId>,
}

impl GameState {
    fn living_ids(&self) -> Vec<PlayerId> {
        self.players
            .iter()
            .filter(|p| p.alive)
            .map(|p| p.id)
            .collect()
    }

    fn living_wolf_pack(&self) -> Vec<PlayerId> {
        self.players
            .iter()
            .filter(|p| p.alive && p.is_wolf_pack)
            .map(|p| p.id)
            .collect()
    }

    fn all_wolf_pack(&self) -> Vec<PlayerId> {
        self.players
            .iter()
            .filter(|p| p.is_wolf_pack)
            .map(|p| p.id)
            .collect()
    }

    fn living_role(&self, role: Role) -> Option<PlayerId> {
        self.players
            .iter()
            .find(|p| p.alive && p.role == role && !p.is_wolf_pack)
            .map(|p| p.id)
    }

    fn effective_team(&self, player: PlayerId) -> Team {
        if let Some((a, b)) = self.lovers
            && (player == a || player == b)
            && self.is_mixed_lovers()
        {
            return Team::Lovers;
        }
        let p = &self.players[player.0];
        if p.is_wolf_pack {
            return Team::Werewolves;
        }
        p.role.initial_team()
    }

    fn is_mixed_lovers(&self) -> bool {
        let Some((a, b)) = self.lovers else {
            return false;
        };
        self.players[a.0].is_wolf_pack != self.players[b.0].is_wolf_pack
    }

    fn public_phase(&self) -> PublicPhase {
        match self.phase {
            Phase::Night { night, .. } => PublicPhase::Night { night },
            Phase::DayVote { day } => PublicPhase::DayVote { day },
            Phase::HunterShot { hunter, .. } => PublicPhase::HunterShot { hunter },
            Phase::GameOver => PublicPhase::GameOver,
        }
    }

    pub fn decision(&self) -> Option<Decision> {
        if self.winner.is_some() {
            return None;
        }
        let awaited = match self.phase {
            Phase::Night { step, .. } => match step {
                NightStep::Cupid => self.living_role(Role::Cupid).into_iter().collect(),
                NightStep::Bodyguard => self.living_role(Role::Bodyguard).into_iter().collect(),
                NightStep::Werewolves => self
                    .living_wolf_pack()
                    .into_iter()
                    .filter(|id| !self.night_wolf_votes.contains_key(id))
                    .collect(),
                NightStep::Seer => self.living_role(Role::Seer).into_iter().collect(),
                NightStep::Sorcerer => self.living_role(Role::Sorcerer).into_iter().collect(),
                NightStep::Witch => self.living_role(Role::Witch).into_iter().collect(),
            },
            Phase::DayVote { .. } => self
                .living_ids()
                .into_iter()
                .filter(|id| !self.day_votes.contains_key(id))
                .collect(),
            Phase::HunterShot { hunter, .. } => vec![hunter],
            Phase::GameOver => vec![],
        };
        if awaited.is_empty() {
            None
        } else {
            let night_step = match self.phase {
                Phase::Night { step, .. } => Some(step),
                _ => None,
            };
            Some(Decision {
                phase: self.public_phase(),
                night_step,
                awaited,
            })
        }
    }

    fn effective_witch_victim(&self) -> Option<PlayerId> {
        let target = self.night_wolf_target?;
        if self.night_bodyguard_target == Some(target) {
            return None;
        }
        Some(target)
    }
}

pub fn setup(
    player_count: usize,
    settings: Settings,
    rng: &mut impl Rng,
) -> Result<(GameState, Vec<Event>), SetupError> {
    if !(5..=16).contains(&player_count) {
        return Err(SetupError::InvalidPlayerCount);
    }
    if !settings.roles.valid_for(player_count) {
        return Err(SetupError::InvalidSettings);
    }

    let mut roles = settings.roles.to_vec();
    roles.shuffle(rng);

    let players: Vec<PlayerState> = roles
        .into_iter()
        .enumerate()
        .map(|(i, role)| PlayerState {
            id: PlayerId(i),
            role,
            is_wolf_pack: role.starts_in_wolf_pack(),
            alive: true,
            death_cause: None,
            prince_revealed: false,
            mayor_revealed: false,
        })
        .collect();

    let mut state = GameState {
        settings,
        players,
        phase: Phase::Night {
            night: 1,
            step: NightStep::Cupid,
        },
        day_number: 1,
        lovers: None,
        bodyguard_last_protected: None,
        night_bodyguard_target: None,
        night_wolf_votes: BTreeMap::new(),
        night_wolf_target: None,
        night_wolf_infect: false,
        night_witch_healed: false,
        night_witch_poison: None,
        wolves_diseased: false,
        witch_heal_available: true,
        witch_poison_available: true,
        alpha_infect_available: true,
        seer_history: Vec::new(),
        sorcerer_history: Vec::new(),
        day_votes: BTreeMap::new(),
        winner: None,
        winning_players: Vec::new(),
    };

    let mut events = vec![Event {
        visibility: Visibility::Public,
        kind: EventKind::GameStarted { player_count },
    }];
    for p in &state.players {
        events.push(Event {
            visibility: Visibility::Player(p.id),
            kind: EventKind::RoleAssigned {
                player: p.id,
                role: p.role,
            },
        });
    }

    start_night(&mut state, 1, &mut events);
    Ok((state, events))
}

fn start_night(state: &mut GameState, night: u32, events: &mut Vec<Event>) {
    state.day_number = night;
    state.night_bodyguard_target = None;
    state.night_wolf_votes.clear();
    state.night_wolf_target = None;
    state.night_wolf_infect = false;
    state.night_witch_healed = false;
    state.night_witch_poison = None;
    state.day_votes.clear();

    events.push(Event {
        visibility: Visibility::Public,
        kind: EventKind::NightStarted { night },
    });
    advance_night_from(state, night, Some(NightStep::Cupid), events);
}

fn next_night_step(step: NightStep) -> Option<NightStep> {
    match step {
        NightStep::Cupid => Some(NightStep::Bodyguard),
        NightStep::Bodyguard => Some(NightStep::Werewolves),
        NightStep::Werewolves => Some(NightStep::Seer),
        NightStep::Seer => Some(NightStep::Sorcerer),
        NightStep::Sorcerer => Some(NightStep::Witch),
        NightStep::Witch => None,
    }
}

fn advance_night_from(
    state: &mut GameState,
    night: u32,
    mut candidate: Option<NightStep>,
    events: &mut Vec<Event>,
) {
    while let Some(step) = candidate {
        match step {
            NightStep::Cupid => {
                if night == 1
                    && state.lovers.is_none()
                    && let Some(cupid) = state.living_role(Role::Cupid)
                    && state.living_ids().len() >= 2
                {
                    state.phase = Phase::Night { night, step };
                    events.push(Event {
                        visibility: Visibility::Player(cupid),
                        kind: EventKind::NightStepStarted { night, step },
                    });
                    return;
                }
            }
            NightStep::Bodyguard => {
                if let Some(bodyguard) = state.living_role(Role::Bodyguard)
                    && !valid_bodyguard_targets(state).is_empty()
                {
                    state.phase = Phase::Night { night, step };
                    events.push(Event {
                        visibility: Visibility::Player(bodyguard),
                        kind: EventKind::NightStepStarted { night, step },
                    });
                    return;
                }
            }
            NightStep::Werewolves => {
                let wolves = state.living_wolf_pack();
                let has_prey = state.players.iter().any(|p| p.alive && !p.is_wolf_pack);
                if !wolves.is_empty() && has_prey {
                    if state.wolves_diseased {
                        state.wolves_diseased = false;
                        events.push(Event {
                            visibility: Visibility::Players(wolves),
                            kind: EventKind::WolvesSickSkipped { night },
                        });
                    } else {
                        state.phase = Phase::Night { night, step };
                        events.push(Event {
                            visibility: Visibility::Players(wolves),
                            kind: EventKind::NightStepStarted { night, step },
                        });
                        return;
                    }
                }
            }
            NightStep::Seer => {
                if let Some(seer) = state.living_role(Role::Seer)
                    && state.players.iter().any(|p| p.alive && p.id != seer)
                {
                    state.phase = Phase::Night { night, step };
                    events.push(Event {
                        visibility: Visibility::Player(seer),
                        kind: EventKind::NightStepStarted { night, step },
                    });
                    return;
                }
            }
            NightStep::Sorcerer => {
                if let Some(sorcerer) = state.living_role(Role::Sorcerer)
                    && state.players.iter().any(|p| p.alive && p.id != sorcerer)
                {
                    state.phase = Phase::Night { night, step };
                    events.push(Event {
                        visibility: Visibility::Player(sorcerer),
                        kind: EventKind::NightStepStarted { night, step },
                    });
                    return;
                }
            }
            NightStep::Witch => {
                if let Some(witch) = state.living_role(Role::Witch)
                    && (state.witch_heal_available || state.witch_poison_available)
                {
                    state.phase = Phase::Night { night, step };
                    events.push(Event {
                        visibility: Visibility::Player(witch),
                        kind: EventKind::NightStepStarted { night, step },
                    });
                    return;
                }
            }
        }
        candidate = next_night_step(step);
    }

    // All night steps done -> resolve the night.
    resolve_night(state, night, events);
}

fn valid_bodyguard_targets(state: &GameState) -> Vec<PlayerId> {
    state
        .players
        .iter()
        .filter(|p| p.alive && Some(p.id) != state.bodyguard_last_protected)
        .map(|p| p.id)
        .collect()
}

fn resolve_night(state: &mut GameState, night: u32, events: &mut Vec<Event>) {
    state.bodyguard_last_protected = state.night_bodyguard_target;

    let mut pending_hunter: Option<PlayerId> = None;
    let mut any_death = false;

    if let Some(target) = state.night_wolf_target
        && state.night_bodyguard_target != Some(target)
        && !state.night_witch_healed
        && state.players[target.0].alive
    {
        let is_cursed_turn =
            state.players[target.0].role == Role::Cursed && !state.players[target.0].is_wolf_pack;
        if is_cursed_turn || state.night_wolf_infect {
            state.players[target.0].is_wolf_pack = true;
            let wolves = state.all_wolf_pack();
            events.push(Event {
                visibility: Visibility::Players(wolves),
                kind: EventKind::PlayerTurnedWolf { player: target },
            });
        } else {
            if state.players[target.0].role == Role::Diseased {
                state.wolves_diseased = true;
            }
            kill_player(
                state,
                target,
                DeathCause::WerewolfAttack,
                &mut pending_hunter,
                events,
            );
            any_death = true;
        }
    }

    if let Some(poisoned) = state.night_witch_poison
        && state.players[poisoned.0].alive
    {
        kill_player(
            state,
            poisoned,
            DeathCause::WitchPoison,
            &mut pending_hunter,
            events,
        );
        any_death = true;
    }

    if !any_death {
        events.push(Event {
            visibility: Visibility::Public,
            kind: EventKind::DawnPeaceful { day: night },
        });
    }

    if let Some(hunter) = pending_hunter
        && !state.living_ids().is_empty()
    {
        state.phase = Phase::HunterShot {
            hunter,
            after: AfterHunter::StartDay(night),
        };
        events.push(Event {
            visibility: Visibility::Public,
            kind: EventKind::HunterTriggered { hunter },
        });
        return;
    }

    if check_victory(state, events) {
        return;
    }

    start_day(state, night, events);
}

fn start_day(state: &mut GameState, day: u32, events: &mut Vec<Event>) {
    state.day_number = day;
    state.day_votes.clear();
    state.phase = Phase::DayVote { day };
    events.push(Event {
        visibility: Visibility::Public,
        kind: EventKind::DayStarted { day },
    });
}

fn kill_player(
    state: &mut GameState,
    target: PlayerId,
    cause: DeathCause,
    pending_hunter: &mut Option<PlayerId>,
    events: &mut Vec<Event>,
) {
    if !state.players[target.0].alive {
        return;
    }
    state.players[target.0].alive = false;
    state.players[target.0].death_cause = Some(cause);
    let revealed_role = if state.settings.reveal_role_on_death {
        Some(state.players[target.0].role)
    } else {
        None
    };
    events.push(Event {
        visibility: Visibility::Public,
        kind: EventKind::PlayerDied {
            player: target,
            cause,
            revealed_role,
        },
    });
    if state.players[target.0].role == Role::Hunter {
        *pending_hunter = Some(target);
    }

    // Lover heartbreak cascade.
    if let Some((a, b)) = state.lovers {
        let partner = if a == target {
            Some(b)
        } else if b == target {
            Some(a)
        } else {
            None
        };
        if let Some(partner) = partner
            && state.players[partner.0].alive
        {
            kill_player(
                state,
                partner,
                DeathCause::LoverHeartbreak,
                pending_hunter,
                events,
            );
        }
    }
}

fn check_victory(state: &mut GameState, events: &mut Vec<Event>) -> bool {
    let living = state.living_ids();
    if living.is_empty() {
        finish_game(state, Winner::Draw, vec![], events);
        return true;
    }

    // Mixed-team Lovers win if they are the last 2 living players.
    if let Some((a, b)) = state.lovers
        && state.is_mixed_lovers()
        && living.len() == 2
        && state.players[a.0].alive
        && state.players[b.0].alive
    {
        finish_game(state, Winner::Lovers, vec![a, b], events);
        return true;
    }

    let living_wolves = state.living_wolf_pack().len();
    let living_others = living.len() - living_wolves;

    if living_wolves == 0 {
        let winners = state
            .players
            .iter()
            .filter(|p| state.effective_team(p.id) == Team::Village)
            .map(|p| p.id)
            .collect();
        finish_game(state, Winner::Village, winners, events);
        return true;
    }

    if living_wolves >= living_others {
        let winners = state
            .players
            .iter()
            .filter(|p| state.effective_team(p.id) == Team::Werewolves)
            .map(|p| p.id)
            .collect();
        finish_game(state, Winner::Werewolves, winners, events);
        return true;
    }

    false
}

fn finish_game(
    state: &mut GameState,
    winner: Winner,
    winning_players: Vec<PlayerId>,
    events: &mut Vec<Event>,
) {
    state.winner = Some(winner);
    state.winning_players = winning_players.clone();
    state.phase = Phase::GameOver;
    events.push(Event {
        visibility: Visibility::Public,
        kind: EventKind::GameOver {
            winner,
            winning_players,
        },
    });
}

fn validate_action(state: &GameState, actor: PlayerId, action: &Action) -> Result<(), ActionError> {
    if state.winner.is_some() {
        return Err(ActionError::GameOver);
    }
    if actor.0 >= state.players.len() {
        return Err(ActionError::InvalidPlayer);
    }
    let check_living_target = |target: PlayerId| -> Result<(), ActionError> {
        if target.0 >= state.players.len() || !state.players[target.0].alive {
            return Err(ActionError::InvalidTarget);
        }
        Ok(())
    };

    match (&state.phase, action) {
        (
            Phase::Night {
                step: NightStep::Cupid,
                ..
            },
            Action::CupidLink { first, second },
        ) => {
            if !state.players[actor.0].alive {
                return Err(ActionError::NotAlive);
            }
            if state.players[actor.0].role != Role::Cupid || state.players[actor.0].is_wolf_pack {
                return Err(ActionError::NotYourTurn);
            }
            if first == second {
                return Err(ActionError::InvalidTarget);
            }
            check_living_target(*first)?;
            check_living_target(*second)?;
            Ok(())
        }
        (
            Phase::Night {
                step: NightStep::Bodyguard,
                ..
            },
            Action::BodyguardProtect { target },
        ) => {
            if !state.players[actor.0].alive {
                return Err(ActionError::NotAlive);
            }
            if state.players[actor.0].role != Role::Bodyguard || state.players[actor.0].is_wolf_pack
            {
                return Err(ActionError::NotYourTurn);
            }
            check_living_target(*target)?;
            if state.bodyguard_last_protected == Some(*target) {
                return Err(ActionError::CannotRepeatProtection);
            }
            Ok(())
        }
        (
            Phase::Night {
                step: NightStep::Werewolves,
                ..
            },
            Action::WolfVote { target, infect },
        ) => {
            if !state.players[actor.0].alive {
                return Err(ActionError::NotAlive);
            }
            if !state.players[actor.0].is_wolf_pack {
                return Err(ActionError::NotYourTurn);
            }
            if state.night_wolf_votes.contains_key(&actor) {
                return Err(ActionError::AlreadyActed);
            }
            check_living_target(*target)?;
            if state.players[target.0].is_wolf_pack {
                return Err(ActionError::InvalidTarget);
            }
            if *infect
                && (state.players[actor.0].role != Role::AlphaWolf || !state.alpha_infect_available)
            {
                return Err(ActionError::AbilityUnavailable);
            }
            Ok(())
        }
        (
            Phase::Night {
                step: NightStep::Seer,
                ..
            },
            Action::SeerInspect { target },
        ) => {
            if !state.players[actor.0].alive {
                return Err(ActionError::NotAlive);
            }
            if state.players[actor.0].role != Role::Seer || state.players[actor.0].is_wolf_pack {
                return Err(ActionError::NotYourTurn);
            }
            if *target == actor {
                return Err(ActionError::InvalidTarget);
            }
            check_living_target(*target)?;
            Ok(())
        }
        (
            Phase::Night {
                step: NightStep::Sorcerer,
                ..
            },
            Action::SorcererInspect { target },
        ) => {
            if !state.players[actor.0].alive {
                return Err(ActionError::NotAlive);
            }
            if state.players[actor.0].role != Role::Sorcerer || state.players[actor.0].is_wolf_pack
            {
                return Err(ActionError::NotYourTurn);
            }
            if *target == actor {
                return Err(ActionError::InvalidTarget);
            }
            check_living_target(*target)?;
            Ok(())
        }
        (
            Phase::Night {
                step: NightStep::Witch,
                ..
            },
            Action::WitchAct { heal, poison },
        ) => {
            if !state.players[actor.0].alive {
                return Err(ActionError::NotAlive);
            }
            if state.players[actor.0].role != Role::Witch || state.players[actor.0].is_wolf_pack {
                return Err(ActionError::NotYourTurn);
            }
            if *heal && (!state.witch_heal_available || state.effective_witch_victim().is_none()) {
                return Err(ActionError::AbilityUnavailable);
            }
            if let Some(target) = poison {
                if !state.witch_poison_available {
                    return Err(ActionError::AbilityUnavailable);
                }
                if *target == actor {
                    return Err(ActionError::InvalidTarget);
                }
                check_living_target(*target)?;
            }
            Ok(())
        }
        (Phase::HunterShot { hunter, .. }, Action::HunterShoot { target }) => {
            if actor != *hunter {
                return Err(ActionError::NotYourTurn);
            }
            check_living_target(*target)?;
            Ok(())
        }
        (Phase::DayVote { .. }, Action::DayVote { target }) => {
            if !state.players[actor.0].alive {
                return Err(ActionError::NotAlive);
            }
            if state.day_votes.contains_key(&actor) {
                return Err(ActionError::AlreadyActed);
            }
            if let Some(target) = target {
                check_living_target(*target)?;
            }
            Ok(())
        }
        _ => Err(ActionError::WrongPhase),
    }
}

pub fn apply(
    state: &mut GameState,
    actor: PlayerId,
    action: Action,
    rng: &mut impl Rng,
) -> Result<Vec<Event>, ActionError> {
    validate_action(state, actor, &action)?;

    let mut events = Vec::new();
    match (state.phase.clone(), action) {
        (
            Phase::Night {
                night,
                step: NightStep::Cupid,
            },
            Action::CupidLink { first, second },
        ) => {
            state.lovers = Some((first, second));
            let mut recipients = vec![first, second];
            if !recipients.contains(&actor) {
                recipients.push(actor);
            }
            events.push(Event {
                visibility: Visibility::Players(recipients),
                kind: EventKind::LoversLinked { first, second },
            });
            advance_night_from(state, night, next_night_step(NightStep::Cupid), &mut events);
        }
        (
            Phase::Night {
                night,
                step: NightStep::Bodyguard,
            },
            Action::BodyguardProtect { target },
        ) => {
            state.night_bodyguard_target = Some(target);
            events.push(Event {
                visibility: Visibility::Player(actor),
                kind: EventKind::BodyguardProtected { target },
            });
            advance_night_from(
                state,
                night,
                next_night_step(NightStep::Bodyguard),
                &mut events,
            );
        }
        (
            Phase::Night {
                night,
                step: NightStep::Werewolves,
            },
            Action::WolfVote { target, infect },
        ) => {
            state.night_wolf_votes.insert(actor, (target, infect));
            let wolves = state.living_wolf_pack();
            events.push(Event {
                visibility: Visibility::Players(wolves.clone()),
                kind: EventKind::WolfVoted {
                    wolf: actor,
                    target,
                    infect,
                },
            });

            if wolves
                .iter()
                .all(|w| state.night_wolf_votes.contains_key(w))
            {
                let mut counts: BTreeMap<PlayerId, usize> = BTreeMap::new();
                let mut any_infect = false;
                for &(t, inf) in state.night_wolf_votes.values() {
                    *counts.entry(t).or_default() += 1;
                    if inf {
                        any_infect = true;
                    }
                }
                let max_votes = counts.values().copied().max().unwrap_or(0);
                let top: Vec<PlayerId> = counts
                    .into_iter()
                    .filter(|&(_, c)| c == max_votes)
                    .map(|(t, _)| t)
                    .collect();
                let chosen = if top.len() == 1 {
                    top[0]
                } else {
                    top[rng.random_range(0..top.len())]
                };
                state.night_wolf_target = Some(chosen);
                state.night_wolf_infect = any_infect;
                if any_infect {
                    state.alpha_infect_available = false;
                }
                advance_night_from(
                    state,
                    night,
                    next_night_step(NightStep::Werewolves),
                    &mut events,
                );
            }
        }
        (
            Phase::Night {
                night,
                step: NightStep::Seer,
            },
            Action::SeerInspect { target },
        ) => {
            let p = &state.players[target.0];
            let is_wolf = p.is_wolf_pack || p.role == Role::Lycan;
            state.seer_history.push(SeerInspection {
                night,
                target,
                is_wolf,
            });
            events.push(Event {
                visibility: Visibility::Player(actor),
                kind: EventKind::SeerInspected { target, is_wolf },
            });
            advance_night_from(state, night, next_night_step(NightStep::Seer), &mut events);
        }
        (
            Phase::Night {
                night,
                step: NightStep::Sorcerer,
            },
            Action::SorcererInspect { target },
        ) => {
            let is_seer = state.players[target.0].role == Role::Seer;
            state.sorcerer_history.push(SorcererInspection {
                night,
                target,
                is_seer,
            });
            events.push(Event {
                visibility: Visibility::Player(actor),
                kind: EventKind::SorcererInspected { target, is_seer },
            });
            advance_night_from(
                state,
                night,
                next_night_step(NightStep::Sorcerer),
                &mut events,
            );
        }
        (
            Phase::Night {
                night,
                step: NightStep::Witch,
            },
            Action::WitchAct { heal, poison },
        ) => {
            if heal {
                state.witch_heal_available = false;
                state.night_witch_healed = true;
                if let Some(victim) = state.effective_witch_victim() {
                    events.push(Event {
                        visibility: Visibility::Player(actor),
                        kind: EventKind::WitchUsedHeal { target: victim },
                    });
                }
            }
            if let Some(target) = poison {
                state.witch_poison_available = false;
                state.night_witch_poison = Some(target);
                events.push(Event {
                    visibility: Visibility::Player(actor),
                    kind: EventKind::WitchUsedPoison { target },
                });
            }
            advance_night_from(state, night, next_night_step(NightStep::Witch), &mut events);
        }
        (Phase::HunterShot { after, .. }, Action::HunterShoot { target }) => {
            let mut unused_hunter = None;
            kill_player(
                state,
                target,
                DeathCause::HunterShot,
                &mut unused_hunter,
                &mut events,
            );
            if check_victory(state, &mut events) {
                return Ok(events);
            }
            match after {
                AfterHunter::StartDay(day) => start_day(state, day, &mut events),
                AfterHunter::StartNight(night) => start_night(state, night, &mut events),
            }
        }
        (Phase::DayVote { day }, Action::DayVote { target }) => {
            let weight = if state.players[actor.0].role == Role::Mayor {
                state.players[actor.0].mayor_revealed = true;
                2
            } else {
                1
            };
            state.day_votes.insert(actor, target);
            events.push(Event {
                visibility: Visibility::Public,
                kind: EventKind::DayVoted {
                    voter: actor,
                    target,
                    weight,
                },
            });

            let living = state.living_ids();
            if living.iter().all(|id| state.day_votes.contains_key(id)) {
                let mut tally: BTreeMap<PlayerId, u32> = BTreeMap::new();
                for (&voter, &vote) in &state.day_votes {
                    if let Some(t) = vote {
                        let w = if state.players[voter.0].role == Role::Mayor {
                            2
                        } else {
                            1
                        };
                        *tally.entry(t).or_default() += w;
                    }
                }
                let max_votes = tally.values().copied().max().unwrap_or(0);
                let leaders: Vec<PlayerId> = tally
                    .into_iter()
                    .filter(|&(_, c)| c == max_votes && max_votes > 0)
                    .map(|(t, _)| t)
                    .collect();

                if leaders.len() == 1 {
                    let lynched = leaders[0];
                    if state.players[lynched.0].role == Role::Prince
                        && !state.players[lynched.0].prince_revealed
                    {
                        state.players[lynched.0].prince_revealed = true;
                        events.push(Event {
                            visibility: Visibility::Public,
                            kind: EventKind::PrinceRevealed { player: lynched },
                        });
                        start_night(state, day + 1, &mut events);
                    } else if state.players[lynched.0].role == Role::Tanner {
                        let mut ignored = None;
                        kill_player(
                            state,
                            lynched,
                            DeathCause::VillageLynch,
                            &mut ignored,
                            &mut events,
                        );
                        finish_game(state, Winner::Tanner, vec![lynched], &mut events);
                    } else {
                        let mut pending_hunter = None;
                        kill_player(
                            state,
                            lynched,
                            DeathCause::VillageLynch,
                            &mut pending_hunter,
                            &mut events,
                        );
                        if let Some(hunter) = pending_hunter
                            && !state.living_ids().is_empty()
                        {
                            state.phase = Phase::HunterShot {
                                hunter,
                                after: AfterHunter::StartNight(day + 1),
                            };
                            events.push(Event {
                                visibility: Visibility::Public,
                                kind: EventKind::HunterTriggered { hunter },
                            });
                            return Ok(events);
                        }
                        if !check_victory(state, &mut events) {
                            start_night(state, day + 1, &mut events);
                        }
                    }
                } else {
                    events.push(Event {
                        visibility: Visibility::Public,
                        kind: EventKind::DayNoLynch { day },
                    });
                    start_night(state, day + 1, &mut events);
                }
            }
        }
        _ => unreachable!("validated above"),
    }

    Ok(events)
}

pub fn default_action(state: &GameState) -> Option<(PlayerId, Action)> {
    let decision = state.decision()?;
    let actor = *decision.awaited.first()?;
    let action = match state.phase {
        Phase::Night { step, .. } => match step {
            NightStep::Cupid => {
                let living = state.living_ids();
                if living.len() < 2 {
                    return None;
                }
                Action::CupidLink {
                    first: living[0],
                    second: living[1],
                }
            }
            NightStep::Bodyguard => {
                let target = *valid_bodyguard_targets(state).first()?;
                Action::BodyguardProtect { target }
            }
            NightStep::Werewolves => {
                let target = state
                    .players
                    .iter()
                    .find(|p| p.alive && !p.is_wolf_pack)
                    .map(|p| p.id)?;
                Action::WolfVote {
                    target,
                    infect: false,
                }
            }
            NightStep::Seer => {
                let target = state
                    .players
                    .iter()
                    .find(|p| p.alive && p.id != actor)
                    .map(|p| p.id)?;
                Action::SeerInspect { target }
            }
            NightStep::Sorcerer => {
                let target = state
                    .players
                    .iter()
                    .find(|p| p.alive && p.id != actor)
                    .map(|p| p.id)?;
                Action::SorcererInspect { target }
            }
            NightStep::Witch => Action::WitchAct {
                heal: false,
                poison: None,
            },
        },
        Phase::DayVote { .. } => Action::DayVote { target: None },
        Phase::HunterShot { .. } => {
            let target = *state.living_ids().first()?;
            Action::HunterShoot { target }
        }
        Phase::GameOver => return None,
    };
    Some((actor, action))
}

pub fn decision(state: &GameState) -> Option<Decision> {
    state.decision()
}

pub fn spectator_view(state: &GameState) -> SpectatorView {
    let game_over = state.winner.is_some();
    let in_day_vote = matches!(state.phase, Phase::DayVote { .. });
    let players = state
        .players
        .iter()
        .map(|p| {
            let reveal = game_over
                || (!p.alive && state.settings.reveal_role_on_death)
                || p.prince_revealed
                || p.mayor_revealed;
            PublicPlayer {
                id: p.id,
                alive: p.alive,
                role: if reveal { Some(p.role) } else { None },
                death_cause: p.death_cause,
                day_vote: if in_day_vote {
                    state.day_votes.get(&p.id).copied().map(|v| match v {
                        Some(target) => DayVoteChoice::Target { target },
                        None => DayVoteChoice::Abstain,
                    })
                } else {
                    None
                },
                is_revealed_prince: p.prince_revealed,
                is_revealed_mayor: p.mayor_revealed,
            }
        })
        .collect();

    SpectatorView {
        players,
        phase: state.public_phase(),
        day_number: state.day_number,
        role_counts: state.settings.roles,
        reveal_role_on_death: state.settings.reveal_role_on_death,
        winner: state.winner,
        winning_players: state.winning_players.clone(),
        awaited_count: if matches!(state.phase, Phase::Night { .. }) {
            0
        } else {
            state.decision().map_or(0, |d| d.awaited.len())
        },
    }
}

pub fn view(state: &GameState, player: PlayerId) -> Option<PlayerView> {
    let p = state.players.get(player.0)?;
    let known_wolves = if p.is_wolf_pack || p.role == Role::Minion {
        state.all_wolf_pack()
    } else {
        vec![]
    };
    let lover = state.lovers.and_then(|(a, b)| {
        if a == player {
            Some(b)
        } else if b == player {
            Some(a)
        } else {
            None
        }
    });
    let cupid_lovers = if p.role == Role::Cupid {
        state.lovers
    } else {
        None
    };
    let seer_history = if p.role == Role::Seer {
        state.seer_history.clone()
    } else {
        vec![]
    };
    let sorcerer_history = if p.role == Role::Sorcerer {
        state.sorcerer_history.clone()
    } else {
        vec![]
    };
    let wolf_votes = if p.is_wolf_pack
        && matches!(
            state.phase,
            Phase::Night {
                step: NightStep::Werewolves,
                ..
            }
        ) {
        state
            .night_wolf_votes
            .iter()
            .map(|(&wolf, &(target, infect))| WolfVoteEntry {
                wolf,
                target,
                infect,
            })
            .collect()
    } else {
        vec![]
    };
    let witch_victim = if p.role == Role::Witch
        && matches!(
            state.phase,
            Phase::Night {
                step: NightStep::Witch,
                ..
            }
        ) {
        state.effective_witch_victim()
    } else {
        None
    };
    let can_act = state
        .decision()
        .is_some_and(|d| d.awaited.contains(&player));
    let active_night_step = if can_act {
        match state.phase {
            Phase::Night { step, .. } => Some(step),
            _ => None,
        }
    } else {
        None
    };

    Some(PlayerView {
        you: player,
        your_role: p.role,
        your_team: state.effective_team(player),
        is_wolf_pack: p.is_wolf_pack,
        known_wolves,
        lover,
        cupid_lovers,
        seer_history,
        sorcerer_history,
        wolf_votes,
        witch_victim,
        witch_heal_available: p.role == Role::Witch && state.witch_heal_available,
        witch_poison_available: p.role == Role::Witch && state.witch_poison_available,
        alpha_infect_available: p.role == Role::AlphaWolf && state.alpha_infect_available,
        bodyguard_last_protected: if p.role == Role::Bodyguard {
            state.bodyguard_last_protected
        } else {
            None
        },
        active_night_step,
        can_act,
        table: spectator_view(state),
    })
}

pub fn filter_events(events: &[Event], recipient: Option<PlayerId>) -> Vec<EventKind> {
    events
        .iter()
        .filter(|event| match &event.visibility {
            Visibility::Public => true,
            Visibility::Player(target) => recipient == Some(*target),
            Visibility::Players(targets) => {
                recipient.is_some_and(|player| targets.contains(&player))
            }
        })
        .map(|event| event.kind.clone())
        .collect()
}
