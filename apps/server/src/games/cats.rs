use super::{GameModule, GameSession};
use protocol::{
    ErrorCode, GameAction, GameDelta, GameSeat, GameSettings, GameView, PROTOCOL_VERSION,
    ServerMessage, cats::CatsView,
};
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use std::collections::BTreeMap;
use tokio::time::Instant;

pub(super) struct Module;

impl GameModule for Module {
    fn enabled(&self) -> bool {
        true
    }

    fn limits(&self) -> (u32, u32) {
        ::cats::PLAYER_LIMITS
    }

    fn default_settings(&self) -> GameSettings {
        GameSettings::Cats(::cats::Settings::default())
    }

    fn validate_settings(&self, settings: &GameSettings, _players: usize) -> Result<(), ErrorCode> {
        let GameSettings::Cats(_) = settings else {
            return Err(ErrorCode::InvalidSettings);
        };
        Ok(())
    }

    fn adjust_settings(&self, _settings: &mut GameSettings, _players: usize) {}

    fn start(
        &self,
        seats: Vec<GameSeat>,
        settings: &GameSettings,
        seed: Option<u64>,
        now: Instant,
    ) -> Result<Box<dyn GameSession>, ErrorCode> {
        self.validate_settings(settings, seats.len())?;
        let GameSettings::Cats(settings) = settings else {
            return Err(ErrorCode::InvalidSettings);
        };
        Ok(Box::new(Session::new(seats, settings.clone(), seed, now)?))
    }
}

struct Session {
    state: ::cats::State,
    seq: u32,
    seats: Vec<GameSeat>,
    rng: ChaCha8Rng,
    rng_before: BTreeMap<u64, ChaCha8Rng>,
    decision: Option<::cats::Decision>,
    waiting_since: Instant,
    events: Vec<::cats::Event>,
}

impl Session {
    fn new(
        seats: Vec<GameSeat>,
        settings: ::cats::Settings,
        seed: Option<u64>,
        now: Instant,
    ) -> Result<Self, ErrorCode> {
        let mut rng = if let Some(seed) = seed {
            ChaCha8Rng::seed_from_u64(seed)
        } else {
            let mut seed = [0; 32];
            getrandom::fill(&mut seed).map_err(|_| ErrorCode::ServerBusy)?;
            ChaCha8Rng::from_seed(seed)
        };
        let (state, events) = ::cats::setup(seats.len(), settings, &mut rng)
            .map_err(|_| ErrorCode::InvalidSettings)?;
        let decision = ::cats::decision(&state);
        Ok(Self {
            state,
            seq: 0,
            seats,
            rng,
            rng_before: BTreeMap::new(),
            decision,
            waiting_since: now,
            events,
        })
    }

    fn player(&self, member: &str) -> Option<::cats::PlayerId> {
        self.seats
            .iter()
            .position(|seat| seat.member_id == member)
            .map(::cats::PlayerId)
    }

    fn recipient(&self, member: &str) -> Option<::cats::PlayerId> {
        self.player(member).filter(|id| self.state.is_active(*id))
    }

    fn cats_view(&self, member: &str) -> CatsView {
        match self.recipient(member) {
            Some(player) => CatsView::Player(::cats::view(&self.state, player)),
            None => CatsView::Spectator(::cats::spectator_view(&self.state)),
        }
    }

    fn step(
        &mut self,
        player: ::cats::PlayerId,
        action: ::cats::Action,
        now: Instant,
    ) -> Result<(), ErrorCode> {
        if self.is_over() {
            return Err(ErrorCode::WrongPhase);
        }
        let previous_action = self.state.last_action().map(|action| action.id);
        let rng_before = self.rng.clone();
        let events = ::cats::apply(&mut self.state, player, action, &mut self.rng)
            .map_err(|_| ErrorCode::IllegalAction)?;
        let undone_action = events.iter().find_map(|event| match &event.kind {
            ::cats::EventKind::ActionUndone { action_id, .. } => Some(*action_id),
            _ => None,
        });
        let noped = events
            .iter()
            .any(|event| matches!(&event.kind, ::cats::EventKind::NopePlayed { .. }));
        let current_action = self.state.last_action().map(|action| action.id);
        match current_action {
            None => self.rng_before.clear(),
            Some(action_id) if noped => {
                self.rng_before.insert(action_id.0, rng_before);
                if let Some(snapshot) = undone_action.and_then(|id| self.rng_before.get(&id.0)) {
                    self.rng = snapshot.clone();
                }
            }
            Some(action_id) if previous_action != Some(action_id) => {
                self.rng_before.clear();
                self.rng_before.insert(action_id.0, rng_before);
            }
            Some(_) => {}
        }
        self.events = events;
        self.seq += 1;
        let decision = ::cats::decision(&self.state);
        if decision != self.decision {
            self.waiting_since = now;
            self.decision = decision;
        }
        Ok(())
    }
}

impl GameSession for Session {
    fn seq(&self) -> u32 {
        self.seq
    }

    fn seats(&self) -> &[GameSeat] {
        &self.seats
    }

    fn waiting_since(&self) -> Instant {
        self.waiting_since
    }

    fn is_over(&self) -> bool {
        self.state.winner.is_some()
    }

    fn view(&self, member: &str) -> GameView {
        GameView::Cats(self.cats_view(member))
    }

