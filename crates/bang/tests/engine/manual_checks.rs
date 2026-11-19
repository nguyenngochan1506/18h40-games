use super::support::Scenario;
use bang::*;

fn events_count(events: &[Event]) -> usize {
    events
        .iter()
        .filter(|e| matches!(e.kind, EventKind::DrawRevealed { .. }))
        .count()
}
fn id(game: &Scenario) -> PendingId {
    game.state.decision().unwrap().pending_id.unwrap()
}
fn play(game: &mut Scenario, source: usize, kind: CardKind, target: Option<usize>) -> Vec<Event> {
    let card = game.give(source, kind);
    game.act(
        source,
        Action::Play {
            card,
            target: target.map(PlayerId),
        },
    )
}
fn check(game: &mut Scenario) -> Vec<Event> {
    let decision = game.state.decision().unwrap();
    game.act(
        decision.player.0,
        Action::FlipCheck {
            pending_id: decision.pending_id.unwrap(),
        },
    )
}
fn end(game: &mut Scenario) -> Vec<Event> {
    let (player, action) = default_action(&game.state).unwrap();
    assert!(matches!(action, Action::EndTurn { .. }));
    game.act(player.0, action)
}
fn barrel(game: &mut Scenario) -> Vec<Event> {
    let decision = game.state.decision().unwrap();
    game.act(
        decision.player.0,
        Action::FlipBarrel {
            pending_id: decision.pending_id.unwrap(),
        },
    )
}
fn response(game: &mut Scenario, card: Option<CardId>) -> Vec<Event> {
    let decision = game.state.decision().unwrap();
    game.act(
        decision.player.0,
        Action::Respond {
            pending_id: decision.pending_id.unwrap(),
            card,
        },
    )
}
fn attack(game: &mut Scenario) -> Vec<Event> {
    play(game, 0, CardKind::Bang, Some(1))
}
fn attack_state(game: &Scenario) -> (u8, u8) {
    match game.state.decision().unwrap().kind {
        DecisionKind::AttackResponse {
            remaining,
            checks_left,
            ..
        } => (remaining, checks_left),
        _ => panic!("Expected attack"),
    }
}

#[test]
fn dynamite_and_jail_wait_without_drawing_and_validate_actor_id_and_action() {
    for mode in [GameMode::Classic, GameMode::Club] {
        for reason in [CardKind::Dynamite, CardKind::Jail] {
            let mut game = Scenario::new(4);
            game.state.config.mode = mode;
            game.equip(1, reason);
            let deck = game.state.draw_pile.clone();
            let rng = game.rng.get_word_pos();
            let events = end(&mut game);
            assert_eq!(events_count(&events), 0);
            assert_eq!(game.state.draw_pile, deck);
            assert_eq!(game.rng.get_word_pos(), rng);
            assert_eq!(
                game.state.decision().unwrap().kind,
                DecisionKind::Check { reason }
            );
            assert!(game.state.pending.last().unwrap().cards().is_empty());
            for viewer in 0..4 {
                assert!(
                    view(&game.state, PlayerId(viewer))
                        .unwrap()
                        .choices
                        .is_empty()
                );
            }
            let pending_id = id(&game);
            game.reject(
                2,
                Action::FlipCheck { pending_id },
                ActionError::NotYourDecision,
            );
            game.reject(
                1,
                Action::FlipCheck {
                    pending_id: PendingId(pending_id.0 + 1),
                },
                ActionError::StalePending,
            );
            game.reject(
                1,
                Action::FlipBarrel { pending_id },
                ActionError::WrongAction,
            );
            game.reject(
                1,
                Action::Respond {
                    pending_id,
                    card: None,
                },
                ActionError::WrongAction,
            );
            assert_eq!(
                default_action(&game.state),
                Some((PlayerId(1), Action::FlipCheck { pending_id }))
            );
        }
    }
}

#[test]
fn manual_dynamite_checks_the_draw_only_after_flip_and_jail_keeps_mode_rules() {
    for mode in [GameMode::Classic, GameMode::Club] {
        for heart in [false, true] {
            for reason in [CardKind::Dynamite, CardKind::Jail] {
                let mut game = Scenario::new(4);
                game.state.config.mode = mode;
                let card = game.equip(1, reason);
                game.top_face(
                    if heart {
                        CardKind::Beer
                    } else {
                        CardKind::Missed
                    },
                    if heart { Suit::Hearts } else { Suit::Spades },
                    if heart { Rank::Six } else { Rank::Two },
                );
                end(&mut game);
                assert_eq!(game.state.players[1].health, 4);
                assert!(game.state.players[1].in_play.contains(&card));
                let events = check(&mut game);
                assert_eq!(events_count(&events), 1);
                if reason == CardKind::Dynamite {
                    assert_eq!(game.state.players[1].health, if heart { 4 } else { 1 });
                    assert_eq!(game.state.players[2].in_play.contains(&card), heart);
                    assert_eq!(game.state.discard_pile.contains(&card), !heart);
                } else {
                    assert_eq!(
                        game.state.players[1].jail_turns_served,
                        u8::from(mode == GameMode::Club && !heart)
                    );
                    assert_eq!(
                        game.state.players[1].in_play.contains(&card),
                        mode == GameMode::Club && !heart
                    );
                    assert_eq!(game.state.turn.player, PlayerId(if heart { 1 } else { 2 }));
                }
            }
        }
    }
}

