mod support;
use bang::*;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use std::collections::{BTreeMap, BTreeSet};
use support::{Scenario, invariant};

#[test]
fn catalog_matches_every_physical_card_and_character() {
    use CardKind::*;
    use Suit::*;
    let expected = [
        (
            Bang,
            vec![
                (Spades, vec![14]),
                (Diamonds, (2..=14).collect()),
                (Clubs, (2..=9).collect()),
                (Hearts, vec![12, 13, 14]),
            ],
        ),
        (
            Missed,
            vec![(Spades, (2..=8).collect()), (Clubs, (10..=14).collect())],
        ),
        (Beer, vec![(Hearts, (6..=11).collect())]),
        (Panic, vec![(Hearts, vec![11, 12, 14]), (Diamonds, vec![8])]),
        (
            CatBalou,
            vec![(Hearts, vec![13]), (Diamonds, vec![9, 10, 11])],
        ),
        (
            Duel,
            vec![(Diamonds, vec![12]), (Spades, vec![11]), (Clubs, vec![8])],
        ),
        (Indians, vec![(Diamonds, vec![13, 14])]),
        (GeneralStore, vec![(Clubs, vec![9]), (Spades, vec![12])]),
        (Gatling, vec![(Hearts, vec![10])]),
        (Saloon, vec![(Hearts, vec![5])]),
        (Stagecoach, vec![(Spades, vec![9, 9])]),
        (WellsFargo, vec![(Hearts, vec![3])]),
        (Barrel, vec![(Spades, vec![12, 13])]),
        (Dynamite, vec![(Hearts, vec![2])]),
        (Jail, vec![(Spades, vec![11, 10]), (Hearts, vec![4])]),
        (Mustang, vec![(Hearts, vec![8, 9])]),
        (Scope, vec![(Spades, vec![14])]),
        (Volcanic, vec![(Spades, vec![10]), (Clubs, vec![10])]),
        (Schofield, vec![(Clubs, vec![11, 12]), (Spades, vec![13])]),
        (Remington, vec![(Clubs, vec![13])]),
        (RevCarabine, vec![(Clubs, vec![14])]),
        (Winchester, vec![(Spades, vec![8])]),
    ];
    let mut wanted = BTreeMap::new();
    for (kind, suits) in expected {
        for (suit, ranks) in suits {
            for rank in ranks {
                *wanted.entry((kind, suit, rank)).or_insert(0) += 1;
            }
        }
    }
    let mut actual = BTreeMap::new();
    for card in DECK {
        *actual
            .entry((card.kind, card.suit, card.rank as u8))
            .or_insert(0) += 1;
    }
    assert_eq!(actual, wanted);
    assert_eq!(DECK.len(), 80);
    assert_eq!(
        DECK.iter().map(|c| c.kind).collect::<BTreeSet<_>>().len(),
        22
    );
    let coaches: Vec<_> = (0..80)
        .map(CardId)
        .filter(|id| id.card().unwrap().kind == Stagecoach)
        .collect();
    assert_eq!(coaches.len(), 2);
    assert_ne!(coaches[0], coaches[1]);
    assert_eq!(coaches[0].card(), coaches[1].card());
    assert_eq!(CardId(80).card(), None);
    assert_eq!(Character::ALL.len(), 16);
    let mut names = BTreeSet::new();
    for character in Character::ALL {
        assert!(names.insert(format!("{character:?}")));
        assert_eq!(
            character.health(),
            if matches!(character, Character::ElGringo | Character::PaulRegret) {
                3
            } else {
                4
            }
        );
    }
}

