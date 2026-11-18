use super::support::{Scenario, invariant};
use bang::*;

fn play(
    game: &mut Scenario,
    player: usize,
    kind: CardKind,
    target: Option<usize>,
) -> (CardId, Vec<Event>) {
    let card = game.give(player, kind);
    let events = game.act(
        player,
        Action::Play {
            card,
            target: target.map(PlayerId),
        },
    );
    (card, events)
}

fn affect(
    game: &mut Scenario,
    kind: CardKind,
    target: usize,
    selection: CardSelection,
) -> Vec<Event> {
    let card = game.give(0, kind);
    game.act(
        0,
        Action::AffectCard {
            card,
            target: PlayerId(target),
            selection,
        },
    )
}

fn revealed(events: &[Event]) -> Vec<CardKind> {
    events
        .iter()
        .filter_map(|event| {
            if let EventKind::DrawRevealed { reason, .. } = event.kind {
                Some(reason)
            } else {
                None
            }
        })
        .collect()
}

fn roundtrip_step(game: &mut Scenario) -> Vec<Event> {
    let mut restored: GameState =
        serde_json::from_str(&serde_json::to_string(&game.state).unwrap()).unwrap();
    let mut rng = game.rng.clone();
    let (player, action) = default_action(&game.state).unwrap();
    let action_copy = serde_json::from_str(&serde_json::to_string(&action).unwrap()).unwrap();
    let actual = apply(&mut restored, player, action_copy, &mut rng).unwrap();
    let expected = game.act(player.0, action);
    assert_eq!(restored, game.state);
    assert_eq!(actual, expected);
    assert_eq!(rng.get_word_pos(), game.rng.get_word_pos());
    invariant(&restored);
    assert_eq!(
        serde_json::from_str::<Vec<Event>>(&serde_json::to_string(&actual).unwrap()).unwrap(),
        actual
    );
    expected
}

#[test]
fn stagecoach_and_wells_fargo_draw_exactly_two_and_three() {
    for (kind, count) in [(CardKind::Stagecoach, 2), (CardKind::WellsFargo, 3)] {
        let mut game = Scenario::new(4);
        let card = game.give(0, kind);
        game.reject(
            0,
            Action::Play {
                card,
                target: Some(PlayerId(1)),
            },
            ActionError::InvalidTarget,
        );
        let events = game.act(0, Action::Play { card, target: None });
        assert_eq!(game.state.players[0].hand.len(), count);
        assert_eq!(game.state.discard_pile.last(), Some(&card));
        assert!(events.iter().any(|event| matches!(event.kind, EventKind::CardsDrawn { player: PlayerId(0), count: actual } if actual == count)));
        assert!(
            filter_events(&events, None)
                .iter()
                .all(|event| !matches!(event.kind, EventKind::CardsReceived { .. }))
        );
    }
}

#[test]
fn saloon_heals_all_living_even_with_two_survivors_but_cannot_save_out_of_turn() {
    let mut game = Scenario::new(4);
    game.dead(2);
    game.dead(3);
    game.state.players[0].health = 4;
    game.state.players[1].health = 2;
    play(&mut game, 0, CardKind::Saloon, None);
    assert_eq!(game.state.players[0].health, 5);
    assert_eq!(game.state.players[1].health, 3);
    assert_eq!(game.state.players[2].health, 0);
    let mut game = Scenario::new(4);
    game.state.players[1].health = 1;
    let saloon = game.give(1, CardKind::Saloon);
    game.shoot(0, 1);
    game.respond(None);
    let id = game.state.pending.last().unwrap().id;
    game.reject(
        1,
        Action::Respond {
            pending_id: id,
            card: Some(saloon),
        },
        ActionError::WrongAction,
    );
    game.reject(
        1,
        Action::Play {
            card: saloon,
            target: None,
        },
        ActionError::WrongAction,
    );
}

