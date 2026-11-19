use super::support::{Scenario, invariant};
use bang::*;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use std::collections::BTreeSet;

fn open(game: &mut Scenario, actor: usize, target: usize, kind: CardKind) -> Vec<Event> {
    let card = game.give(actor, kind);
    game.act(
        actor,
        Action::AffectCard {
            card,
            target: PlayerId(target),
            selection: CardSelection::Hand,
        },
    )
}

fn slots(game: &Scenario) -> Vec<CardId> {
    match &game.state.pending.last().unwrap().kind {
        PendingKind::PickHandSlot { slots, .. } => slots.clone(),
        frame => panic!("Expected blind hand pick, got {frame:?}"),
    }
}

fn choose(game: &mut Scenario, slot: u8) -> Vec<Event> {
    let decision = game.state.decision().unwrap();
    game.act(
        decision.player.0,
        Action::ChooseHandSlot {
            pending_id: decision.pending_id.unwrap(),
            slot,
        },
    )
}

#[test]
fn each_slot_resolves_the_private_permutation_in_both_modes_with_one_or_many_cards() {
    for mode in [GameMode::Classic, GameMode::Club] {
        for kind in [CardKind::Panic, CardKind::CatBalou] {
            for count in [1, 3] {
                for slot in 0..count {
                    let mut game = Scenario::new(4);
                    game.state.config.mode = mode;
                    for _ in 0..count {
                        game.give(1, CardKind::Bang);
                    }
                    let before = game.state.players[1].hand.clone();
                    let events = open(&mut game, 0, 1, kind);
                    assert_eq!(game.state.players[1].hand, before);
                    assert!(game.state.pending.last().unwrap().cards().is_empty());
                    assert!(events.iter().any(|event| event.kind
                        == EventKind::HandSlotsOpened {
                            actor: PlayerId(0),
                            target: PlayerId(1),
                            count
                        }));
                    assert!(!events.iter().any(|event| matches!(
                        event.kind,
                        EventKind::HandCardAffected { .. } | EventKind::HandAffected { .. }
                    )));
                    assert_eq!(
                        game.state.decision().unwrap().kind,
                        DecisionKind::PickHandSlot {
                            target: PlayerId(1),
                            kind,
                            count
                        }
                    );
                    let selected = slots(&game)[usize::from(slot)];
                    let events = choose(&mut game, slot);
                    assert!(!game.state.players[1].hand.contains(&selected));
                    assert_eq!(game.state.players[1].hand.len(), usize::from(count - 1));
                    assert!(game.state.pending.is_empty());
                    assert!(events.iter().any(|event| event.kind
                        == EventKind::HandSlotClaimed {
                            actor: PlayerId(0),
                            target: PlayerId(1),
                            slot
                        }));
                    for recipient in [
                        None,
                        Some(PlayerId(0)),
                        Some(PlayerId(1)),
                        Some(PlayerId(2)),
                    ] {
                        let details: Vec<_> = filter_events(&events, recipient)
                            .into_iter()
                            .filter(|event| {
                                matches!(event.kind, EventKind::HandCardAffected { .. })
                            })
                            .collect();
                        assert_eq!(
                            details.len(),
                            usize::from(
                                recipient == Some(PlayerId(0))
                                    || kind == CardKind::CatBalou && recipient == Some(PlayerId(1))
                            )
                        );
                        assert!(details.iter().all(|event| matches!(event.kind, EventKind::HandCardAffected { card, .. } if card == selected)));
                    }
                    if kind == CardKind::Panic {
                        assert_eq!(game.state.players[0].hand, vec![selected]);
                        assert!(!game.state.discard_pile.contains(&selected));
                    } else {
                        assert!(game.state.discard_pile.contains(&selected));
                        assert_eq!(spectator_view(&game.state).discard_top, None);
                    }
                }
            }
        }
    }
}

