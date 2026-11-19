use super::support::{Scenario, invariant};
use bang::*;

fn begin_turn(game: &mut Scenario, player: usize) -> Vec<Event> {
    game.state.turn.player =
        PlayerId((player + game.state.players.len() - 1) % game.state.players.len());
    game.end()
}

fn id(game: &Scenario) -> PendingId {
    game.state.pending.last().unwrap().id
}

fn private_cards(events: &[Event], recipient: Option<PlayerId>) -> Vec<CardId> {
    filter_events(events, recipient)
        .into_iter()
        .flat_map(|event| match event.kind {
            EventKind::CardsReceived { cards, .. }
            | EventKind::StolenCards { cards, .. }
            | EventKind::ChoiceOffered { cards, .. } => cards,
            _ => vec![],
        })
        .collect()
}

fn exhaust(game: &mut Scenario, available: usize) {
    let held = game.state.draw_pile.split_off(available);
    game.state.players[3].hand.extend(held);
}

fn resumed(game: &mut Scenario) {
    let mut restored: GameState =
        serde_json::from_str(&serde_json::to_string(&game.state).unwrap()).unwrap();
    assert_eq!(restored, game.state);
    let mut rng = game.rng.clone();
    let (player, action) = default_action(&game.state).unwrap();
    let events = apply(&mut restored, player, action.clone(), &mut rng).unwrap();
    assert_eq!(events, game.act(player.0, action));
    assert_eq!(restored, game.state);
    assert_eq!(rng.get_word_pos(), game.rng.get_word_pos());
    invariant(&restored);
}

#[test]
fn paul_and_rose_stack_with_equipment_and_affect_bang_and_panic() {
    let mut game = Scenario::new(7);
    game.character(0, Character::RoseDoolan);
    game.character(3, Character::PaulRegret);
    game.equip(3, CardKind::Mustang);
    assert_eq!(
        effective_distance(&game.state, PlayerId(0), PlayerId(3)),
        Ok(4)
    );
    game.equip(0, CardKind::Scope);
    assert_eq!(
        effective_distance(&game.state, PlayerId(0), PlayerId(3)),
        Ok(3)
    );
    let bang = game.give(0, CardKind::Bang);
    game.reject(
        0,
        Action::Play {
            card: bang,
            target: Some(PlayerId(3)),
        },
        ActionError::OutOfRange,
    );
    game.equip(0, CardKind::Remington);
    let events = game.act(
        0,
        Action::Play {
            card: bang,
            target: Some(PlayerId(3)),
        },
    );
    for player in [PlayerId(0), PlayerId(3)] {
        assert!(
            events.iter().any(
                |e| matches!(e.kind, EventKind::SkillActivated { player: p, .. } if p == player)
            )
        );
    }
    game.respond(None);
    let panic = game.give(0, CardKind::Panic);
    game.give(3, CardKind::Bang);
    game.reject(
        0,
        Action::AffectCard {
            card: panic,
            target: PlayerId(3),
            selection: CardSelection::Hand,
        },
        ActionError::OutOfRange,
    );
    game.dead(1);
    game.dead(2);
    assert_eq!(
        effective_distance(&game.state, PlayerId(0), PlayerId(3)),
        Ok(1)
    );
    game.act(
        0,
        Action::AffectCard {
            card: panic,
            target: PlayerId(3),
            selection: CardSelection::Hand,
        },
    );
    assert_eq!(
        effective_distance(&game.state, PlayerId(0), PlayerId(0)),
        Ok(1)
    );
    assert_eq!(
        effective_distance(&game.state, PlayerId(1), PlayerId(3)),
        Err(ActionError::InvalidTarget)
    );
}

#[test]
fn willy_remains_unlimited_with_or_without_volcanic_and_still_obeys_range() {
    let mut game = Scenario::new(4);
    game.character(0, Character::WillyTheKid);
    game.equip(0, CardKind::Volcanic);
    for _ in 0..3 {
        game.shoot(0, 1);
        game.respond(None);
    }
    let gun = game.give(0, CardKind::Schofield);
    game.act(
        0,
        Action::Play {
            card: gun,
            target: None,
        },
    );
    game.shoot(0, 1);
    game.respond(None);
    game.respond(None);
    assert!(!game.state.players[1].alive);
    assert_eq!(game.state.turn.bangs_played, 4);
    let mut game = Scenario::new(7);
    game.character(0, Character::WillyTheKid);
    game.state.turn.bangs_played = 8;
    let bang = game.give(0, CardKind::Bang);
    game.reject(
        0,
        Action::Play {
            card: bang,
            target: Some(PlayerId(3)),
        },
        ActionError::OutOfRange,
    );
}

#[test]
fn slab_barrel_and_jourdonnais_reduce_each_required_response_independently() {
    for (jourdonnais, barrel, hearts, remaining) in [
        (false, true, 1, 1),
        (true, false, 1, 1),
        (true, true, 2, 0),
        (true, true, 1, 1),
        (true, true, 0, 2),
    ] {
        let mut game = Scenario::new(4);
        game.character(0, Character::SlabTheKiller);
        if jourdonnais {
            game.character(1, Character::Jourdonnais);
        }
        if barrel {
            game.equip(1, CardKind::Barrel);
        }
        let checks = usize::from(jourdonnais) + usize::from(barrel);
        for i in (0..checks).rev() {
            if i < hearts {
                game.top_face(
                    CardKind::Beer,
                    Suit::Hearts,
                    if i == 0 { Rank::Six } else { Rank::Seven },
                );
            } else {
                game.top_face(
                    CardKind::Missed,
                    Suit::Spades,
                    if i == 0 { Rank::Two } else { Rank::Three },
                );
            }
        }
        let bang = game.give(0, CardKind::Bang);
        let events = game.act(
            0,
            Action::Play {
                card: bang,
                target: Some(PlayerId(1)),
            },
        );
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(e.kind, EventKind::DrawRevealed { .. }))
                .count(),
            checks
        );
        if remaining == 0 {
            assert!(game.state.pending.is_empty());
        } else {
            assert!(
                matches!(game.state.decision().unwrap().kind, DecisionKind::AttackResponse { remaining: r, .. } if r == remaining)
            );
            for _ in 0..remaining {
                let missed = game.give(1, CardKind::Missed);
                game.respond(Some(missed));
            }
        }
        assert_eq!(game.state.players[1].health, 4);
    }
}