#[test]
fn panic_and_cat_balou_support_selected_equipment_and_self_targets() {
    for kind in [CardKind::Panic, CardKind::CatBalou] {
        let mut game = Scenario::new(4);
        let gear = game.equip(1, CardKind::Schofield);
        affect(&mut game, kind, 1, CardSelection::InPlay(gear));
        assert!(!game.state.players[1].in_play.contains(&gear));
        if kind == CardKind::Panic {
            assert!(game.state.players[0].hand.contains(&gear));
        } else {
            assert_eq!(game.state.discard_pile.last(), Some(&gear));
        }
        let own = game.equip(0, CardKind::Barrel);
        affect(&mut game, kind, 0, CardSelection::InPlay(own));
        assert!(!game.state.players[0].in_play.contains(&own));
        if kind == CardKind::Panic {
            assert!(game.state.players[0].hand.contains(&own));
        } else {
            assert!(game.state.discard_pile.contains(&own));
        }
        let mut game = Scenario::new(4);
        let only = game.give(0, kind);
        game.reject(
            0,
            Action::AffectCard {
                card: only,
                target: PlayerId(0),
                selection: CardSelection::Hand,
            },
            ActionError::InvalidTarget,
        );
        game.reject(
            0,
            Action::AffectCard {
                card: only,
                target: PlayerId(1),
                selection: CardSelection::Hand,
            },
            ActionError::InvalidTarget,
        );
        game.reject(
            0,
            Action::AffectCard {
                card: only,
                target: PlayerId(1),
                selection: CardSelection::InPlay(CardId(255)),
            },
            ActionError::InvalidTarget,
        );
        game.reject(
            0,
            Action::AffectCard {
                card: only,
                target: PlayerId(99),
                selection: CardSelection::Hand,
            },
            ActionError::InvalidTarget,
        );
        let retained = game.give(0, CardKind::Beer);
        game.reject(
            0,
            Action::AffectCard {
                card: retained,
                target: PlayerId(0),
                selection: CardSelection::Hand,
            },
            ActionError::WrongAction,
        );
        game.act(
            0,
            Action::AffectCard {
                card: only,
                target: PlayerId(0),
                selection: CardSelection::Hand,
            },
        );
        if kind == CardKind::Panic {
            assert_eq!(game.state.players[0].hand, vec![retained]);
        } else {
            assert!(game.state.players[0].hand.is_empty());
        }
    }
}

#[test]
fn panic_range_uses_scope_and_mustang_but_never_weapon_range() {
    let mut game = Scenario::new(6);
    game.equip(0, CardKind::Winchester);
    game.give(3, CardKind::Beer);
    let panic = game.give(0, CardKind::Panic);
    game.reject(
        0,
        Action::AffectCard {
            card: panic,
            target: PlayerId(3),
            selection: CardSelection::Hand,
        },
        ActionError::OutOfRange,
    );
    game.equip(1, CardKind::Mustang);
    game.give(1, CardKind::Beer);
    game.reject(
        0,
        Action::AffectCard {
            card: panic,
            target: PlayerId(1),
            selection: CardSelection::Hand,
        },
        ActionError::OutOfRange,
    );
    game.equip(0, CardKind::Scope);
    assert_eq!(
        effective_distance(&game.state, PlayerId(0), PlayerId(1)),
        Ok(1)
    );
    game.act(
        0,
        Action::AffectCard {
            card: panic,
            target: PlayerId(1),
            selection: CardSelection::Hand,
        },
    );
    affect(&mut game, CardKind::CatBalou, 3, CardSelection::Hand);
    assert!(game.state.players[3].hand.is_empty());
}