#[test]
fn setup_deals_roles_health_cards_and_the_first_turn_for_every_player_count() {
    for count in 4..=7 {
        for seed in 0..32 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let (state, events) = setup(
                count,
                bang::GameConfig {
                    roles: bang::RoleCounts::standard(count),
                    ..Default::default()
                },
                &mut rng,
            )
            .unwrap();
            invariant(&state);
            let counts = |role| state.players.iter().filter(|p| p.role == role).count();
            assert_eq!(counts(Role::Sheriff), 1);
            assert_eq!(
                counts(Role::Deputy),
                match count {
                    4 => 0,
                    7 => 2,
                    _ => 1,
                }
            );
            assert_eq!(counts(Role::Outlaw), if count <= 5 { 2 } else { 3 });
            assert_eq!(counts(Role::Renegade), 1);
            let mut characters = BTreeSet::new();
            for (index, player) in state.players.iter().enumerate() {
                let id = PlayerId(index);
                assert!(characters.insert(format!("{:?}", player.character)));
                assert_eq!(
                    player.health,
                    player.character.health() + i16::from(player.role == Role::Sheriff)
                );
                assert_eq!(player.max_health, player.health);
                let initial = events
                    .iter()
                    .find_map(|e| match e.kind {
                        EventKind::CardsDrawn { player, count } if player == id => Some(count),
                        _ => None,
                    })
                    .unwrap();
                assert_eq!(initial, player.health as usize);
                let received: usize = events
                    .iter()
                    .filter_map(|e| match e.kind {
                        EventKind::CardsDrawn { player, count } if player == id => Some(count),
                        _ => None,
                    })
                    .sum();
                assert_eq!(player.hand.len(), received);
            }
            assert_eq!(state.players[state.turn.player.0].role, Role::Sheriff);
            assert_eq!(state.turn.step, TurnStep::Play);
            assert!(state.pending.iter().all(|f| matches!(
                f.kind,
                PendingKind::DrawChoice { .. } | PendingKind::KeepCards { .. }
            )));
        }
    }
    for count in [0, 1, 3, 8, usize::MAX] {
        let mut rng = ChaCha8Rng::seed_from_u64(1);
        let before = rng.clone();
        assert_eq!(
            setup(
                count,
                bang::GameConfig {
                    roles: bang::RoleCounts::standard(count),
                    ..Default::default()
                },
                &mut rng
            ),
            Err(ActionError::InvalidPlayerCount)
        );
        assert_eq!(rng.get_word_pos(), before.get_word_pos());
    }
}

#[test]
fn distance_uses_the_living_ring_and_all_four_modifiers() {
    let mut game = Scenario::new(6);
    let modifiers = DistanceModifiers::default();
    assert_eq!(
        distance(&game.state, PlayerId(0), PlayerId(3), modifiers),
        Ok(3)
    );
    assert_eq!(
        distance(&game.state, PlayerId(0), PlayerId(5), modifiers),
        Ok(1)
    );
    game.dead(1);
    assert_eq!(
        distance(&game.state, PlayerId(0), PlayerId(2), modifiers),
        Ok(1)
    );
    assert_eq!(
        distance(&game.state, PlayerId(0), PlayerId(1), modifiers),
        Err(ActionError::InvalidTarget)
    );
    assert_eq!(
        distance(
            &game.state,
            PlayerId(0),
            PlayerId(2),
            DistanceModifiers {
                target_mustang: 1,
                target_paul: 1,
                ..modifiers
            }
        ),
        Ok(3)
    );
    assert_eq!(
        distance(
            &game.state,
            PlayerId(0),
            PlayerId(3),
            DistanceModifiers {
                source_scope: 1,
                source_rose: 1,
                ..modifiers
            }
        ),
        Ok(1)
    );
    assert_eq!(
        distance(&game.state, PlayerId(0), PlayerId(0), modifiers),
        Ok(1)
    );
    game.state.players[0].character = Character::RoseDoolan;
    game.state.players[3].character = Character::PaulRegret;
    game.state.players[3].health = 3;
    game.state.players[3].max_health = 3;
    assert_eq!(
        distance(&game.state, PlayerId(0), PlayerId(3), modifiers),
        Ok(2)
    );
    invariant(&game.state);
}