#[test]
fn jourdonnais_stops_after_success_and_neither_slab_nor_barrel_modifies_indians() {
    let mut game = Scenario::new(4);
    game.character(0, Character::SlabTheKiller);
    game.character(1, Character::Jourdonnais);
    game.equip(1, CardKind::Barrel);
    game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
    let card = game.give(0, CardKind::Gatling);
    let events = game.act(0, Action::Play { card, target: None });
    assert_eq!(
        events
            .iter()
            .filter(|e| matches!(e.kind, EventKind::DrawRevealed { .. }))
            .count(),
        1
    );
    assert_eq!(game.state.decision().unwrap().player, PlayerId(2));
    game.respond(None);
    game.respond(None);
    let card = game.give(0, CardKind::Indians);
    let events = game.act(0, Action::Play { card, target: None });
    assert!(
        !events
            .iter()
            .any(|e| matches!(e.kind, EventKind::DrawRevealed { .. }))
    );
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse {
            kind: AttackKind::Indians,
            remaining: 1
        }
    ));
}

#[test]
fn calamity_converts_both_cards_in_turn_duel_and_indians_but_counts_bang_limit() {
    let mut game = Scenario::new(4);
    game.character(0, Character::CalamityJanet);
    let card = game.give(0, CardKind::Missed);
    game.act(
        0,
        Action::Play {
            card,
            target: Some(PlayerId(1)),
        },
    );
    game.respond(None);
    let second = game.give(0, CardKind::Missed);
    game.reject(
        0,
        Action::Play {
            card: second,
            target: Some(PlayerId(1)),
        },
        ActionError::BangLimit,
    );
    game.equip(0, CardKind::Volcanic);
    game.act(
        0,
        Action::Play {
            card: second,
            target: Some(PlayerId(1)),
        },
    );
    game.respond(None);
    let mut game = Scenario::new(4);
    game.character(1, Character::CalamityJanet);
    let bang = game.give(1, CardKind::Bang);
    game.shoot(0, 1);
    game.respond(Some(bang));
    let card = game.give(0, CardKind::Indians);
    let missed = game.give(1, CardKind::Missed);
    game.act(0, Action::Play { card, target: None });
    game.respond(Some(missed));
    game.respond(None);
    game.respond(None);
    let duel = game.give(0, CardKind::Duel);
    let missed = game.give(1, CardKind::Missed);
    game.act(
        0,
        Action::Play {
            card: duel,
            target: Some(PlayerId(1)),
        },
    );
    game.respond(Some(missed));
    assert_eq!(game.state.decision().unwrap().player, PlayerId(0));
    let missed = game.give(0, CardKind::Missed);
    game.reject(
        0,
        Action::Respond {
            pending_id: id(&game),
            card: Some(missed),
        },
        ActionError::WrongAction,
    );
}

#[test]
fn black_jack_shows_only_second_card_and_draws_extra_for_each_red_suit() {
    for (suit, red) in [
        (Suit::Hearts, true),
        (Suit::Diamonds, true),
        (Suit::Spades, false),
        (Suit::Clubs, false),
    ] {
        let mut game = Scenario::new(4);
        game.character(1, Character::BlackJack);
        let second = game.top_face(
            CardKind::Bang,
            suit,
            if suit == Suit::Hearts {
                Rank::Queen
            } else if suit == Suit::Spades {
                Rank::Ace
            } else {
                Rank::Two
            },
        );
        let first = game.state.draw_pile[0];
        game.top(first);
        let events = begin_turn(&mut game, 1);
        assert_eq!(game.state.players[1].hand.len(), if red { 3 } else { 2 });
        let shown: Vec<_> = filter_events(&events, None)
            .iter()
            .filter_map(|e| match e.kind {
                EventKind::CardShown { card, .. } => Some(card),
                _ => None,
            })
            .collect();
        assert_eq!(shown, vec![second]);
        assert!(private_cards(&events, None).is_empty());
        assert_eq!(game.state.players[1].hand[0], first);
    }
    let mut game = Scenario::new(4);
    game.character(1, Character::BlackJack);
    exhaust(&mut game, 1);
    let events = begin_turn(&mut game, 1);
    assert_eq!(game.state.players[1].hand.len(), 1);
    assert!(
        !events
            .iter()
            .any(|e| matches!(e.kind, EventKind::CardShown { .. }))
    );
}