#[test]
fn random_hand_selection_hides_identity_from_uninvolved_players_and_discard_top() {
    for kind in [CardKind::Panic, CardKind::CatBalou] {
        let mut game = Scenario::new(4);
        let card = game.give(0, kind);
        let public_cover = game.give(0, CardKind::Beer);
        game.give(1, CardKind::Bang);
        game.give(1, CardKind::Missed);
        let mut other = game.state.clone();
        for index in 0..2 {
            let draw_index = other.draw_pile.len() - 1 - index;
            std::mem::swap(
                &mut other.players[1].hand[index],
                &mut other.draw_pile[draw_index],
            );
        }
        let mut rng = game.rng.clone();
        let action = Action::AffectCard {
            card,
            target: PlayerId(1),
            selection: CardSelection::Hand,
        };
        let copied_action = serde_json::from_str(&serde_json::to_string(&action).unwrap()).unwrap();
        let expected = game.act(0, action);
        let actual = apply(&mut other, PlayerId(0), copied_action, &mut rng).unwrap();
        invariant(&other);
        assert_eq!(filter_events(&actual, None), filter_events(&expected, None));
        assert_eq!(
            filter_events(&actual, Some(PlayerId(2))),
            filter_events(&expected, Some(PlayerId(2)))
        );
        assert_ne!(
            filter_events(&actual, Some(PlayerId(0))),
            filter_events(&expected, Some(PlayerId(0)))
        );
        assert_ne!(
            filter_events(&actual, Some(PlayerId(1))),
            filter_events(&expected, Some(PlayerId(1)))
        );
        assert_eq!(spectator_view(&other), spectator_view(&game.state));
        assert_eq!(view(&other, PlayerId(2)), view(&game.state, PlayerId(2)));
        assert!(
            filter_events(&actual, None)
                .iter()
                .all(|event| !matches!(event.kind, EventKind::HandCardAffected { .. }))
        );
        if kind == CardKind::CatBalou {
            assert_eq!(spectator_view(&other).discard_top, None);
        } else {
            assert_eq!(spectator_view(&other).discard_top, Some(card));
        }
        game.act(
            0,
            Action::Play {
                card: public_cover,
                target: None,
            },
        );
        apply(
            &mut other,
            PlayerId(0),
            Action::Play {
                card: public_cover,
                target: None,
            },
            &mut rng,
        )
        .unwrap();
        assert_eq!(spectator_view(&other).discard_top, Some(public_cover));
        assert_eq!(spectator_view(&other), spectator_view(&game.state));
    }
}

#[test]
fn duplicate_equipment_is_rejected_and_new_weapons_replace_the_old_one() {
    for kind in [
        CardKind::Barrel,
        CardKind::Mustang,
        CardKind::Schofield,
        CardKind::Volcanic,
    ] {
        let mut game = Scenario::new(4);
        let (first, _) = play(&mut game, 0, kind, None);
        let duplicate = game.give(0, kind);
        game.reject(
            0,
            Action::Play {
                card: duplicate,
                target: None,
            },
            ActionError::DuplicateInPlay,
        );
        assert_eq!(game.state.players[0].in_play, vec![first]);
    }
    let mut game = Scenario::new(4);
    let (old, _) = play(&mut game, 0, CardKind::Schofield, None);
    let (new, _) = play(&mut game, 0, CardKind::Winchester, None);
    assert_eq!(game.state.players[0].in_play, vec![new]);
    assert!(game.state.discard_pile.contains(&old));
    assert_eq!(spectator_view(&game.state).players[0].weapon_range, 5);
    let scope = game.give(0, CardKind::Scope);
    game.reject(
        0,
        Action::Play {
            card: scope,
            target: Some(PlayerId(1)),
        },
        ActionError::InvalidTarget,
    );
    game.act(
        0,
        Action::Play {
            card: scope,
            target: None,
        },
    );
    assert!(game.state.players[0].has_in_play(CardKind::Scope));
}

#[test]
fn every_weapon_range_is_used_and_distance_is_independent() {
    for (weapon, range) in [
        (CardKind::Volcanic, 1),
        (CardKind::Schofield, 2),
        (CardKind::Remington, 3),
        (CardKind::RevCarabine, 4),
        (CardKind::Winchester, 5),
    ] {
        let mut game = Scenario::new(7);
        play(&mut game, 0, weapon, None);
        game.equip(3, CardKind::Mustang);
        assert_eq!(game.state.players[0].weapon_range(), range);
        assert_eq!(
            effective_distance(&game.state, PlayerId(0), PlayerId(3)),
            Ok(4)
        );
        let bang = game.give(0, CardKind::Bang);
        if range < 4 {
            game.reject(
                0,
                Action::Play {
                    card: bang,
                    target: Some(PlayerId(3)),
                },
                ActionError::OutOfRange,
            );
        } else {
            game.act(
                0,
                Action::Play {
                    card: bang,
                    target: Some(PlayerId(3)),
                },
            );
            game.respond(None);
        }
        assert_eq!(spectator_view(&game.state).players[0].weapon_range, range);
    }
    let mut game = Scenario::new(4);
    game.equip(1, CardKind::Mustang);
    let bang = game.give(0, CardKind::Bang);
    game.reject(
        0,
        Action::Play {
            card: bang,
            target: Some(PlayerId(1)),
        },
        ActionError::OutOfRange,
    );
    play(&mut game, 0, CardKind::Scope, None);
    game.act(
        0,
        Action::Play {
            card: bang,
            target: Some(PlayerId(1)),
        },
    );
    game.respond(None);
}