#[test]
fn bang_missed_and_pass_resume_the_same_turn_without_auto_defense() {
    let mut game = Scenario::new(4);
    let missed = game.give(1, CardKind::Missed);
    game.shoot(0, 1);
    let id = game.state.pending.last().unwrap().id;
    assert_eq!(game.state.decision().unwrap().player, PlayerId(1));
    game.reject(
        0,
        Action::Respond {
            pending_id: id,
            card: None,
        },
        ActionError::NotYourDecision,
    );
    game.reject(
        1,
        Action::EndTurn { discard: vec![] },
        ActionError::WrongAction,
    );
    game.reject(
        1,
        Action::Respond {
            pending_id: PendingId(id.0 + 1),
            card: Some(missed),
        },
        ActionError::StalePending,
    );
    game.respond(Some(missed));
    assert!(game.state.pending.is_empty());
    assert_eq!(game.state.players[1].health, 4);
    assert_eq!(game.state.turn.player, PlayerId(0));
    let second = game.give(0, CardKind::Bang);
    game.reject(
        0,
        Action::Play {
            card: second,
            target: Some(PlayerId(1)),
        },
        ActionError::BangLimit,
    );
    game.end();
    game.end();
    game.end();
    game.end();
    let defense = game.give(1, CardKind::Missed);
    game.act(
        0,
        Action::Play {
            card: second,
            target: Some(PlayerId(1)),
        },
    );
    assert_ne!(game.state.pending.last().unwrap().id, id);
    game.reject(
        1,
        Action::Respond {
            pending_id: id,
            card: Some(defense),
        },
        ActionError::StalePending,
    );
    game.respond(None);
    assert_eq!(game.state.players[1].health, 3);
    assert!(game.state.players[1].hand.contains(&defense));
}

#[test]
fn invalid_actions_preserve_state_and_rng() {
    let mut game = Scenario::new(6);
    let bang = game.give(0, CardKind::Bang);
    game.reject(
        0,
        Action::Play {
            card: bang,
            target: Some(PlayerId(3)),
        },
        ActionError::OutOfRange,
    );
    for target in [None, Some(PlayerId(0)), Some(PlayerId(99))] {
        game.reject(
            0,
            Action::Play { card: bang, target },
            ActionError::InvalidTarget,
        );
    }
    game.reject(
        0,
        Action::Play {
            card: CardId(255),
            target: None,
        },
        ActionError::CardNotInHand,
    );
    game.reject(
        99,
        Action::Play {
            card: bang,
            target: Some(PlayerId(1)),
        },
        ActionError::UnknownPlayer,
    );
    let missed = game.give(0, CardKind::Missed);
    game.reject(
        0,
        Action::Play {
            card: missed,
            target: None,
        },
        ActionError::WrongAction,
    );
    let beer = game.give(0, CardKind::Beer);
    game.reject(
        0,
        Action::Play {
            card: beer,
            target: Some(PlayerId(1)),
        },
        ActionError::InvalidTarget,
    );
    game.shoot(0, 1);
    let bang = game.give(1, CardKind::Bang);
    let id = game.state.pending.last().unwrap().id;
    game.reject(
        1,
        Action::Respond {
            pending_id: id,
            card: Some(bang),
        },
        ActionError::WrongAction,
    );
    let response_beer = game.give(1, CardKind::Beer);
    game.reject(
        1,
        Action::Respond {
            pending_id: id,
            card: Some(response_beer),
        },
        ActionError::WrongAction,
    );
    let barrel = game.give(1, CardKind::Barrel);
    game.reject(
        1,
        Action::Respond {
            pending_id: id,
            card: Some(barrel),
        },
        ActionError::WrongAction,
    );
    game.reject(
        0,
        Action::Play {
            card: beer,
            target: None,
        },
        ActionError::NotYourDecision,
    );
}