#[test]
fn jesse_chooses_source_rejects_empty_self_dead_and_stale_without_rng_changes() {
    let mut game = Scenario::new(4);
    game.character(1, Character::JesseJones);
    begin_turn(&mut game, 1);
    let pending_id = id(&game);
    for target in [1, 2, 99] {
        game.reject(
            1,
            Action::ChooseDrawSource {
                pending_id,
                source: DrawSource::Player(PlayerId(target)),
            },
            ActionError::InvalidTarget,
        );
    }
    game.reject(
        1,
        Action::ChooseDrawSource {
            pending_id,
            source: DrawSource::Discard,
        },
        ActionError::InvalidTarget,
    );
    game.reject(
        0,
        Action::ChooseDrawSource {
            pending_id,
            source: DrawSource::Deck,
        },
        ActionError::NotYourDecision,
    );
    let stolen = game.give(2, CardKind::Bang);
    game.give(2, CardKind::Beer);
    let before = game.state.clone();
    let before_rng = game.rng.clone();
    let events = game.act(
        1,
        Action::ChooseDrawSource {
            pending_id,
            source: DrawSource::Player(PlayerId(2)),
        },
    );
    assert_eq!(game.state.players[1].hand.len(), 2);
    assert_eq!(game.state.players[2].hand.len(), 1);
    assert!(private_cards(&events, None).is_empty());
    assert!(private_cards(&events, Some(PlayerId(0))).is_empty());
    assert_eq!(private_cards(&events, Some(PlayerId(2))).len(), 1);
    let mut swapped = before;
    swapped.players[2].hand.reverse();
    let mut rng = before_rng;
    let alternate = apply(
        &mut swapped,
        PlayerId(1),
        Action::ChooseDrawSource {
            pending_id,
            source: DrawSource::Player(PlayerId(2)),
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(
        filter_events(&events, None),
        filter_events(&alternate, None)
    );
    assert_eq!(view(&game.state, PlayerId(0)), view(&swapped, PlayerId(0)));
    assert!(
        game.state.players[1].hand.contains(&stolen) != swapped.players[1].hand.contains(&stolen)
    );
    game.reject(
        1,
        Action::ChooseDrawSource {
            pending_id,
            source: DrawSource::Deck,
        },
        ActionError::StalePending,
    );
    let mut empty = Scenario::new(4);
    empty.character(1, Character::JesseJones);
    empty.dead(2);
    begin_turn(&mut empty, 1);
    empty.reject(
        1,
        Action::ChooseDrawSource {
            pending_id: id(&empty),
            source: DrawSource::Player(PlayerId(2)),
        },
        ActionError::InvalidTarget,
    );
    resumed(&mut empty);
    assert_eq!(empty.state.players[1].hand.len(), 2);
}

#[test]
fn pedro_chooses_discard_or_deck_and_does_not_reveal_a_hidden_discard() {
    let mut game = Scenario::new(4);
    game.character(1, Character::PedroRamirez);
    begin_turn(&mut game, 1);
    game.reject(
        1,
        Action::ChooseDrawSource {
            pending_id: id(&game),
            source: DrawSource::Discard,
        },
        ActionError::InvalidTarget,
    );
    resumed(&mut game);
    assert_eq!(game.state.players[1].hand.len(), 2);
    let mut game = Scenario::new(4);
    game.character(1, Character::PedroRamirez);
    let secret = game.give(2, CardKind::Bang);
    let cat = game.give(0, CardKind::CatBalou);
    game.act(
        0,
        Action::AffectCard {
            card: cat,
            target: PlayerId(2),
            selection: CardSelection::Hand,
        },
    );
    assert_eq!(spectator_view(&game.state).discard_top, None);
    begin_turn(&mut game, 1);
    let pending_id = id(&game);
    let events = game.act(
        1,
        Action::ChooseDrawSource {
            pending_id,
            source: DrawSource::Discard,
        },
    );
    assert!(game.state.players[1].hand.contains(&secret));
    assert!(private_cards(&events, None).is_empty());
    assert_eq!(spectator_view(&game.state).discard_top, Some(cat));
    game.reject(
        1,
        Action::ChooseDrawSource {
            pending_id,
            source: DrawSource::Deck,
        },
        ActionError::StalePending,
    );
}

#[test]
fn kit_private_pool_exact_selection_defaults_and_short_deck_preserve_all_cards() {
    for available in 0..=3 {
        let mut game = Scenario::new(4);
        game.character(1, Character::KitCarlson);
        exhaust(&mut game, available);
        let events = begin_turn(&mut game, 1);
        assert!(private_cards(&events, None).is_empty());
        assert!(view(&game.state, PlayerId(0)).unwrap().choices.is_empty());
        assert_eq!(spectator_view(&game.state).store_slots, 0);
        if available == 0 {
            assert!(game.state.pending.is_empty());
            continue;
        }
        let pool = view(&game.state, PlayerId(1)).unwrap().choices;
        assert_eq!(pool.len(), available);
        let pending_id = id(&game);
        game.reject(
            1,
            Action::KeepCards {
                pending_id,
                cards: vec![],
            },
            ActionError::InvalidCard,
        );
        game.reject(
            1,
            Action::KeepCards {
                pending_id: PendingId(pending_id.0 + 1),
                cards: pool[..available.min(2)].to_vec(),
            },
            ActionError::StalePending,
        );
        if available >= 2 {
            game.reject(
                1,
                Action::KeepCards {
                    pending_id,
                    cards: vec![pool[0], pool[0]],
                },
                ActionError::InvalidCard,
            );
        }
        if available == 3 {
            let mut alternate = game.state.clone();
            if let PendingKind::KeepCards { pool, .. } =
                &mut alternate.pending.last_mut().unwrap().kind
            {
                pool.swap(0, 2);
            }
            assert_eq!(
                view(&game.state, PlayerId(0)),
                view(&alternate, PlayerId(0))
            );
            assert_ne!(
                view(&game.state, PlayerId(1)),
                view(&alternate, PlayerId(1))
            );
        }
        resumed(&mut game);
        assert_eq!(game.state.players[1].hand, pool[..available.min(2)]);
        assert_eq!(
            game.state.draw_pile.last().copied(),
            (available == 3).then_some(pool[available - 1])
        );
        game.reject(
            1,
            Action::KeepCards {
                pending_id,
                cards: vec![pool[0]],
            },
            ActionError::StalePending,
        );
    }
}

#[test]
fn lucky_barrel_choice_is_private_until_selected_and_resumes_the_same_attack() {
    let mut game = Scenario::new(4);
    game.character(0, Character::SlabTheKiller);
    game.character(1, Character::LuckyDuke);
    game.equip(1, CardKind::Barrel);
    let heart = game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
    let spade = game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
    let bang = game.give(0, CardKind::Bang);
    let events = game.act(
        0,
        Action::Play {
            card: bang,
            target: Some(PlayerId(1)),
        },
    );
    let pending_id = id(&game);
    assert_eq!(
        view(&game.state, PlayerId(1)).unwrap().choices,
        vec![spade, heart]
    );
    assert!(private_cards(&events, None).is_empty());
    assert!(view(&game.state, PlayerId(0)).unwrap().choices.is_empty());
    assert!(
        !events
            .iter()
            .any(|e| matches!(e.kind, EventKind::DrawRevealed { .. }))
    );
    game.reject(
        1,
        Action::ChooseDrawResult {
            pending_id,
            card: bang,
        },
        ActionError::InvalidCard,
    );
    game.reject(
        1,
        Action::ChooseDrawResult {
            pending_id: PendingId(pending_id.0 + 1),
            card: heart,
        },
        ActionError::StalePending,
    );
    game.reject(
        1,
        Action::Respond {
            pending_id,
            card: None,
        },
        ActionError::WrongAction,
    );
    let mut restored: GameState =
        serde_json::from_str(&serde_json::to_string(&game.state).unwrap()).unwrap();
    let mut rng = game.rng.clone();
    let action = Action::ChooseDrawResult {
        pending_id,
        card: heart,
    };
    let events = game.act(1, action.clone());
    assert_eq!(
        events,
        apply(&mut restored, PlayerId(1), action, &mut rng).unwrap()
    );
    assert_eq!(restored, game.state);
    assert_eq!(rng.get_word_pos(), game.rng.get_word_pos());
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse { remaining: 1, .. }
    ));
    assert!(
        filter_events(&events, None)
            .iter()
            .any(|e| matches!(e.kind, EventKind::DrawRevealed { card, .. } if card == heart))
    );
    assert_eq!(
        game.state
            .discard_pile
            .iter()
            .filter(|c| **c == heart || **c == spade)
            .count(),
        2
    );
    assert_eq!(spectator_view(&game.state).discard_top, Some(heart));
    game.reject(
        1,
        Action::ChooseDrawResult {
            pending_id,
            card: spade,
        },
        ActionError::StalePending,
    );
}