    fn update(&self, member: &str) -> ServerMessage {
        let update = GameDelta::Cats {
            events: protocol::cats::CatsEvents::for_recipient(&self.events, self.recipient(member)),
            view: self.cats_view(member),
        };
        if self.is_over() {
            ServerMessage::GameOver {
                v: PROTOCOL_VERSION,
                seq: self.seq,
                update,
            }
        } else {
            ServerMessage::GameUpdate {
                v: PROTOCOL_VERSION,
                seq: self.seq,
                update,
            }
        }
    }

    fn apply(&mut self, member: &str, action: GameAction, now: Instant) -> Result<(), ErrorCode> {
        if self.is_over() {
            return Err(ErrorCode::WrongPhase);
        }
        let action = match action {
            GameAction::Cats(action) => action,
            GameAction::Bang(_) | GameAction::Uno(_) | GameAction::Werewolf(_) => {
                return Err(ErrorCode::IllegalAction);
            }
        };
        let player = self.player(member).ok_or(ErrorCode::IllegalAction)?;
        self.step(player, action, now)
    }

    fn apply_default(&mut self, now: Instant) -> Result<(), ErrorCode> {
        let (player, action) = ::cats::default_action(&self.state).ok_or(ErrorCode::WrongPhase)?;
        self.step(player, action, now)
    }

    fn awaited_seat(&self) -> Option<usize> {
        ::cats::default_action(&self.state).map(|(player, _)| player.0)
    }

    fn may_continue_abandoned(&self, present: &dyn Fn(usize) -> bool) -> bool {
        !self.state.pending.is_empty()
            || self
                .state
                .players
                .iter()
                .enumerate()
                .any(|(index, player)| !player.eliminated && present(index))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use protocol::GameAction;
    use rand::RngCore;

    fn seats() -> Vec<GameSeat> {
        (0..3)
            .map(|player_id| GameSeat {
                player_id,
                member_id: format!("member-{player_id}"),
                nickname: format!("Player {player_id}"),
            })
            .collect()
    }

    fn extract(state: &mut ::cats::State, kind: ::cats::CardKind) -> ::cats::CardId {
        for player in &mut state.players {
            if let Some(index) = player
                .hand
                .iter()
                .position(|card| card.kind() == Some(kind))
            {
                return player.hand.remove(index);
            }
        }
        let index = state
            .deck
            .iter()
            .position(|card| card.kind() == Some(kind))
            .expect("test card exists in the deck");
        state.deck.remove(index)
    }

    #[test]
    fn session_assigns_sequences_only_to_successful_actions() {
        let now = Instant::now();
        let mut session =
            Session::new(seats(), ::cats::Settings::default(), Some(23), now).unwrap();
        assert_eq!(session.seq(), 0);
        let actor = session.state.turn.player;
        let member = format!("member-{}", actor.0);
        let wrong_member = format!("member-{}", (actor.0 + 1) % 3);
        assert!(matches!(
            session.view(&member),
            GameView::Cats(CatsView::Player(_))
        ));
        assert!(
            session
                .apply(&wrong_member, GameAction::Cats(::cats::Action::Draw), now)
                .is_err()
        );
        assert_eq!(session.seq(), 0);
        session
            .apply(&member, GameAction::Cats(::cats::Action::Draw), now)
            .unwrap();
        assert_eq!(session.seq(), 1);
    }

    #[test]
    fn nope_chain_restores_shuffle_rng_only_when_original_action_stays_noped() {
        let now = Instant::now();
        let mut session =
            Session::new(seats(), ::cats::Settings::default(), Some(27), now).unwrap();
        let actor = session.state.turn.player;
        let noper = session.state.next_active(actor).unwrap();
        let second_noper = session
            .state
            .next_active(noper)
            .expect("three players provide another noper");
        let shuffle = extract(&mut session.state, ::cats::CardKind::Shuffle);
        let first_nope = extract(&mut session.state, ::cats::CardKind::Nope);
        let second_nope = extract(&mut session.state, ::cats::CardKind::Nope);
        session.state.players[actor.0].hand.push(shuffle);
        session.state.players[noper.0].hand.push(first_nope);
        session.state.players[second_noper.0].hand.push(second_nope);

        let rng_before_shuffle = session.rng.clone();
        session
            .apply(
                &format!("member-{}", actor.0),
                GameAction::Cats(::cats::Action::PlayCard { card: shuffle }),
                now,
            )
            .unwrap();
        let rng_after_shuffle = session.rng.clone();
        let first_pending = session.state.last_action().unwrap().id;
        session
            .apply(
                &format!("member-{}", noper.0),
                GameAction::Cats(::cats::Action::Nope {
                    pending_id: first_pending,
                }),
                now,
            )
            .unwrap();
        let rng_after_first_nope = session.rng.clone();
        assert_eq!(
            session.rng.clone().next_u64(),
            rng_before_shuffle.clone().next_u64()
        );

        let second_pending = session.state.last_action().unwrap().id;
        session
            .apply(
                &format!("member-{}", second_noper.0),
                GameAction::Cats(::cats::Action::Nope {
                    pending_id: second_pending,
                }),
                now,
            )
            .unwrap();
        assert_eq!(
            session.rng.clone().next_u64(),
            rng_after_shuffle.clone().next_u64()
        );
        assert_eq!(
            rng_after_first_nope.clone().next_u64(),
            rng_before_shuffle.clone().next_u64()
        );
        assert_eq!(session.seq(), 3);
    }
}