#[test]
fn slab_requires_two_missed_and_willy_can_fire_again() {
    let mut game = Scenario::new(4);
    game.state.players[0].character = Character::SlabTheKiller;
    let first = game.give(1, CardKind::Missed);
    let second = game.give(1, CardKind::Missed);
    game.shoot(0, 1);
    assert!(matches!(
        game.state.pending.last().unwrap().kind,
        PendingKind::AttackResponse { remaining: 2, .. }
    ));
    let id = game.state.pending.last().unwrap().id;
    game.respond(Some(first));
    assert_ne!(game.state.pending.last().unwrap().id, id);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse { remaining: 1, .. }
    ));
    game.respond(Some(second));
    assert!(game.state.pending.is_empty());
    assert_eq!(game.state.players[1].health, 4);
    game.state.players[0].character = Character::WillyTheKid;
    let bang = game.give(0, CardKind::Bang);
    game.act(
        0,
        Action::Play {
            card: bang,
            target: Some(PlayerId(1)),
        },
    );
}

#[test]
fn beer_heals_only_self_and_never_exceeds_maximum_or_works_with_two_alive() {
    let mut game = Scenario::new(4);
    game.state.players[0].health = 4;
    let first = game.give(0, CardKind::Beer);
    game.act(
        0,
        Action::Play {
            card: first,
            target: None,
        },
    );
    assert_eq!(game.state.players[0].health, 5);
    let second = game.give(0, CardKind::Beer);
    game.act(
        0,
        Action::Play {
            card: second,
            target: Some(PlayerId(0)),
        },
    );
    assert_eq!(game.state.players[0].health, 5);
    game.dead(2);
    game.dead(3);
    game.state.players[0].health = 3;
    let beer = game.give(0, CardKind::Beer);
    game.act(
        0,
        Action::Play {
            card: beer,
            target: None,
        },
    );
    assert_eq!(game.state.players[0].health, 3);
    game.state.players[1].health = 1;
    let beer = game.give(1, CardKind::Beer);
    game.shoot(0, 1);
    game.respond(None);
    let id = game.state.pending.last().unwrap().id;
    game.respond(Some(beer));
    assert_eq!(game.state.players[1].health, 0);
    assert_ne!(game.state.pending.last().unwrap().id, id);
    game.respond(None);
    assert!(!game.state.players[1].alive);
}

#[test]
fn dying_preserves_one_window_for_multiple_beers_and_never_auto_saves() {
    let mut game = Scenario::new(4);
    game.state.players[1].health = 1;
    let beers: Vec<_> = (0..3).map(|_| game.give(1, CardKind::Beer)).collect();
    game.shoot(0, 1);
    if let PendingKind::AttackResponse { damage, .. } =
        &mut game.state.pending.last_mut().unwrap().kind
    {
        *damage = 3;
    }
    let attack_id = game.state.pending.last().unwrap().id;
    game.respond(None);
    assert_eq!(game.state.players[1].health, -2);
    assert!(game.state.players[1].alive);
    assert_eq!(spectator_view(&game.state).players[1].role, None);
    assert_eq!(game.state.players[1].hand, beers);
    let id = game.state.pending.last().unwrap().id;
    assert_ne!(id, attack_id);
    game.reject(
        1,
        Action::Respond {
            pending_id: attack_id,
            card: None,
        },
        ActionError::StalePending,
    );
    for (index, beer) in beers.into_iter().enumerate() {
        game.respond(Some(beer));
        assert_eq!(game.state.players[1].health, index as i16 - 1);
        if index < 2 {
            assert_ne!(game.state.pending.last().unwrap().id, id);
            assert!(
                matches!(game.state.pending.last().unwrap().kind, PendingKind::Dying { needed, .. } if needed == (2 - index) as u16)
            );
        }
    }
    assert!(game.state.pending.is_empty());
    assert_eq!(game.state.turn.player, PlayerId(0));
}