#[test]
fn seed_shuffles_only_the_private_map_and_replay_preserves_it() {
    for kind in [CardKind::Panic, CardKind::CatBalou] {
        let mut maps = BTreeSet::new();
        let mut reference = None;
        for seed in 0..24 {
            let mut game = Scenario::new(4);
            for _ in 0..4 {
                game.give(1, CardKind::Bang);
            }
            game.rng = ChaCha8Rng::seed_from_u64(seed);
            let events = open(&mut game, 0, 1, kind);
            let map = slots(&game);
            let mut sorted = map.clone();
            sorted.sort();
            assert_eq!(sorted, game.state.players[1].hand);
            maps.insert(map);
            let public = (
                spectator_view(&game.state),
                view(&game.state, PlayerId(0)),
                view(&game.state, PlayerId(1)),
                filter_events(&events, Some(PlayerId(0))),
            );
            if let Some(reference) = &reference {
                assert_eq!(&public, reference);
            } else {
                reference = Some(public);
            }
            let mut restored: GameState =
                serde_json::from_str(&serde_json::to_string(&game.state).unwrap()).unwrap();
            let mut rng = game.rng.clone();
            let (player, action) = default_action(&game.state).unwrap();
            assert_eq!(
                action,
                Action::ChooseHandSlot {
                    pending_id: game.state.decision().unwrap().pending_id.unwrap(),
                    slot: 0
                }
            );
            let action = serde_json::from_str(&serde_json::to_string(&action).unwrap()).unwrap();
            let expected = apply(&mut restored, player, action, &mut rng).unwrap();
            assert_eq!(choose(&mut game, 0), expected);
            assert_eq!(restored, game.state);
            assert_eq!(rng.get_word_pos(), game.rng.get_word_pos());
            invariant(&restored);
        }
        assert!(maps.len() > 1, "The map cannot expose the real hand order");
    }
}

#[test]
fn invalid_slots_nonces_and_actors_never_mutate_state_or_rng() {
    for kind in [CardKind::Panic, CardKind::CatBalou] {
        let mut game = Scenario::new(4);
        let card = game.give(0, kind);
        for target in [0, 1] {
            game.reject(
                0,
                Action::AffectCard {
                    card,
                    target: PlayerId(target),
                    selection: CardSelection::Hand,
                },
                ActionError::InvalidTarget,
            );
        }
        game.give(1, CardKind::Bang);
        game.act(
            0,
            Action::AffectCard {
                card,
                target: PlayerId(1),
                selection: CardSelection::Hand,
            },
        );
        let pending_id = game.state.decision().unwrap().pending_id.unwrap();
        for slot in [1, 255] {
            game.reject(
                0,
                Action::ChooseHandSlot { pending_id, slot },
                ActionError::InvalidCard,
            );
        }
        game.reject(
            0,
            Action::ChooseHandSlot {
                pending_id: PendingId(pending_id.0 + 1),
                slot: 0,
            },
            ActionError::StalePending,
        );
        game.reject(
            1,
            Action::ChooseHandSlot {
                pending_id,
                slot: 0,
            },
            ActionError::NotYourDecision,
        );
        choose(&mut game, 0);
        game.reject(
            0,
            Action::ChooseHandSlot {
                pending_id,
                slot: 0,
            },
            ActionError::StalePending,
        );
    }
}