#[test]
fn lucky_dynamite_and_jail_continuations_resume_without_rechecking_or_skipping_draw() {
    for explode in [false, true] {
        let mut game = Scenario::new(4);
        game.character(1, Character::LuckyDuke);
        let dynamite = game.equip(1, CardKind::Dynamite);
        game.equip(1, CardKind::Jail);
        let safe = game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
        let danger = game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
        begin_turn(&mut game, 1);
        assert_eq!(game.state.turn.step, TurnStep::Jail);
        let action = Action::ChooseDrawResult {
            pending_id: id(&game),
            card: if explode { danger } else { safe },
        };
        let events = game.act(1, action);
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(
                    e.kind,
                    EventKind::DrawRevealed {
                        reason: CardKind::Dynamite,
                        ..
                    }
                ))
                .count(),
            1
        );
        assert_eq!(game.state.players[1].health, if explode { 1 } else { 4 });
        assert_eq!(game.state.turn.step, TurnStep::Draw);
        assert!(matches!(
            game.state.pending.last().unwrap().kind,
            PendingKind::ChooseDrawResult {
                continuation: DrawContinuation::Jail { .. },
                ..
            }
        ));
        assert!(if explode {
            game.state.discard_pile.contains(&dynamite)
        } else {
            game.state.players[2].in_play.contains(&dynamite)
        });
        resumed(&mut game);
        assert!(game.state.pending.is_empty());
    }
    for escape in [false, true] {
        let mut game = Scenario::new(4);
        game.character(1, Character::LuckyDuke);
        game.equip(1, CardKind::Jail);
        let heart = game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
        let spade = game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
        begin_turn(&mut game, 1);
        let action = Action::ChooseDrawResult {
            pending_id: id(&game),
            card: if escape { heart } else { spade },
        };
        game.act(1, action);
        assert_eq!(game.state.turn.player, PlayerId(if escape { 1 } else { 2 }));
        assert_eq!(game.state.players[1].hand.len(), if escape { 2 } else { 0 });
    }
}

#[test]
fn lucky_default_uses_first_available_and_no_card_means_failed_draw_check() {
    for available in 0..=2 {
        let mut game = Scenario::new(4);
        game.character(1, Character::LuckyDuke);
        let dynamite = game.equip(1, CardKind::Dynamite);
        // Leave only safe hearts available; all other cards remain owned.
        let safe: Vec<_> = game
            .state
            .draw_pile
            .iter()
            .copied()
            .filter(|c| c.card().unwrap().suit == Suit::Hearts)
            .take(available)
            .collect();
        let all = std::mem::take(&mut game.state.draw_pile);
        for card in all {
            if safe.contains(&card) {
                game.state.draw_pile.push(card);
            } else {
                game.state.players[3].hand.push(card);
            }
        }
        begin_turn(&mut game, 1);
        if available > 0 {
            let pool = view(&game.state, PlayerId(1)).unwrap().choices;
            assert_eq!(pool.len(), available);
            let (_, action) = default_action(&game.state).unwrap();
            assert_eq!(
                action,
                Action::ChooseDrawResult {
                    pending_id: id(&game),
                    card: pool[0]
                }
            );
            resumed(&mut game);
        }
        assert!(game.state.players[2].in_play.contains(&dynamite));
        assert_eq!(game.state.players[1].health, 4);
        invariant(&game.state);
    }
    let mut game = Scenario::new(4);
    game.equip(1, CardKind::Jail);
    exhaust(&mut game, 0);
    begin_turn(&mut game, 1);
    assert_eq!(game.state.turn.player, PlayerId(2));
    invariant(&game.state);
}