#[test]
fn accepting_death_discards_everything_and_rewards_even_an_outlaw_killer() {
    let mut game = Scenario::new(4);
    game.state.players[0].role = Role::Outlaw;
    game.state.players[2].role = Role::Sheriff;
    game.state.players[0].health = 4;
    game.state.players[0].max_health = 4;
    game.state.players[2].max_health = 5;
    game.state.players[1].health = 1;
    let hand = game.give(1, CardKind::Beer);
    let equipment = game.equip(1, CardKind::Winchester);
    game.shoot(0, 1);
    game.respond(None);
    let before = game.state.players[0].hand.len();
    let events = game.respond(None);
    assert!(!game.state.players[1].alive);
    assert_eq!(game.state.players[0].hand.len(), before + 3);
    assert!(game.state.discard_pile.contains(&hand));
    assert!(game.state.discard_pile.contains(&equipment));
    assert!(events.iter().any(|e| matches!(
        e.kind,
        EventKind::PlayerEliminated {
            player: PlayerId(1),
            role: Role::Outlaw
        }
    )));
    assert!(game.state.winner.is_none());
}

#[test]
fn sheriff_penalty_discards_hand_and_in_place_cards() {
    let mut game = Scenario::new(5);
    game.state.players[1].role = Role::Deputy;
    game.state.players[1].health = 1;
    game.give(0, CardKind::Beer);
    game.equip(0, CardKind::Schofield);
    game.equip(0, CardKind::Mustang);
    game.give(1, CardKind::Missed);
    game.shoot(0, 1);
    game.respond(None);
    game.respond(None);
    assert!(game.state.players[0].hand.is_empty());
    assert!(game.state.players[0].in_play.is_empty());
    assert!(game.state.winner.is_none());
}

#[test]
fn all_win_conditions_reveal_roles_after_rewards_and_include_dead_teammates() {
    let mut game = Scenario::new(5);
    game.state.players[2].role = Role::Deputy;
    game.dead(2);
    game.dead(3);
    game.dead(4);
    game.state.players[1].health = 1;
    game.shoot(0, 1);
    game.respond(None);
    let events = game.respond(None);
    assert_eq!(game.state.winner, Some(Winner::SheriffAndDeputies));
    assert_eq!(game.state.players[0].hand.len(), 3);
    let reward = events
        .iter()
        .position(|e| {
            matches!(
                e.kind,
                EventKind::CardsDrawn {
                    player: PlayerId(0),
                    count: 3
                }
            )
        })
        .unwrap();
    let finish = events
        .iter()
        .position(|e| matches!(e.kind, EventKind::GameEnded { .. }))
        .unwrap();
    assert!(reward < finish);
    assert!(
        spectator_view(&game.state)
            .players
            .iter()
            .all(|p| p.role.is_some())
    );
    game.reject(
        0,
        Action::EndTurn { discard: vec![] },
        ActionError::GameOver,
    );
    assert_eq!(default_action(&game.state), None);

    let mut game = Scenario::new(4);
    game.state.turn.player = PlayerId(1);
    game.state.players[0].health = 1;
    game.shoot(1, 0);
    game.respond(None);
    game.respond(None);
    assert_eq!(game.state.winner, Some(Winner::Outlaws));

    let mut game = Scenario::new(4);
    game.dead(1);
    game.dead(2);
    game.state.turn.player = PlayerId(3);
    game.state.players[0].health = 1;
    game.shoot(3, 0);
    game.respond(None);
    game.respond(None);
    assert_eq!(
        game.state.winner,
        Some(Winner::Renegade {
            player: PlayerId(3)
        })
    );

    let mut game = Scenario::new(5);
    game.state.players[1].role = Role::Deputy;
    game.dead(2);
    game.dead(3);
    game.state.turn.player = PlayerId(4);
    game.state.players[0].health = 1;
    game.shoot(4, 0);
    game.respond(None);
    game.respond(None);
    assert_eq!(game.state.winner, Some(Winner::Outlaws));
    assert!(
        game.state
            .players
            .iter()
            .all(|p| p.role != Role::Outlaw || !p.alive)
    );
}