#[test]
fn volcanic_allows_multiple_bangs_and_replacing_it_restores_the_limit() {
    let mut game = Scenario::new(4);
    play(&mut game, 0, CardKind::Volcanic, None);
    game.state.turn.bangs_played = 255;
    game.shoot(0, 1);
    game.respond(None);
    game.shoot(0, 1);
    game.respond(None);
    assert_eq!(game.state.turn.bangs_played, 257);
    play(&mut game, 0, CardKind::Schofield, None);
    let bang = game.give(0, CardKind::Bang);
    game.reject(
        0,
        Action::Play {
            card: bang,
            target: Some(PlayerId(1)),
        },
        ActionError::BangLimit,
    );
}

#[test]
fn barrel_automatically_reveals_a_card_before_asking_for_missed() {
    let mut game = Scenario::new(4);
    game.equip(1, CardKind::Barrel);
    game.state.players[1].health = 2;
    let check = game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
    let (_, events) = play(&mut game, 0, CardKind::Bang, Some(1));
    assert!(game.state.pending.is_empty());
    assert_eq!(game.state.players[1].health, 2);
    assert!(game.state.discard_pile.contains(&check));
    assert_eq!(revealed(&events), vec![CardKind::Barrel]);
    assert!(
        filter_events(&events, None).iter().any(
            |event| matches!(event.kind, EventKind::DrawRevealed { card, .. } if card == check)
        )
    );
    let mut game = Scenario::new(4);
    game.equip(1, CardKind::Barrel);
    let bang = game.give(0, CardKind::Bang);
    let missed = game.give(1, CardKind::Missed);
    game.top_face(CardKind::Missed, Suit::Spades, Rank::Three);
    game.act(
        0,
        Action::Play {
            card: bang,
            target: Some(PlayerId(1)),
        },
    );
    assert_eq!(
        game.state.pending.last().unwrap().player(),
        Some(PlayerId(1))
    );
    game.respond(Some(missed));
    assert!(game.state.pending.is_empty());
    assert_eq!(game.state.players[1].health, 4);
}

#[test]
fn barrel_works_for_gatling_but_not_indians_or_duel() {
    let mut game = Scenario::new(4);
    game.equip(1, CardKind::Barrel);
    game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
    let (_, events) = play(&mut game, 0, CardKind::Gatling, None);
    assert_eq!(revealed(&events), vec![CardKind::Barrel]);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(2));
    assert_eq!(game.state.players[1].health, 4);
    while !game.state.pending.is_empty() {
        game.respond(None);
    }
    assert_eq!(game.state.turn.bangs_played, 0);
    game.shoot(0, 1);
    assert_eq!(game.state.turn.bangs_played, 1);
    for kind in [CardKind::Indians, CardKind::Duel] {
        let mut game = Scenario::new(4);
        game.equip(1, CardKind::Barrel);
        let check = game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
        let (_, events) = play(&mut game, 0, kind, (kind == CardKind::Duel).then_some(1));
        assert!(revealed(&events).is_empty());
        assert_eq!(game.state.draw_pile.last(), Some(&check));
        assert_eq!(game.state.decision().unwrap().player, PlayerId(1));
    }
}