#[test]
fn bart_draws_per_hp_before_dying_and_can_save_with_the_just_drawn_beer() {
    let mut game = Scenario::new(4);
    game.character(1, Character::BartCassidy);
    game.state.players[1].health = 1;
    let beer = game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
    game.shoot(0, 1);
    let events = game.respond(None);
    assert_eq!(game.state.players[1].hand, vec![beer]);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::Dying { needed: 1 }
    ));
    let drawn = events
        .iter()
        .position(|e| {
            matches!(
                e.kind,
                EventKind::CardsReceived {
                    player: PlayerId(1),
                    ..
                }
            )
        })
        .unwrap();
    let dying = events
        .iter()
        .position(|e| {
            matches!(
                e.kind,
                EventKind::DecisionChanged {
                    decision: Some(Decision {
                        kind: DecisionKind::Dying { .. },
                        ..
                    })
                }
            )
        })
        .unwrap();
    assert!(drawn < dying);
    game.respond(Some(beer));
    assert_eq!(game.state.players[1].health, 1);
    let mut game = Scenario::new(4);
    game.character(1, Character::BartCassidy);
    game.equip(1, CardKind::Dynamite);
    game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
    begin_turn(&mut game, 1);
    assert_eq!(game.state.players[1].health, 1);
    assert_eq!(game.state.players[1].hand.len(), 5); // Three damage draws, then two normal draws.
}

#[test]
fn el_gringo_steals_before_dying_privately_handles_empty_source_and_ignores_dynamite() {
    let mut game = Scenario::new(4);
    game.character(1, Character::ElGringo);
    game.state.players[1].health = 1;
    let beer = game.give(0, CardKind::Beer);
    game.shoot(0, 1);
    let events = game.respond(None);
    assert_eq!(game.state.players[1].hand, vec![beer]);
    assert_eq!(private_cards(&events, Some(PlayerId(0))), vec![beer]);
    assert_eq!(private_cards(&events, Some(PlayerId(1))), vec![beer]);
    assert!(private_cards(&events, None).is_empty());
    assert!(private_cards(&events, Some(PlayerId(2))).is_empty());
    game.respond(Some(beer));
    assert_eq!(game.state.players[1].health, 1);
    let mut game = Scenario::new(4);
    game.character(1, Character::ElGringo);
    game.shoot(0, 1);
    game.respond(None);
    assert!(game.state.players[1].hand.is_empty());
    assert_eq!(game.state.players[1].health, 2);
    game.equip(1, CardKind::Dynamite);
    game.give(0, CardKind::Beer);
    game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
    let events = begin_turn(&mut game, 1);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::Dying { needed: 2 }
    ));
    assert!(game.state.players[1].hand.is_empty());
    assert!(
        !events
            .iter()
            .any(|e| matches!(e.kind, EventKind::CardsStolen { .. }))
    );
    assert_eq!(game.state.players[0].hand.len(), 1);
}

#[test]
fn suzy_draws_after_last_card_duel_response_and_after_el_gringo_steals() {
    let mut game = Scenario::new(4);
    game.character(0, Character::SuzyLafayette);
    let duel = game.give(0, CardKind::Duel);
    let response = game.give(1, CardKind::Bang);
    let new_bang = game.top_face(CardKind::Bang, Suit::Diamonds, Rank::Two);
    game.act(
        0,
        Action::Play {
            card: duel,
            target: Some(PlayerId(1)),
        },
    );
    assert_eq!(game.state.players[0].hand, vec![new_bang]);
    game.respond(Some(response));
    game.respond(Some(new_bang));
    assert_eq!(game.state.players[0].hand.len(), 1);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(1));
    let mut game = Scenario::new(4);
    game.character(0, Character::SuzyLafayette);
    game.character(1, Character::ElGringo);
    let bang = game.give(0, CardKind::Bang);
    let beer = game.give(0, CardKind::Beer);
    game.act(
        0,
        Action::Play {
            card: bang,
            target: Some(PlayerId(1)),
        },
    );
    let events = game.respond(None);
    assert_eq!(game.state.players[1].hand, vec![beer]);
    assert_eq!(game.state.players[0].hand.len(), 1);
    let steal = events
        .iter()
        .position(|e| matches!(e.kind, EventKind::CardsStolen { .. }))
        .unwrap();
    let suzy = events
        .iter()
        .position(|e| {
            matches!(
                e.kind,
                EventKind::SkillActivated {
                    character: Character::SuzyLafayette,
                    ..
                }
            )
        })
        .unwrap();
    assert!(steal < suzy);
    let mut game = Scenario::new(4);
    game.character(1, Character::SuzyLafayette);
    let held = game.give(1, CardKind::Beer);
    game.shoot(0, 1);
    game.respond(None);
    assert_eq!(game.state.players[1].hand, vec![held]);
}

#[test]
fn sid_heals_out_of_turn_without_touching_other_frames_and_validates_atomically() {
    let mut game = Scenario::new(4);
    game.character(2, Character::SidKetchum);
    game.state.players[2].health = 2;
    let cards: Vec<_> = (0..4).map(|_| game.give(2, CardKind::Bang)).collect();
    game.shoot(0, 1);
    let pending = game.state.pending.clone();
    game.reject(
        2,
        Action::SidHeal {
            pending_id: None,
            discard: [cards[0], cards[0]],
        },
        ActionError::InvalidDiscard,
    );
    game.reject(
        2,
        Action::SidHeal {
            pending_id: Some(id(&game)),
            discard: [cards[0], cards[1]],
        },
        ActionError::StalePending,
    );
    game.reject(
        2,
        Action::SidHeal {
            pending_id: None,
            discard: [cards[0], CardId(255)],
        },
        ActionError::CardNotInHand,
    );
    for pair in cards.chunks(2) {
        game.act(
            2,
            Action::SidHeal {
                pending_id: None,
                discard: [pair[0], pair[1]],
            },
        );
        assert_eq!(game.state.pending, pending);
    }
    assert_eq!(game.state.players[2].health, 4);
    let first = game.give(2, CardKind::Bang);
    let second = game.give(2, CardKind::Bang);
    game.reject(
        2,
        Action::SidHeal {
            pending_id: None,
            discard: [first, second],
        },
        ActionError::WrongAction,
    );
    game.character(2, Character::WillyTheKid);
    game.state.players[2].health = 3;
    game.reject(
        2,
        Action::SidHeal {
            pending_id: None,
            discard: [first, second],
        },
        ActionError::WrongAction,
    );
}