#[test]
fn end_turn_validates_discard_batch_and_uses_current_health() {
    let mut game = Scenario::new(4);
    game.state.players[0].health = 2;
    let cards: Vec<_> = (0..5).map(|_| game.give(0, CardKind::Bang)).collect();
    game.state.discard_pile = std::mem::take(&mut game.state.draw_pile);
    game.reject(
        0,
        Action::EndTurn { discard: vec![] },
        ActionError::InvalidDiscard,
    );
    game.reject(
        0,
        Action::EndTurn {
            discard: vec![cards[4], cards[4], cards[3]],
        },
        ActionError::InvalidDiscard,
    );
    game.reject(
        0,
        Action::EndTurn {
            discard: vec![cards[4], cards[3], CardId(255)],
        },
        ActionError::InvalidDiscard,
    );
    assert_eq!(
        default_action(&game.state),
        Some((
            PlayerId(0),
            Action::EndTurn {
                discard: vec![cards[4], cards[3], cards[2]]
            }
        ))
    );
    let before_draw = game.rng.get_word_pos();
    game.end();
    assert!(game.rng.get_word_pos() > before_draw);
    assert_eq!(game.state.players[0].hand, cards[..2]);
    assert_eq!(game.state.turn.player, PlayerId(1));
    assert_eq!(game.state.players[1].hand.len(), 2);
    assert_eq!(game.state.turn.bangs_played, 0);
}

#[test]
fn draw_refills_from_discards_and_fixed_top_cards_are_drawn_first() {
    let mut game = Scenario::new(4);
    let second = game.top_face(CardKind::RevCarabine, Suit::Clubs, Rank::Ace);
    let first = game.top_face(CardKind::Winchester, Suit::Spades, Rank::Eight);
    game.end();
    assert_eq!(game.state.players[1].hand, vec![first, second]);
    let mut game = Scenario::new(4);
    let last = game.state.draw_pile.pop().unwrap();
    game.state.discard_pile = std::mem::take(&mut game.state.draw_pile);
    game.state.draw_pile.push(last);
    let events = game.end();
    assert_eq!(game.state.players[1].hand[0], last);
    assert_eq!(game.state.players[1].hand.len(), 2);
    assert!(
        events
            .iter()
            .any(|e| matches!(e.kind, EventKind::DeckReshuffled { count: 79 }))
    );
    assert!(game.state.discard_pile.is_empty());
}

#[test]
fn serialized_attack_and_dying_states_actions_events_and_views_resume_identically() {
    let mut game = Scenario::new(4);
    game.state.players[1].health = 1;
    game.shoot(0, 1);
    for _ in 0..2 {
        let encoded = serde_json::to_string(&game.state).unwrap();
        let mut restored: GameState = serde_json::from_str(&encoded).unwrap();
        let mut rng = game.rng.clone();
        let (player, action) = default_action(&game.state).unwrap();
        let encoded_action = serde_json::to_string(&action).unwrap();
        let action_copy = serde_json::from_str(&encoded_action).unwrap();
        let expected = game.act(player.0, action);
        let actual = apply(&mut restored, player, action_copy, &mut rng).unwrap();
        assert_eq!(restored, game.state);
        assert_eq!(actual, expected);
        assert_eq!(rng.get_word_pos(), game.rng.get_word_pos());
        assert_eq!(
            serde_json::from_str::<Vec<Event>>(&serde_json::to_string(&actual).unwrap()).unwrap(),
            actual
        );
        let spectator = spectator_view(&restored);
        assert_eq!(
            serde_json::from_str::<SpectatorView>(&serde_json::to_string(&spectator).unwrap())
                .unwrap(),
            spectator
        );
        let own = view(&restored, player).unwrap();
        assert_eq!(
            serde_json::from_str::<PlayerView>(&serde_json::to_string(&own).unwrap()).unwrap(),
            own
        );
        invariant(&restored);
    }
}