#[test]
fn barrel_never_draws_before_choice_and_timeout_or_missed_can_skip_it() {
    for missed in [false, true] {
        let mut game = Scenario::new(4);
        game.equip(1, CardKind::Barrel);
        let response_card = missed.then(|| game.give(1, CardKind::Missed));
        let deck = game.state.draw_pile.len() - 1;
        let events = attack(&mut game);
        assert_eq!(events_count(&events), 0);
        assert_eq!(game.state.draw_pile.len(), deck);
        assert_eq!(attack_state(&game), (1, 1));
        assert_eq!(
            default_action(&game.state),
            Some((
                PlayerId(1),
                Action::Respond {
                    pending_id: id(&game),
                    card: None
                }
            ))
        );
        let events = response(&mut game, response_card);
        assert_eq!(events_count(&events), 0);
        assert_eq!(game.state.players[1].health, if missed { 4 } else { 3 });
        assert!(game.state.pending.is_empty());
    }
    for heart in [false, true] {
        let mut game = Scenario::new(4);
        game.equip(1, CardKind::Barrel);
        attack(&mut game);
        game.top_face(
            if heart {
                CardKind::Beer
            } else {
                CardKind::Missed
            },
            if heart { Suit::Hearts } else { Suit::Spades },
            if heart { Rank::Six } else { Rank::Two },
        );
        let old_id = id(&game);
        game.reject(
            0,
            Action::FlipBarrel { pending_id: old_id },
            ActionError::NotYourDecision,
        );
        let events = barrel(&mut game);
        assert_eq!(events_count(&events), 1);
        if heart {
            assert!(game.state.pending.is_empty());
        } else {
            assert_eq!(attack_state(&game), (1, 0));
            game.reject(
                1,
                Action::FlipBarrel { pending_id: old_id },
                ActionError::StalePending,
            );
            let pending_id = id(&game);
            game.reject(
                1,
                Action::FlipBarrel { pending_id },
                ActionError::WrongAction,
            );
            response(&mut game, None);
            assert_eq!(game.state.players[1].health, 3);
        }
    }
}

#[test]
fn slab_accepts_missed_before_or_after_barrel_without_consuming_unused_checks() {
    for missed_first in [false, true] {
        let mut game = Scenario::new(4);
        game.character(0, Character::SlabTheKiller);
        game.character(1, Character::Jourdonnais);
        game.equip(1, CardKind::Barrel);
        let missed = game.give(1, CardKind::Missed);
        attack(&mut game);
        assert_eq!(attack_state(&game), (2, 2));
        game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
        if missed_first {
            let events = response(&mut game, Some(missed));
            assert_eq!(events_count(&events), 0);
            assert_eq!(attack_state(&game), (1, 2));
            barrel(&mut game);
        } else {
            barrel(&mut game);
            assert_eq!(attack_state(&game), (1, 1));
            response(&mut game, Some(missed));
        }
        assert!(game.state.pending.is_empty());
        assert_eq!(game.state.players[1].health, 4);
    }
}

#[test]
fn jourdonnais_and_barrel_have_two_separate_actions_and_no_third_attempt() {
    for equipment in [false, true] {
        let mut game = Scenario::new(4);
        game.character(0, Character::SlabTheKiller);
        game.character(1, Character::Jourdonnais);
        if equipment {
            game.equip(1, CardKind::Barrel);
        }
        let events = attack(&mut game);
        assert!(!events.iter().any(|e| matches!(
            e.kind,
            EventKind::SkillActivated {
                character: Character::Jourdonnais,
                ..
            }
        )));
        let attempts = if equipment { 2 } else { 1 };
        for left in (0..attempts).rev() {
            game.top_face(
                CardKind::Missed,
                Suit::Spades,
                if left == 1 { Rank::Two } else { Rank::Three },
            );
            let events = barrel(&mut game);
            assert_eq!(events_count(&events), 1);
            assert_eq!(attack_state(&game), (2, left));
            assert_eq!(
                events.iter().any(|e| matches!(
                    e.kind,
                    EventKind::SkillActivated {
                        character: Character::Jourdonnais,
                        ..
                    }
                )),
                left == 0
            );
        }
        let pending_id = id(&game);
        game.reject(
            1,
            Action::FlipBarrel { pending_id },
            ActionError::WrongAction,
        );
        response(&mut game, None);
        assert_eq!(game.state.players[1].health, 3);
    }
}