#[test]
fn duel_alternates_bangs_without_consuming_turn_limit_and_rejects_stale_ids() {
    let mut game = Scenario::new(4);
    let first = game.give(1, CardKind::Bang);
    let second = game.give(0, CardKind::Bang);
    let third = game.give(1, CardKind::Bang);
    let missed = game.give(1, CardKind::Missed);
    play(&mut game, 0, CardKind::Duel, Some(1));
    let id = game.state.pending.last().unwrap().id;
    game.reject(
        1,
        Action::Respond {
            pending_id: id,
            card: Some(missed),
        },
        ActionError::WrongAction,
    );
    game.respond(Some(first));
    let old_for_source = game.state.pending.last().unwrap().id;
    assert_eq!(game.state.decision().unwrap().player, PlayerId(0));
    game.respond(Some(second));
    game.respond(Some(third));
    game.reject(
        0,
        Action::Respond {
            pending_id: old_for_source,
            card: None,
        },
        ActionError::StalePending,
    );
    game.respond(None);
    assert_eq!(game.state.players[0].health, 4);
    assert_eq!(game.state.turn.player, PlayerId(0));
    assert_eq!(game.state.turn.bangs_played, 0);
    game.shoot(0, 1);
}

#[test]
fn duel_rewards_the_other_duelist_for_eliminating_an_outlaw() {
    let mut game = Scenario::new(4);
    game.state.players[1].health = 1;
    play(&mut game, 0, CardKind::Duel, Some(1));
    game.respond(None);
    let events = game.respond(None);
    assert_eq!(game.state.players[0].hand.len(), 3);
    assert!(events.iter().any(|event| matches!(
        event.kind,
        EventKind::BountyAwarded {
            player: PlayerId(0),
            victim: PlayerId(1)
        }
    )));
    let duel = game.give(0, CardKind::Duel);
    game.reject(
        0,
        Action::Play {
            card: duel,
            target: Some(PlayerId(0)),
        },
        ActionError::InvalidTarget,
    );
}

#[test]
fn duel_can_kill_the_turn_owner_and_resume_at_the_next_living_seat() {
    let mut game = Scenario::new(4);
    game.state.players[0].role = Role::Deputy;
    game.state.players[0].max_health = 4;
    game.state.players[0].health = 1;
    game.state.players[2].role = Role::Sheriff;
    game.state.players[2].max_health = 5;
    let bang = game.give(1, CardKind::Bang);
    play(&mut game, 0, CardKind::Duel, Some(1));
    game.respond(Some(bang));
    game.respond(None);
    game.respond(None);
    assert!(!game.state.players[0].alive);
    assert_eq!(game.state.turn.player, PlayerId(1));
    assert_eq!(game.state.players[1].hand.len(), 2);
}

#[test]
fn indians_resolve_clockwise_with_bang_responses_and_do_not_count_as_bang() {
    let mut game = Scenario::new(5);
    game.state.turn.player = PlayerId(3);
    let bang = game.give(4, CardKind::Bang);
    let missed = game.give(4, CardKind::Missed);
    play(&mut game, 3, CardKind::Indians, None);
    assert!(matches!(
        game.state.pending[0].kind,
        PendingKind::ResolveTargets {
            kind: AttackKind::Indians,
            ..
        }
    ));
    let id = game.state.pending.last().unwrap().id;
    game.reject(
        4,
        Action::Respond {
            pending_id: id,
            card: Some(missed),
        },
        ActionError::WrongAction,
    );
    game.respond(Some(bang));
    let mut order = vec![4];
    while !game.state.pending.is_empty() {
        order.push(game.state.decision().unwrap().player.0);
        game.respond(None);
    }
    assert_eq!(order, vec![4, 0, 1, 2]);
    assert_eq!(game.state.players[4].health, 4);
    assert_eq!(game.state.turn.bangs_played, 0);
    game.shoot(3, 4);
}

#[test]
fn gatling_keeps_a_bang_limit_and_skips_eliminated_future_targets() {
    let mut game = Scenario::new(4);
    game.shoot(0, 1);
    game.respond(None);
    play(&mut game, 0, CardKind::Gatling, None);
    assert_eq!(game.state.turn.bangs_played, 1);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(1));
    game.dead(2);
    game.respond(None);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(3));
    game.respond(None);
    assert!(game.state.pending.is_empty());
}