#[test]
fn hidden_information_is_noninterfering_in_views_and_filtered_draw_events() {
    let mut game = Scenario::new(4);
    game.give(0, CardKind::Beer);
    game.give(1, CardKind::Bang);
    game.give(2, CardKind::Missed);
    let own = view(&game.state, PlayerId(0)).unwrap();
    assert_eq!(own.hand, game.state.players[0].hand);
    assert_eq!(own.table.players[0].role, Some(Role::Sheriff));
    let outlaw_view = view(&game.state, PlayerId(1)).unwrap();
    assert_eq!(outlaw_view.table.players[1].role, Some(Role::Outlaw));
    assert_eq!(outlaw_view.table.players[2].role, None);
    let spectator = spectator_view(&game.state);
    assert_eq!(spectator.players[1].role, None);
    assert_eq!(
        view(&game.state, PlayerId(99)),
        Err(ActionError::UnknownPlayer)
    );

    let mut other = game.state.clone();
    other.players[1].role = Role::Renegade;
    other.players[3].role = Role::Outlaw;
    let hidden = other.players[1].hand[0];
    other.players[1].hand[0] = other.players[2].hand[0];
    other.players[2].hand[0] = hidden;
    other.draw_pile.reverse();
    assert_eq!(spectator_view(&other), spectator);
    assert_eq!(view(&other, PlayerId(0)).unwrap(), own);
    assert_ne!(view(&other, PlayerId(1)).unwrap(), outlaw_view);
    invariant(&other);
    let mut rng = game.rng.clone();
    let (_, action) = default_action(&game.state).unwrap();
    let actual = apply(&mut other, PlayerId(0), action.clone(), &mut rng).unwrap();
    let expected = game.act(0, action);
    assert_eq!(filter_events(&actual, None), filter_events(&expected, None));
    assert_eq!(
        filter_events(&actual, Some(PlayerId(0))),
        filter_events(&expected, Some(PlayerId(0)))
    );
    assert_ne!(
        filter_events(&actual, Some(PlayerId(1))),
        filter_events(&expected, Some(PlayerId(1)))
    );
    assert_eq!(
        view(&other, PlayerId(0)).unwrap(),
        view(&game.state, PlayerId(0)).unwrap()
    );
    for recipient in [
        None,
        Some(PlayerId(0)),
        Some(PlayerId(1)),
        Some(PlayerId(2)),
    ] {
        for event in filter_events(&expected, recipient) {
            if let EventKind::CardsReceived { player, .. } = event.kind {
                assert_eq!(recipient, Some(player));
                assert_eq!(event.visibility, Visibility::Player(player));
            }
        }
    }
    let json = serde_json::to_value(spectator_view(&game.state)).unwrap();
    assert!(json.get("draw_pile").is_none() && json.get("pending").is_none());
    assert!(
        json["players"]
            .as_array()
            .unwrap()
            .iter()
            .all(|p| p.get("hand").is_none())
    );

    game.shoot(1, 2);
    let before = spectator_view(&game.state);
    let mut hidden_frame = game.state.pending.last().unwrap().clone();
    hidden_frame.id = PendingId(999);
    game.state.pending.insert(0, hidden_frame);
    assert_eq!(spectator_view(&game.state), before);
    game.state.pending.remove(0);
    game.respond(None);
    game.dead(2);
    let dead_view = view(&game.state, PlayerId(2)).unwrap();
    assert!(dead_view.hand.is_empty());
    assert_eq!(dead_view.table, spectator_view(&game.state));
    invariant(&game.state);
}

#[test]
fn timeout_defaults_decline_reactions_and_skip_dead_seats() {
    let mut game = Scenario::new(4);
    game.state.players[1].health = 1;
    let beer = game.give(1, CardKind::Beer);
    game.shoot(0, 1);
    let attack = game.state.pending.last().unwrap().id;
    assert_eq!(
        default_action(&game.state),
        Some((
            PlayerId(1),
            Action::Respond {
                pending_id: attack,
                card: None
            }
        ))
    );
    game.end();
    let dying = game.state.pending.last().unwrap().id;
    assert_eq!(
        default_action(&game.state),
        Some((
            PlayerId(1),
            Action::Respond {
                pending_id: dying,
                card: None
            }
        ))
    );
    game.end();
    assert!(!game.state.players[1].alive);
    assert!(game.state.discard_pile.contains(&beer));
    game.reject(
        1,
        Action::EndTurn { discard: vec![] },
        ActionError::Eliminated,
    );
    game.end();
    assert_eq!(game.state.turn.player, PlayerId(2));
}