#[test]
fn sid_can_save_himself_repeatedly_in_dying_and_rejects_old_packets() {
    let mut game = Scenario::new(4);
    let cards: Vec<_> = (0..6).map(|_| game.give(1, CardKind::Bang)).collect();
    game.state.players[1].health = 1;
    game.equip(1, CardKind::Dynamite);
    game.equip(1, CardKind::Jail);
    game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
    begin_turn(&mut game, 1);
    for pair in cards.chunks(2) {
        let pending_id = id(&game);
        game.reject(
            1,
            Action::SidHeal {
                pending_id: None,
                discard: [pair[0], pair[1]],
            },
            ActionError::StalePending,
        );
        game.act(
            1,
            Action::SidHeal {
                pending_id: Some(pending_id),
                discard: [pair[0], pair[1]],
            },
        );
        if game.state.players[1].health <= 0 {
            game.reject(
                1,
                Action::SidHeal {
                    pending_id: Some(pending_id),
                    discard: [cards[4], cards[5]],
                },
                ActionError::StalePending,
            );
        }
    }
    assert_eq!(game.state.players[1].health, 1);
    assert!(game.state.players[1].alive);
    assert!(!game.state.players[1].has_in_play(CardKind::Jail));
}

#[test]
fn vulture_inherits_after_sheriff_penalty_and_after_outlaw_bounty() {
    let mut game = Scenario::new(5);
    game.character(0, Character::VultureSam);
    game.state.players[1].role = Role::Deputy;
    let inherited = game.give(1, CardKind::Beer);
    let inherited_gun = game.equip(1, CardKind::Schofield);
    let penalized = game.give(0, CardKind::Missed);
    game.equip(0, CardKind::Scope);
    game.state.players[1].health = 1;
    game.shoot(0, 1);
    game.respond(None);
    let events = game.respond(None);
    assert_eq!(game.state.players[0].hand, vec![inherited, inherited_gun]);
    assert!(game.state.players[0].in_play.is_empty());
    assert!(game.state.discard_pile.contains(&penalized));
    let penalty = events
        .iter()
        .position(|e| matches!(e.kind, EventKind::SheriffPenalized { .. }))
        .unwrap();
    let loot = events
        .iter()
        .position(|e| matches!(e.kind, EventKind::CardsInherited { .. }))
        .unwrap();
    assert!(penalty < loot);
    assert!(private_cards(&events, None).is_empty());
    let mut game = Scenario::new(4);
    game.character(2, Character::VultureSam);
    let corpse = game.give(1, CardKind::Beer);
    game.state.players[1].health = 1;
    game.shoot(0, 1);
    game.respond(None);
    let events = game.respond(None);
    assert_eq!(game.state.players[0].hand.len(), 3);
    assert_eq!(game.state.players[2].hand, vec![corpse]);
    assert!(
        events
            .iter()
            .position(|e| matches!(e.kind, EventKind::BountyAwarded { .. }))
            .unwrap()
            < events
                .iter()
                .position(|e| matches!(e.kind, EventKind::CardsInherited { .. }))
                .unwrap()
    );
    assert!(private_cards(&events, Some(PlayerId(3))).is_empty());
}

#[test]
fn outlaw_duel_initiator_dying_has_no_bounty_but_other_victim_still_rewards_killer() {
    for initiator_dies in [false, true] {
        let mut game = Scenario::new(4);
        game.state.turn.player = PlayerId(1);
        game.state.players[1].health = 1;
        game.state.players[2].health = 1;
        let duel = game.give(1, CardKind::Duel);
        let bang = game.give(2, CardKind::Bang);
        game.act(
            1,
            Action::Play {
                card: duel,
                target: Some(PlayerId(2)),
            },
        );
        if initiator_dies {
            game.respond(Some(bang));
        }
        game.respond(None);
        let victim = if initiator_dies { 1 } else { 2 };
        assert!(matches!(
            game.state.pending.last().unwrap().kind,
            PendingKind::Dying {
                duel_initiator: Some(PlayerId(1)),
                ..
            }
        ));
        let events = game.respond(None);
        assert!(!game.state.players[victim].alive);
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(e.kind, EventKind::BountyAwarded { .. }))
                .count(),
            usize::from(!initiator_dies)
        );
    }
}

#[test]
fn private_pools_are_noninterfering_and_cleared_without_revealing_unused_cards_on_victory() {
    for lucky in [false, true] {
        let mut game = Scenario::new(4);
        if lucky {
            game.character(1, Character::LuckyDuke);
            game.equip(1, CardKind::Barrel);
            game.shoot(0, 1);
        } else {
            game.character(1, Character::KitCarlson);
            begin_turn(&mut game, 1);
        }
        let before = game.state.clone();
        let pool = game.state.pending.last().unwrap().cards().to_vec();
        let mut alternate = before;
        match &mut alternate.pending.last_mut().unwrap().kind {
            PendingKind::KeepCards { pool, .. } | PendingKind::ChooseDrawResult { pool, .. } => {
                pool.reverse()
            }
            _ => unreachable!(),
        }
        assert_eq!(spectator_view(&game.state), spectator_view(&alternate));
        assert_eq!(
            view(&game.state, PlayerId(2)),
            view(&alternate, PlayerId(2))
        );
        game.dying_child(0, Some(PlayerId(2)));
        let events = game.respond(None);
        assert_eq!(game.state.winner, Some(Winner::Outlaws));
        assert!(game.state.pending.is_empty());
        assert!(pool.iter().all(|c| game.state.discard_pile.contains(c)));
        assert!(events.iter().any(
            |e| matches!(e.kind, EventKind::PrivatePoolDiscarded { count } if count == pool.len())
        ));
        assert!(private_cards(&events, None).is_empty());
        assert_eq!(spectator_view(&game.state).discard_top, None);
        invariant(&game.state);
    }
}