#[test]
fn gatling_stops_immediately_after_sheriff_elimination() {
    let mut game = Scenario::new(4);
    game.state.players[0].role = Role::Outlaw;
    game.state.players[0].max_health = 4;
    game.state.players[0].health = 4;
    game.state.players[2].role = Role::Sheriff;
    game.state.players[2].max_health = 5;
    game.state.players[2].health = 1;
    game.state.turn.player = PlayerId(1);
    play(&mut game, 1, CardKind::Gatling, None);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(2));
    game.respond(None);
    game.respond(None);
    assert_eq!(game.state.winner, Some(Winner::Outlaws));
    assert_eq!(game.state.players[0].health, 4);
    assert_eq!(game.state.players[3].health, 4);
    assert!(game.state.pending.is_empty());
}

#[test]
fn general_store_owns_public_cards_and_each_player_chooses_once_in_order() {
    let mut game = Scenario::new(4);
    play(&mut game, 0, CardKind::GeneralStore, None);
    let pool = spectator_view(&game.state).store_pool;
    assert_eq!(pool.len(), 4);
    assert_eq!(
        view(&game.state, PlayerId(2)).unwrap().table.store_pool,
        pool
    );
    let old_id = game.state.pending.last().unwrap().id;
    game.reject(
        1,
        Action::ChooseCard {
            pending_id: old_id,
            card: pool[0],
        },
        ActionError::NotYourDecision,
    );
    game.reject(
        0,
        Action::ChooseCard {
            pending_id: PendingId(old_id.0 + 1),
            card: pool[0],
        },
        ActionError::StalePending,
    );
    game.reject(
        0,
        Action::ChooseCard {
            pending_id: old_id,
            card: CardId(255),
        },
        ActionError::InvalidCard,
    );
    game.reject(
        0,
        Action::Respond {
            pending_id: old_id,
            card: None,
        },
        ActionError::WrongAction,
    );
    assert_eq!(
        default_action(&game.state),
        Some((
            PlayerId(0),
            Action::ChooseCard {
                pending_id: old_id,
                card: pool[0]
            }
        ))
    );
    game.act(
        0,
        Action::ChooseCard {
            pending_id: old_id,
            card: pool[3],
        },
    );
    assert_eq!(game.state.players[0].hand, vec![pool[3]]);
    let next_id = game.state.pending.last().unwrap().id;
    game.reject(
        1,
        Action::ChooseCard {
            pending_id: old_id,
            card: pool[0],
        },
        ActionError::StalePending,
    );
    game.reject(
        1,
        Action::ChooseCard {
            pending_id: next_id,
            card: pool[3],
        },
        ActionError::InvalidCard,
    );
    for index in 1..4 {
        assert_eq!(game.state.decision().unwrap().player, PlayerId(index));
        game.end();
    }
    assert!(game.state.pending.is_empty());
    assert!(spectator_view(&game.state).store_pool.is_empty());
    assert!(game.state.players.iter().all(|p| p.hand.len() == 1));
}

#[test]
fn general_store_skips_a_dying_picker_and_returns_unused_pool_cards() {
    let mut game = Scenario::new(4);
    play(&mut game, 0, CardKind::GeneralStore, None);
    game.end();
    game.dying_child(1, None);
    game.respond(None);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(2));
    game.end();
    let events = game.end();
    assert!(events.iter().any(
        |event| matches!(&event.kind, EventKind::PoolDiscarded { cards } if cards.len() == 1)
    ));
    assert!(game.state.pending.is_empty());
    assert_eq!(game.state.players[1].hand.len(), 0);
}