#[test]
fn unavailable_draw_cards_do_not_duplicate_or_destroy_owned_cards() {
    let mut game = Scenario::new(4);
    game.state.players[2].hand = std::mem::take(&mut game.state.draw_pile);
    game.end();
    assert_eq!(game.state.turn.player, PlayerId(1));
    assert!(game.state.players[1].hand.is_empty());
    assert_eq!(game.state.players[2].hand.len(), 80);
}

#[path = "engine/fuzz.rs"]
mod fuzz;

#[path = "engine/cards.rs"]
mod cards;

#[path = "engine/characters.rs"]
mod characters;

#[test]
fn custom_roles_are_validated_before_rng_and_preserved_with_mode() {
    let configs = [
        RoleCounts {
            deputy: 1,
            outlaw: 1,
            renegade: 1,
        },
        RoleCounts {
            deputy: 2,
            outlaw: 1,
            renegade: 0,
        },
        RoleCounts {
            deputy: 0,
            outlaw: 0,
            renegade: 3,
        },
        RoleCounts {
            deputy: 0,
            outlaw: 3,
            renegade: 0,
        },
    ];
    for roles in configs {
        let mut sheriff_seats = BTreeSet::new();
        for seed in 0..32 {
            let config = GameConfig {
                mode: GameMode::Club,
                roles,
            };
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let (state, events) = setup(4, config, &mut rng).unwrap();
            invariant(&state);
            assert_eq!(state.config, config);
            for (role, count) in [
                (Role::Sheriff, 1),
                (Role::Deputy, roles.deputy),
                (Role::Outlaw, roles.outlaw),
                (Role::Renegade, roles.renegade),
            ] {
                assert_eq!(
                    state.players.iter().filter(|p| p.role == role).count(),
                    usize::from(count)
                );
            }
            sheriff_seats.insert(state.turn.player.0);
            let (replay, replay_events) =
                setup(4, config, &mut ChaCha8Rng::seed_from_u64(seed)).unwrap();
            assert_eq!(state, replay);
            assert_eq!(events, replay_events);
            let restored: GameState =
                serde_json::from_str(&serde_json::to_string(&state).unwrap()).unwrap();
            assert_eq!(restored.config, config);
            let (mut classic, classic_events) = setup(
                4,
                GameConfig {
                    mode: GameMode::Classic,
                    roles,
                },
                &mut ChaCha8Rng::seed_from_u64(seed),
            )
            .unwrap();
            classic.config.mode = GameMode::Club;
            assert_eq!(
                classic, state,
                "Mode is stored but does not change rules in phase A"
            );
            assert_eq!(classic_events, events);
        }
        assert_eq!(sheriff_seats.len(), 4);
    }
    for roles in [
        RoleCounts {
            deputy: 0,
            outlaw: 0,
            renegade: 0,
        },
        RoleCounts {
            deputy: 3,
            outlaw: 0,
            renegade: 0,
        },
        RoleCounts {
            deputy: 1,
            outlaw: 2,
            renegade: 1,
        },
        RoleCounts {
            deputy: 255,
            outlaw: 255,
            renegade: 255,
        },
    ] {
        let mut rng = ChaCha8Rng::seed_from_u64(42);
        let before = rng.clone();
        assert_eq!(
            setup(
                4,
                GameConfig {
                    mode: GameMode::Classic,
                    roles
                },
                &mut rng
            ),
            Err(ActionError::InvalidSettings)
        );
        assert_eq!(rng.get_word_pos(), before.get_word_pos());
    }
}