#[test]
fn deputy_starting_a_duel_still_penalizes_the_sheriff_who_kills_them() {
    let mut game = Scenario::new(5);
    game.state.players[1].role = Role::Deputy;
    game.state.players[1].health = 1;
    game.state.turn.player = PlayerId(1);
    let duel = game.give(1, CardKind::Duel);
    let bang = game.give(0, CardKind::Bang);
    let penalty = game.give(0, CardKind::Beer);
    game.act(
        1,
        Action::Play {
            card: duel,
            target: Some(PlayerId(0)),
        },
    );
    game.respond(Some(bang));
    game.respond(None);
    let events = game.respond(None);
    assert!(
        events
            .iter()
            .any(|e| matches!(e.kind, EventKind::SheriffPenalized { .. }))
    );
    assert!(game.state.discard_pile.contains(&penalty));
    assert!(game.state.players[0].hand.is_empty());
}

#[test]
fn el_gringo_hidden_card_identity_does_not_change_uninvolved_views_or_events() {
    let mut game = Scenario::new(4);
    game.character(1, Character::ElGringo);
    game.give(0, CardKind::Beer);
    game.give(0, CardKind::Missed);
    game.shoot(0, 1);
    let mut alternate = game.state.clone();
    alternate.players[0].hand.reverse();
    let mut rng = game.rng.clone();
    let action = Action::Respond {
        pending_id: id(&game),
        card: None,
    };
    let events = game.act(1, action.clone());
    let other_events = apply(&mut alternate, PlayerId(1), action, &mut rng).unwrap();
    assert_ne!(game.state.players[1].hand, alternate.players[1].hand);
    for recipient in [None, Some(PlayerId(2)), Some(PlayerId(3))] {
        assert_eq!(
            filter_events(&events, recipient),
            filter_events(&other_events, recipient)
        );
    }
    assert_eq!(spectator_view(&game.state), spectator_view(&alternate));
    assert_eq!(
        view(&game.state, PlayerId(2)),
        view(&alternate, PlayerId(2))
    );
    invariant(&alternate);
}

#[test]
fn pedro_removing_public_top_does_not_expose_a_buried_lucky_card() {
    let mut game = Scenario::new(4);
    game.character(1, Character::LuckyDuke);
    game.character(2, Character::PedroRamirez);
    game.equip(1, CardKind::Barrel);
    let unchosen = game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
    let chosen = game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
    game.shoot(0, 1);
    let pending_id = id(&game);
    game.act(
        1,
        Action::ChooseDrawResult {
            pending_id,
            card: chosen,
        },
    );
    assert_eq!(spectator_view(&game.state).discard_top, Some(chosen));
    begin_turn(&mut game, 2);
    let pending_id = id(&game);
    game.act(
        2,
        Action::ChooseDrawSource {
            pending_id,
            source: DrawSource::Discard,
        },
    );
    assert_eq!(game.state.discard_pile.last(), Some(&unchosen));
    assert_eq!(spectator_view(&game.state).discard_top, None);
    invariant(&game.state);
}

#[test]
fn suzy_can_draw_a_second_missed_between_slabs_responses() {
    let mut game = Scenario::new(4);
    game.character(0, Character::SlabTheKiller);
    game.character(1, Character::SuzyLafayette);
    let first = game.give(1, CardKind::Missed);
    let second = game.top_face(CardKind::Missed, Suit::Spades, Rank::Three);
    game.shoot(0, 1);
    let old_id = id(&game);
    game.respond(Some(first));
    assert_eq!(game.state.players[1].hand, vec![second]);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse { remaining: 1, .. }
    ));
    game.reject(
        1,
        Action::Respond {
            pending_id: old_id,
            card: Some(second),
        },
        ActionError::StalePending,
    );
    game.respond(Some(second));
    assert_eq!(game.state.players[1].health, 4);
    assert_eq!(game.state.players[1].hand.len(), 1);
    assert!(game.state.pending.is_empty());
}

#[test]
fn sid_out_of_turn_preserves_each_kind_of_waiting_frame() {
    for kind in 0..6 {
        let mut game = Scenario::new(4);
        game.state.players[2].health = 3;
        let first = game.give(2, CardKind::Bang);
        let second = game.give(2, CardKind::Beer);
        match kind {
            0 => game.dying_child(1, Some(PlayerId(0))),
            1 => {
                let card = game.give(0, CardKind::Duel);
                game.act(
                    0,
                    Action::Play {
                        card,
                        target: Some(PlayerId(1)),
                    },
                );
            }
            2 => {
                game.character(1, Character::KitCarlson);
                begin_turn(&mut game, 1);
            }
            3 => {
                game.character(1, Character::JesseJones);
                begin_turn(&mut game, 1);
            }
            4 => {
                game.character(1, Character::LuckyDuke);
                game.equip(1, CardKind::Barrel);
                game.shoot(0, 1);
            }
            5 => {
                let card = game.give(0, CardKind::GeneralStore);
                game.act(0, Action::Play { card, target: None });
            }
            _ => unreachable!(),
        }
        let pending = game.state.pending.clone();
        let decision = game.state.decision();
        game.act(
            2,
            Action::SidHeal {
                pending_id: None,
                discard: [second, first],
            },
        );
        assert_eq!(game.state.pending, pending);
        assert_eq!(game.state.decision(), decision);
        assert_eq!(game.state.players[2].health, 4);
    }
}