#[test]
fn finishing_with_general_store_pool_returns_every_card_before_clearing_pending() {
    let mut game = Scenario::new(4);
    game.state.turn.player = PlayerId(1);
    play(&mut game, 1, CardKind::GeneralStore, None);
    let pool = spectator_view(&game.state).store_pool;
    game.dying_child(0, Some(PlayerId(1)));
    let events = roundtrip_step(&mut game);
    assert_eq!(game.state.winner, Some(Winner::Outlaws));
    for card in pool {
        assert!(game.state.discard_pile.contains(&card));
    }
    let returned = events
        .iter()
        .position(|event| matches!(event.kind, EventKind::PoolDiscarded { .. }))
        .unwrap();
    let finished = events
        .iter()
        .position(|event| matches!(event.kind, EventKind::GameEnded { .. }))
        .unwrap();
    assert!(returned < finished);
    assert!(game.state.pending.is_empty());
}

#[test]
fn dynamite_checks_spades_two_through_nine_but_not_ace_or_ten() {
    for (kind, rank, explodes) in [
        (CardKind::Missed, Rank::Two, true),
        (CardKind::Stagecoach, Rank::Nine, true),
        (CardKind::Bang, Rank::Ace, false),
        (CardKind::Jail, Rank::Ten, false),
    ] {
        let mut game = Scenario::new(4);
        let dynamite = game.equip(1, CardKind::Dynamite);
        game.top_face(kind, Suit::Spades, rank);
        let events = game.end();
        assert_eq!(revealed(&events), vec![CardKind::Dynamite]);
        if explodes {
            assert_eq!(game.state.players[1].health, 1);
            assert!(game.state.discard_pile.contains(&dynamite));
        } else {
            assert_eq!(game.state.players[1].health, 4);
            assert!(game.state.players[2].in_play.contains(&dynamite));
        }
    }
}

#[test]
fn dynamite_passes_to_next_living_seat_and_waits_for_their_turn() {
    let mut game = Scenario::new(4);
    game.dead(2);
    let dynamite = game.equip(1, CardKind::Dynamite);
    game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
    let events = game.end();
    assert_eq!(revealed(&events), vec![CardKind::Dynamite]);
    assert!(game.state.players[3].in_play.contains(&dynamite));
    assert_eq!(game.state.turn.player, PlayerId(1));
    game.top_face(CardKind::Beer, Suit::Hearts, Rank::Seven);
    let events = game.end();
    assert_eq!(revealed(&events), vec![CardKind::Dynamite]);
    assert!(game.state.players[0].in_play.contains(&dynamite));
}

#[test]
fn newly_played_dynamite_is_not_checked_until_holders_next_turn() {
    let mut game = Scenario::new(4);
    let before = game.state.draw_pile.len() - 1;
    let (dynamite, events) = play(&mut game, 0, CardKind::Dynamite, None);
    assert!(revealed(&events).is_empty());
    assert_eq!(game.state.draw_pile.len(), before);
    for _ in 0..3 {
        assert!(revealed(&game.end()).is_empty());
    }
    assert!(game.state.players[0].in_play.contains(&dynamite));
    game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
    let events = game.end();
    assert_eq!(revealed(&events), vec![CardKind::Dynamite]);
    assert_eq!(game.state.players[0].health, 2);
}

#[test]
fn dynamite_dying_can_use_multiple_beers_then_resume_jail_without_rechecking() {
    let mut game = Scenario::new(4);
    game.equip(1, CardKind::Dynamite);
    let jail = game.equip(1, CardKind::Jail);
    game.state.players[1].health = 1;
    let beers: Vec<_> = (0..3).map(|_| game.give(1, CardKind::Beer)).collect();
    game.top_face(CardKind::Beer, Suit::Hearts, Rank::Nine);
    game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
    let events = game.end();
    assert_eq!(revealed(&events), vec![CardKind::Dynamite]);
    assert_eq!(game.state.turn.step, TurnStep::Jail);
    assert_eq!(game.state.players[1].health, -2);
    let id = game.state.pending.last().unwrap().id;
    assert!(matches!(
        game.state.pending.last().unwrap().kind,
        PendingKind::Dying {
            source: None,
            needed: 3,
            ..
        }
    ));
    for (index, beer) in beers.into_iter().enumerate() {
        let events = game.respond(Some(beer));
        if index < 2 {
            assert_ne!(game.state.pending.last().unwrap().id, id);
        } else {
            assert_eq!(revealed(&events), vec![CardKind::Jail]);
        }
    }
    assert_eq!(game.state.turn.player, PlayerId(1));
    assert_eq!(game.state.turn.step, TurnStep::Play);
    assert_eq!(game.state.players[1].health, 1);
    assert_eq!(game.state.players[1].hand.len(), 2);
    assert!(game.state.discard_pile.contains(&jail));
}