#[test]
fn suzy_waits_for_the_effect_then_draws_only_for_an_empty_hand() {
    for kind in [CardKind::Panic, CardKind::CatBalou] {
        let mut game = Scenario::new(4);
        game.character(0, Character::SuzyLafayette);
        game.character(1, Character::SuzyLafayette);
        game.give(1, CardKind::Bang);
        let events = open(&mut game, 0, 1, kind);
        assert!(game.state.players[0].hand.is_empty());
        assert!(!events.iter().any(|e| matches!(
            e.kind,
            EventKind::CardsDrawn {
                player: PlayerId(0),
                ..
            }
        )));
        let events = choose(&mut game, 0);
        assert_eq!(game.state.players[0].hand.len(), 1);
        assert_eq!(game.state.players[1].hand.len(), 1);
        for player in [PlayerId(0), PlayerId(1)] {
            let count = events
                .iter()
                .filter(
                    |e| matches!(e.kind, EventKind::CardsDrawn { player: p, .. } if p == player),
                )
                .count();
            assert_eq!(
                count,
                usize::from(player == PlayerId(1) || kind == CardKind::CatBalou)
            );
        }
        let mut game = Scenario::new(4);
        game.character(0, Character::SuzyLafayette);
        game.give(0, CardKind::Bang);
        open(&mut game, 0, 0, kind);
        choose(&mut game, 0);
        assert_eq!(game.state.players[0].hand.len(), 1);
    }
}

#[test]
fn sid_changes_refresh_the_map_nonce_and_default_or_cancel_without_losing_cards() {
    for count in [2, 3] {
        let mut game = Scenario::new(4);
        for _ in 0..count {
            game.give(1, CardKind::Bang);
        }
        game.state.players[1].health -= 1;
        open(&mut game, 0, 1, CardKind::Panic);
        let pending_id = game.state.pending.last().unwrap().id;
        let hand = game.state.players[1].hand.clone();
        let events = game.act(
            1,
            Action::SidHeal {
                pending_id: None,
                discard: [hand[0], hand[1]],
            },
        );
        if count == 2 {
            assert!(game.state.pending.is_empty());
            assert!(
                events
                    .iter()
                    .any(|e| matches!(e.kind, EventKind::HandPickCancelled { .. }))
            );
        } else {
            assert_ne!(game.state.pending.last().unwrap().id, pending_id);
            assert_eq!(slots(&game), game.state.players[1].hand);
            game.reject(
                0,
                Action::ChooseHandSlot {
                    pending_id,
                    slot: 0,
                },
                ActionError::StalePending,
            );
            let (_, action) = default_action(&game.state).unwrap();
            game.act(0, action);
            assert_eq!(game.state.players[0].hand.len(), 1);
        }
    }
}

#[test]
fn dying_interruptions_cancel_dead_actor_or_target_and_vulture_inherits_owned_hands() {
    for victim in [1, 2] {
        let mut game = Scenario::new(4);
        game.state.turn.player = PlayerId(1);
        game.character(3, Character::VultureSam);
        let actor_card = game.give(1, CardKind::Beer);
        let target_card = game.give(2, CardKind::Bang);
        open(&mut game, 1, 2, CardKind::Panic);
        game.dying_child(victim, None);
        let id = game.state.pending.last().unwrap().id;
        let events = game.act(
            victim,
            Action::Respond {
                pending_id: id,
                card: None,
            },
        );
        assert!(!game.state.players[victim].alive);
        assert!(game.state.pending.is_empty());
        assert!(game.state.players[3].hand.contains(&if victim == 1 {
            actor_card
        } else {
            target_card
        }));
        assert!(events.iter().any(|e| matches!(
            e.kind,
            EventKind::HandPickCancelled {
                actor: PlayerId(1),
                target: PlayerId(2)
            }
        )));
        if victim == 1 {
            assert!(game.state.players[2].hand.contains(&target_card));
            assert!(
                !events
                    .iter()
                    .any(|e| matches!(e.kind, EventKind::HandAffected { .. }))
            );
        } else {
            assert_eq!(game.state.players[1].hand, vec![actor_card]);
        }
    }
    let mut game = Scenario::new(4);
    game.give(1, CardKind::Bang);
    open(&mut game, 0, 1, CardKind::Panic);
    game.dying_child(0, None);
    let id = game.state.pending.last().unwrap().id;
    game.act(
        0,
        Action::Respond {
            pending_id: id,
            card: None,
        },
    );
    assert!(game.state.winner.is_some());
    assert!(game.state.pending.is_empty());
}