#[test]
fn a_dead_private_picker_is_skipped_and_the_pool_is_returned_without_a_leak() {
    for character in [
        Character::KitCarlson,
        Character::LuckyDuke,
        Character::PedroRamirez,
    ] {
        let mut game = Scenario::new(4);
        game.character(1, character);
        if character == Character::LuckyDuke {
            game.equip(1, CardKind::Barrel);
            game.shoot(0, 1);
        } else {
            begin_turn(&mut game, 1);
        }
        let pool = game.state.pending.last().unwrap().cards().to_vec();
        game.dying_child(1, None);
        let events = game.respond(None);
        assert!(!game.state.players[1].alive);
        assert!(game.state.pending.is_empty());
        assert!(game.state.winner.is_none());
        assert!(
            pool.iter()
                .all(|card| game.state.discard_pile.contains(card))
        );
        assert!(private_cards(&events, None).is_empty());
        assert!(
            game.state
                .decision()
                .is_some_and(|d| d.player != PlayerId(1))
        );
        invariant(&game.state);
    }
}

#[test]
fn lucky_dynamite_snapshot_can_resume_into_dying_and_keep_the_next_turn_step() {
    let mut game = Scenario::new(4);
    game.character(1, Character::LuckyDuke);
    game.state.players[1].health = 1;
    game.equip(1, CardKind::Dynamite);
    game.equip(1, CardKind::Jail);
    game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
    game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
    begin_turn(&mut game, 1);
    resumed(&mut game);
    assert_eq!(game.state.turn.step, TurnStep::Jail);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::Dying { needed: 3 }
    ));
    assert!(game.state.players[1].has_in_play(CardKind::Jail));
    assert!(!game.state.players[1].has_in_play(CardKind::Dynamite));
}

#[test]
fn every_character_rejects_bad_cards_and_out_of_turn_play_without_mutating_rng() {
    for character in Character::ALL {
        let mut game = Scenario::new(4);
        game.character(0, character);
        game.reject(
            0,
            Action::Play {
                card: CardId(255),
                target: None,
            },
            ActionError::CardNotInHand,
        );
        let card = game.give(1, CardKind::Beer);
        game.reject(
            1,
            Action::Play { card, target: None },
            ActionError::NotYourDecision,
        );
        let card = game.give(0, CardKind::Beer);
        game.reject(
            0,
            Action::Play {
                card,
                target: Some(PlayerId(99)),
            },
            ActionError::InvalidTarget,
        );
    }
}

#[test]
fn el_gringo_losing_his_own_duel_does_not_steal_even_when_the_beer_would_save_him() {
    for health in [3, 1] {
        let mut game = Scenario::new(4);
        game.character(1, Character::ElGringo);
        game.state.players[1].health = health;
        game.state.turn.player = PlayerId(1);
        let duel = game.give(1, CardKind::Duel);
        let bang = game.give(2, CardKind::Bang);
        let beer = game.give(2, CardKind::Beer);
        game.act(
            1,
            Action::Play {
                card: duel,
                target: Some(PlayerId(2)),
            },
        );
        game.respond(Some(bang));
        let rng_before_damage = game.rng.get_word_pos();
        let events = game.respond(None);
        assert_eq!(game.state.players[2].hand, vec![beer]);
        assert!(game.state.players[1].hand.is_empty());
        assert_eq!(game.rng.get_word_pos(), rng_before_damage);
        assert!(events.iter().any(|e| matches!(
            e.kind,
            EventKind::HealthChanged {
                player: PlayerId(1),
                source: Some(PlayerId(2)),
                delta: -1,
                ..
            }
        )));
        assert!(!events.iter().any(|e| matches!(
            e.kind,
            EventKind::CardsStolen { .. }
                | EventKind::SkillActivated {
                    character: Character::ElGringo,
                    ..
                }
        )));
        if health == 1 {
            assert!(matches!(
                game.state.decision().unwrap().kind,
                DecisionKind::Dying { needed: 1 }
            ));
            game.reject(
                1,
                Action::Respond {
                    pending_id: id(&game),
                    card: Some(beer),
                },
                ActionError::CardNotInHand,
            );
            let events = game.respond(None);
            assert!(!game.state.players[1].alive);
            assert!(
                !events
                    .iter()
                    .any(|e| matches!(e.kind, EventKind::BountyAwarded { .. }))
            );
        } else {
            assert_eq!(game.state.players[1].health, health - 1);
            assert!(game.state.pending.is_empty());
        }
    }
}

#[test]
fn el_gringo_losing_an_opponents_duel_steals_before_dying_and_can_use_that_beer() {
    for health in [3, 1] {
        let mut game = Scenario::new(4);
        game.character(1, Character::ElGringo);
        game.state.players[1].health = health;
        let duel = game.give(0, CardKind::Duel);
        let beer = game.give(0, CardKind::Beer);
        game.act(
            0,
            Action::Play {
                card: duel,
                target: Some(PlayerId(1)),
            },
        );
        let events = game.respond(None);
        assert!(game.state.players[0].hand.is_empty());
        assert_eq!(game.state.players[1].hand, vec![beer]);
        assert!(events.iter().any(|e| matches!(
            e.kind,
            EventKind::HealthChanged {
                player: PlayerId(1),
                source: Some(PlayerId(0)),
                delta: -1,
                ..
            }
        )));
        assert!(events.iter().any(|e| matches!(
            e.kind,
            EventKind::CardsStolen {
                source: PlayerId(1),
                target: PlayerId(0),
                count: 1
            }
        )));
        if health == 1 {
            assert!(matches!(
                game.state.decision().unwrap().kind,
                DecisionKind::Dying { needed: 1 }
            ));
            game.respond(Some(beer));
            assert_eq!(game.state.players[1].health, 1);
            assert!(game.state.players[1].alive);
        }
        assert!(game.state.pending.is_empty());
    }
}