#[test]
fn dynamite_death_skips_jail_and_has_no_killer_reward_or_penalty() {
    let mut game = Scenario::new(4);
    game.equip(1, CardKind::Dynamite);
    let jail = game.equip(1, CardKind::Jail);
    game.state.players[1].health = 1;
    game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
    let first = game.end();
    assert_eq!(revealed(&first), vec![CardKind::Dynamite]);
    let events = game.respond(None);
    assert!(revealed(&events).is_empty());
    assert!(game.state.discard_pile.contains(&jail));
    assert_eq!(game.state.turn.player, PlayerId(2));
    assert!(game.state.players[0].hand.is_empty());
    assert!(!events.iter().any(|event| matches!(
        event.kind,
        EventKind::BountyAwarded { .. } | EventKind::SheriffPenalized { .. }
    )));
}

#[test]
fn jail_rejects_sheriff_self_and_duplicates() {
    let mut game = Scenario::new(4);
    game.state.turn.player = PlayerId(1);
    let first = game.give(1, CardKind::Jail);
    for target in [0, 1, 99] {
        game.reject(
            1,
            Action::Play {
                card: first,
                target: Some(PlayerId(target)),
            },
            ActionError::InvalidTarget,
        );
    }
    game.act(
        1,
        Action::Play {
            card: first,
            target: Some(PlayerId(2)),
        },
    );
    let next = game.give(1, CardKind::Jail);
    game.reject(
        1,
        Action::Play {
            card: next,
            target: Some(PlayerId(2)),
        },
        ActionError::DuplicateInPlay,
    );
    assert!(game.state.players[2].has_in_play(CardKind::Jail));
}

#[test]
fn jail_escape_draws_normally_and_failure_skips_the_entire_turn() {
    for escapes in [true, false] {
        let mut game = Scenario::new(4);
        let jail = game.equip(1, CardKind::Jail);
        if !escapes {
            game.state.players[1].health = 1;
            for _ in 0..5 {
                game.give(1, CardKind::Bang);
            }
        }
        let check = if escapes {
            game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six)
        } else {
            game.top_face(CardKind::Missed, Suit::Spades, Rank::Two)
        };
        let events = game.end();
        assert_eq!(revealed(&events), vec![CardKind::Jail]);
        assert!(game.state.discard_pile.contains(&jail));
        assert!(game.state.discard_pile.contains(&check));
        assert_eq!(
            game.state.turn.player,
            PlayerId(if escapes { 1 } else { 2 })
        );
        assert_eq!(
            game.state.players[1].hand.len(),
            if escapes { 2 } else { 5 }
        );
    }
}

#[test]
fn every_new_pending_frame_serializes_and_continues_with_identical_rng_and_events() {
    let mut store = Scenario::new(4);
    play(&mut store, 0, CardKind::GeneralStore, None);
    roundtrip_step(&mut store);
    assert_eq!(store.state.decision().unwrap().player, PlayerId(1));
    let mut duel = Scenario::new(4);
    let bang = duel.give(1, CardKind::Bang);
    play(&mut duel, 0, CardKind::Duel, Some(1));
    duel.respond(Some(bang));
    roundtrip_step(&mut duel);
    assert_eq!(duel.state.players[0].health, 4);
    let mut targets = Scenario::new(4);
    play(&mut targets, 0, CardKind::Indians, None);
    assert!(matches!(
        targets.state.pending[0].kind,
        PendingKind::ResolveTargets { cursor: 1, .. }
    ));
    roundtrip_step(&mut targets);
    assert_eq!(targets.state.decision().unwrap().player, PlayerId(2));
    assert!(matches!(
        targets.state.pending[0].kind,
        PendingKind::ResolveTargets { cursor: 2, .. }
    ));
}