#[test]
fn barrel_is_available_for_gatling_but_not_indians_or_duel() {
    for kind in [CardKind::Gatling, CardKind::Indians, CardKind::Duel] {
        let mut game = Scenario::new(4);
        game.equip(1, CardKind::Barrel);
        play(&mut game, 0, kind, (kind == CardKind::Duel).then_some(1));
        let pending_id = id(&game);
        if kind == CardKind::Gatling {
            assert_eq!(attack_state(&game), (1, 1));
            barrel(&mut game);
        } else {
            game.reject(
                1,
                Action::FlipBarrel { pending_id },
                ActionError::WrongAction,
            );
        }
    }
}

#[test]
fn lucky_draws_two_only_after_click_then_serialized_choices_resume_the_check() {
    for mode in [GameMode::Classic, GameMode::Club] {
        for reason in [CardKind::Barrel, CardKind::Dynamite, CardKind::Jail] {
            let mut game = Scenario::new(4);
            game.state.config.mode = mode;
            game.character(1, Character::LuckyDuke);
            game.equip(1, reason);
            game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
            let heart = game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
            let events = if reason == CardKind::Barrel {
                attack(&mut game)
            } else {
                end(&mut game)
            };
            assert_eq!(events_count(&events), 0);
            assert!(
                !events
                    .iter()
                    .any(|e| matches!(e.kind, EventKind::ChoiceOffered { .. }))
            );
            let before = game.state.clone();
            let before_rng = game.rng.clone();
            game.state =
                serde_json::from_str(&serde_json::to_string(&game.state).unwrap()).unwrap();
            let pending_id = id(&game);
            let action = if reason == CardKind::Barrel {
                Action::FlipBarrel { pending_id }
            } else {
                Action::FlipCheck { pending_id }
            };
            let events = game.act(1, action.clone());
            let mut replay = before;
            let mut rng = before_rng;
            assert_eq!(
                events,
                apply(&mut replay, PlayerId(1), action, &mut rng).unwrap()
            );
            assert_eq!(game.state, replay);
            assert_eq!(events_count(&events), 0);
            assert_eq!(view(&game.state, PlayerId(1)).unwrap().choices.len(), 2);
            for other in [0, 2, 3] {
                assert!(
                    view(&game.state, PlayerId(other))
                        .unwrap()
                        .choices
                        .is_empty()
                );
            }
            assert_eq!(
                game.state.decision().unwrap().kind,
                DecisionKind::ChooseDrawResult { reason }
            );
            game.reject(
                1,
                Action::FlipCheck { pending_id },
                ActionError::StalePending,
            );
            game.state =
                serde_json::from_str(&serde_json::to_string(&game.state).unwrap()).unwrap();
            let pending_id = id(&game);
            let events = game.act(
                1,
                Action::ChooseDrawResult {
                    pending_id,
                    card: heart,
                },
            );
            assert_eq!(events_count(&events), 1);
            assert!(view(&game.state, PlayerId(1)).unwrap().choices.is_empty());
            assert!(!matches!(
                game.state.decision().unwrap().kind,
                DecisionKind::ChooseDrawResult { .. }
            ));
        }
    }
}

#[test]
fn automatic_club_expirations_do_not_add_extra_flip_prompts() {
    let mut game = Scenario::new(4);
    game.state.config.mode = GameMode::Club;
    let dynamite = game.equip(1, CardKind::Dynamite);
    let jail = game.equip(1, CardKind::Jail);
    game.state.dynamite_round = Some(DynamiteRound {
        card: dynamite,
        remaining: vec![PlayerId(1)],
    });
    game.state.players[1].jail_turns_served = 3;
    game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
    end(&mut game);
    assert_eq!(
        game.state.decision().unwrap().kind,
        DecisionKind::Check {
            reason: CardKind::Dynamite
        }
    );
    let events = check(&mut game);
    assert_eq!(events_count(&events), 1);
    assert!(
        events
            .iter()
            .any(|e| matches!(e.kind, EventKind::JailExpired { .. }))
    );
    assert!(
        events
            .iter()
            .any(|e| matches!(e.kind, EventKind::DynamiteRoundEnded { .. }))
    );
    assert!(game.state.pending.is_empty());
    assert!(game.state.discard_pile.contains(&dynamite));
    assert!(game.state.discard_pile.contains(&jail));
    assert_eq!(game.state.players[1].hand.len(), 2);
    let mut game = Scenario::new(4);
    play(&mut game, 0, CardKind::Dynamite, None);
    for _ in 0..3 {
        assert_eq!(events_count(&end(&mut game)), 0);
    }
    assert_eq!(events_count(&end(&mut game)), 0);
    assert_eq!(
        game.state.decision().unwrap().kind,
        DecisionKind::Check {
            reason: CardKind::Dynamite
        }
    );
}
