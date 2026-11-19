use super::support::{Scenario, invariant, legal_actions};
use bang::*;
use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;

fn club() -> Scenario {
    let mut game = Scenario::new(4);
    game.state.config.mode = GameMode::Club;
    game
}

fn play(game: &mut Scenario, player: usize, kind: CardKind, target: Option<usize>) -> CardId {
    let card = game.give(player, kind);
    game.act(
        player,
        Action::Play {
            card,
            target: target.map(PlayerId),
        },
    );
    card
}

fn safe_end(game: &mut Scenario) -> Vec<Event> {
    let card = *game
        .state
        .draw_pile
        .iter()
        .find(|card| card.card().unwrap().suit == Suit::Hearts)
        .unwrap();
    game.top(card);
    game.end()
}

fn to_turn(game: &mut Scenario, player: usize) {
    for _ in 0..12 {
        if game.state.turn.player == PlayerId(player) {
            return;
        }
        safe_end(game);
    }
    panic!("Turn did not reach player {player}");
}

fn kill(game: &mut Scenario, source: usize, target: usize) {
    game.state.players[target].health = 1;
    game.shoot(source, target);
    game.respond(None);
    game.respond(None);
    assert!(!game.state.players[target].alive);
}

fn has_event(events: &[Event], predicate: impl Fn(&EventKind) -> bool) -> bool {
    events.iter().any(|event| predicate(&event.kind))
}

#[test]
fn club_dynamite_waits_then_checks_every_living_player_once_while_classic_keeps_circulating() {
    for mode in [GameMode::Club, GameMode::Classic] {
        let mut game = club();
        game.state.config.mode = mode;
        let dynamite = play(&mut game, 0, CardKind::Dynamite, None);
        for _ in 0..3 {
            assert!(!has_event(&safe_end(&mut game), |event| matches!(
                event,
                EventKind::DrawRevealed {
                    reason: CardKind::Dynamite,
                    ..
                }
            )));
        }
        assert!(game.state.players[0].in_play.contains(&dynamite));
        let mut checked = Vec::new();
        for _ in 0..4 {
            let events = safe_end(&mut game);
            checked.extend(events.iter().filter_map(|event| match event.kind {
                EventKind::DrawRevealed {
                    player,
                    reason: CardKind::Dynamite,
                    ..
                } => Some(player),
                _ => None,
            }));
        }
        assert_eq!(checked, (0..4).map(PlayerId).collect::<Vec<_>>());
        if mode == GameMode::Club {
            assert!(game.state.discard_pile.contains(&dynamite));
            assert!(game.state.dynamite_round.is_none());
            assert!(!has_event(&safe_end(&mut game), |event| matches!(
                event,
                EventKind::DrawRevealed {
                    reason: CardKind::Dynamite,
                    ..
                }
            )));
        } else {
            assert!(game.state.players[0].in_play.contains(&dynamite));
            assert!(has_event(&safe_end(&mut game), |event| matches!(
                event,
                EventKind::DrawRevealed {
                    reason: CardKind::Dynamite,
                    player: PlayerId(0),
                    ..
                }
            )));
        }
    }
}

#[test]
fn club_dynamite_uses_original_spade_boundaries_and_unattributed_damage() {
    for (kind, rank, explodes) in [
        (CardKind::Missed, Rank::Two, true),
        (CardKind::Stagecoach, Rank::Nine, true),
        (CardKind::Bang, Rank::Ace, false),
        (CardKind::Jail, Rank::Ten, false),
    ] {
        let mut game = club();
        let dynamite = game.equip(1, CardKind::Dynamite);
        game.top_face(kind, Suit::Spades, rank);
        let events = game.end();
        assert_eq!(game.state.players[1].health, if explodes { 1 } else { 4 });
        if explodes {
            assert!(game.state.discard_pile.contains(&dynamite));
            assert!(game.state.dynamite_round.is_none());
            assert!(has_event(&events, |event| matches!(
                event,
                EventKind::HealthChanged {
                    source: None,
                    delta: -3,
                    ..
                }
            )));
            assert!(!has_event(&events, |event| matches!(
                event,
                EventKind::BountyAwarded { .. } | EventKind::SheriffPenalized { .. }
            )));
        } else {
            assert!(game.state.players[2].in_play.contains(&dynamite));
        }
    }
}

#[test]
fn club_dynamite_finishes_if_original_owner_dies_and_skips_unchecked_dead_players() {
    for victim in [1, 3] {
        let mut game = club();
        if victim == 3 {
            game.equip(1, CardKind::Winchester);
        }
        let dynamite = game.equip(1, CardKind::Dynamite);
        safe_end(&mut game); // Owner 1 has checked; holder is now 2.
        if victim == 1 {
            game.state.turn.player = PlayerId(0);
            kill(&mut game, 0, 1);
        } else {
            kill(&mut game, 1, 3);
        }
        let mut checks = Vec::new();
        let mut ended = false;
        for _ in 0..5 {
            let events = safe_end(&mut game);
            checks.extend(events.iter().filter_map(|event| match event.kind {
                EventKind::DrawRevealed {
                    player,
                    reason: CardKind::Dynamite,
                    ..
                } => Some(player.0),
                _ => None,
            }));
            if has_event(&events, |event| {
                matches!(event, EventKind::DynamiteRoundEnded { .. })
            }) {
                ended = true;
                break;
            }
        }
        assert!(ended);
        assert_eq!(
            checks,
            if victim == 1 {
                vec![2, 3, 0]
            } else {
                vec![2, 0]
            }
        );
        assert!(game.state.discard_pile.contains(&dynamite));
    }
}

#[test]
fn club_holder_death_discards_or_vulture_inherits_dynamite_and_replay_starts_a_fresh_round() {
    for vulture in [false, true] {
        let mut game = club();
        if vulture {
            game.character(3, Character::VultureSam);
        }
        let dynamite = game.equip(1, CardKind::Dynamite);
        safe_end(&mut game);
        kill(&mut game, 1, 2);
        assert!(game.state.dynamite_round.is_none());
        if vulture {
            assert!(game.state.players[3].hand.contains(&dynamite));
            game.state.turn.player = PlayerId(3);
            game.act(
                3,
                Action::Play {
                    card: dynamite,
                    target: None,
                },
            );
            assert_eq!(
                game.state.dynamite_round.as_ref().unwrap().remaining,
                vec![PlayerId(3), PlayerId(0), PlayerId(1)]
            );
        } else {
            assert!(game.state.discard_pile.contains(&dynamite));
        }
    }
}

#[test]
fn club_dynamite_removed_by_panic_or_cat_balou_ends_old_round() {
    for kind in [CardKind::Panic, CardKind::CatBalou] {
        let mut game = club();
        let dynamite = game.equip(1, CardKind::Dynamite);
        safe_end(&mut game);
        let card = game.give(1, kind);
        game.act(
            1,
            Action::AffectCard {
                card,
                target: PlayerId(2),
                selection: CardSelection::InPlay(dynamite),
            },
        );
        assert!(game.state.dynamite_round.is_none());
        if kind == CardKind::Panic {
            game.act(
                1,
                Action::Play {
                    card: dynamite,
                    target: None,
                },
            );
            assert_eq!(
                game.state.dynamite_round.as_ref().unwrap().remaining,
                vec![PlayerId(1), PlayerId(2), PlayerId(3), PlayerId(0)]
            );
        } else {
            assert!(game.state.discard_pile.contains(&dynamite));
        }
    }
}

#[test]
fn club_jail_stays_for_three_failed_turns_and_releases_without_a_fourth_check() {
    let mut game = club();
    let jail = play(&mut game, 0, CardKind::Jail, Some(1));
    for served in 1..=3 {
        to_turn(&mut game, 0);
        game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
        let events = game.end();
        assert_eq!(game.state.turn.player, PlayerId(2));
        assert!(game.state.players[1].in_play.contains(&jail));
        assert_eq!(game.state.players[1].jail_turns_served, served);
        assert!(game.state.players[1].hand.is_empty());
        for player in [
            spectator_view(&game.state).players[1].clone(),
            view(&game.state, PlayerId(0)).unwrap().table.players[1].clone(),
        ] {
            assert_eq!(player.jail_turns_left, Some(3 - served));
        }
        assert!(has_event(
            &events,
            |event| matches!(event, EventKind::JailHeld { turns_left, .. } if *turns_left == 3 - served)
        ));
        // Return only the public check card to the draw pile for the next forced check.
        let check = game
            .state
            .discard_pile
            .iter()
            .position(|card| {
                card.card().unwrap()
                    == Card {
                        kind: CardKind::Missed,
                        suit: Suit::Spades,
                        rank: Rank::Two,
                    }
            })
            .unwrap();
        let card = game.state.discard_pile.remove(check);
        game.state.draw_pile.insert(0, card);
    }
    to_turn(&mut game, 0);
    let events = game.end();
    assert_eq!(game.state.turn.player, PlayerId(1));
    assert_eq!(game.state.players[1].hand.len(), 2);
    assert!(game.state.discard_pile.contains(&jail));
    assert_eq!(game.state.players[1].jail_turns_served, 0);
    assert_eq!(spectator_view(&game.state).players[1].jail_turns_left, None);
    assert!(has_event(&events, |event| matches!(
        event,
        EventKind::JailExpired {
            player: PlayerId(1)
        }
    )));
    assert!(!has_event(&events, |event| matches!(
        event,
        EventKind::DrawRevealed {
            reason: CardKind::Jail,
            ..
        }
    )));
}

#[test]
fn club_jail_heart_escape_and_removal_reset_progress_and_classic_still_discards_on_failure() {
    for mode in [GameMode::Club, GameMode::Classic] {
        for hearts in [false, true] {
            let mut game = club();
            game.state.config.mode = mode;
            let jail = game.equip(1, CardKind::Jail);
            game.top_face(
                if hearts {
                    CardKind::Beer
                } else {
                    CardKind::Missed
                },
                if hearts { Suit::Hearts } else { Suit::Spades },
                if hearts { Rank::Six } else { Rank::Two },
            );
            game.end();
            if mode == GameMode::Club && !hearts {
                assert_eq!(game.state.players[1].jail_turns_served, 1);
                to_turn(&mut game, 0);
                let panic = game.give(0, CardKind::Panic);
                game.act(
                    0,
                    Action::AffectCard {
                        card: panic,
                        target: PlayerId(1),
                        selection: CardSelection::InPlay(jail),
                    },
                );
                assert_eq!(game.state.players[1].jail_turns_served, 0);
                game.act(
                    0,
                    Action::Play {
                        card: jail,
                        target: Some(PlayerId(2)),
                    },
                );
                assert_eq!(
                    spectator_view(&game.state).players[2].jail_turns_left,
                    Some(3)
                );
            } else {
                assert!(game.state.discard_pile.contains(&jail));
                assert_eq!(game.state.players[1].jail_turns_served, 0);
                assert_eq!(game.state.turn.player, PlayerId(if hearts { 1 } else { 2 }));
            }
        }
    }
}

#[test]
fn club_dynamite_precedes_jail_and_jail_does_not_block_the_dynamite_round() {
    let mut game = club();
    game.equip(1, CardKind::Jail);
    let dynamite = game.equip(1, CardKind::Dynamite);
    game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
    game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
    game.top_face(CardKind::Beer, Suit::Hearts, Rank::Seven);
    let events = game.end();
    let reveals: Vec<_> = events
        .iter()
        .filter_map(|event| match event.kind {
            EventKind::DrawRevealed { player, reason, .. } => Some((player.0, reason)),
            _ => None,
        })
        .collect();
    assert_eq!(
        reveals,
        vec![
            (1, CardKind::Dynamite),
            (1, CardKind::Jail),
            (2, CardKind::Dynamite)
        ]
    );
    assert_eq!(game.state.players[1].jail_turns_served, 1);
    assert!(game.state.players[3].in_play.contains(&dynamite));
}

#[test]
fn club_lucky_dynamite_and_jail_survive_serialization_dying_and_stale_choices() {
    let mut game = club();
    game.character(1, Character::LuckyDuke);
    let dynamite = game.equip(1, CardKind::Dynamite);
    let jail = game.equip(1, CardKind::Jail);
    game.state.players[1].health = 3;
    let beer = game.give(1, CardKind::Beer);
    game.top_face(CardKind::Beer, Suit::Hearts, Rank::Seven);
    let explosion = game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
    game.end();
    let pending_id = game.state.pending.last().unwrap().id;
    game.state = serde_json::from_str(&serde_json::to_string(&game.state).unwrap()).unwrap();
    let events = game.act(
        1,
        Action::ChooseDrawResult {
            pending_id,
            card: explosion,
        },
    );
    assert!(has_event(&events, |event| matches!(
        event,
        EventKind::HealthChanged {
            source: None,
            delta: -3,
            ..
        }
    )));
    assert!(game.state.dynamite_round.is_none());
    assert!(game.state.discard_pile.contains(&dynamite));
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::Dying { .. }
    ));
    game.reject(
        1,
        Action::ChooseDrawResult {
            pending_id,
            card: explosion,
        },
        ActionError::StalePending,
    );
    game.top_face(CardKind::Beer, Suit::Hearts, Rank::Eight);
    let failure = game.top_face(CardKind::Missed, Suit::Spades, Rank::Three);
    game.respond(Some(beer));
    let pending_id = game.state.pending.last().unwrap().id;
    let original = game.state.clone();
    let original_rng = game.rng.clone();
    game.state = serde_json::from_str(&serde_json::to_string(&game.state).unwrap()).unwrap();
    let events = game.act(
        1,
        Action::ChooseDrawResult {
            pending_id,
            card: failure,
        },
    );
    let mut replay = original;
    let mut rng = original_rng;
    assert_eq!(
        events,
        apply(
            &mut replay,
            PlayerId(1),
            Action::ChooseDrawResult {
                pending_id,
                card: failure
            },
            &mut rng
        )
        .unwrap()
    );
    assert_eq!(game.state, replay);
    assert!(game.state.players[1].in_play.contains(&jail));
    assert_eq!(game.state.players[1].jail_turns_served, 1);
}

#[test]
fn club_weapons_stack_use_max_range_and_recompute_when_each_weapon_leaves() {
    for mode in [GameMode::Club, GameMode::Classic] {
        let mut game = club();
        game.state.config.mode = mode;
        let volcanic = play(&mut game, 0, CardKind::Volcanic, None);
        let winchester = play(&mut game, 0, CardKind::Winchester, None);
        assert_eq!(game.state.players[0].weapon_range(), 5);
        assert_eq!(
            game.state.players[0].unlimited_bangs(),
            mode == GameMode::Club
        );
        assert_eq!(
            game.state.players[0].in_play.contains(&volcanic),
            mode == GameMode::Club
        );
        if mode == GameMode::Classic {
            assert!(game.state.discard_pile.contains(&volcanic));
            continue;
        }
        game.shoot(0, 1);
        game.respond(None);
        game.shoot(0, 1);
        game.respond(None);
        let remington = play(&mut game, 0, CardKind::Remington, None);
        for (weapon, kind, range) in [
            (winchester, CardKind::Panic, 3),
            (remington, CardKind::CatBalou, 1),
            (volcanic, CardKind::CatBalou, 1),
        ] {
            let card = game.give(0, kind);
            game.act(
                0,
                Action::AffectCard {
                    card,
                    target: PlayerId(0),
                    selection: CardSelection::InPlay(weapon),
                },
            );
            assert_eq!(game.state.players[0].weapon_range(), range);
            assert_eq!(spectator_view(&game.state).players[0].weapon_range, range);
        }
        let bang = game.give(0, CardKind::Bang);
        game.reject(
            0,
            Action::Play {
                card: bang,
                target: Some(PlayerId(1)),
            },
            ActionError::BangLimit,
        );
        play(&mut game, 0, CardKind::Schofield, None);
        let duplicate = game.give(0, CardKind::Schofield);
        game.reject(
            0,
            Action::Play {
                card: duplicate,
                target: None,
            },
            ActionError::DuplicateInPlay,
        );
    }
}

#[test]
fn club_seeded_games_preserve_cards_metadata_and_replay() {
    for count in 4..=7 {
        for seed in 0..16 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let (mut state, _) = setup(
                count,
                GameConfig {
                    mode: GameMode::Club,
                    roles: RoleCounts::standard(count),
                },
                &mut rng,
            )
            .unwrap();
            let mut replay = state.clone();
            let mut replay_rng = rng.clone();
            let mut bot = ChaCha8Rng::seed_from_u64(seed + 500);
            for step in 0..10_000 {
                invariant(&state);
                for player in &state.players {
                    assert!(player.jail_turns_served <= 3);
                    if !player.has_in_play(CardKind::Jail) {
                        assert_eq!(player.jail_turns_served, 0);
                    }
                }
                if let Some(round) = &state.dynamite_round {
                    assert_eq!(
                        state
                            .players
                            .iter()
                            .filter(|p| p.in_play.contains(&round.card))
                            .count(),
                        1
                    );
                }
                if state.winner.is_some() {
                    break;
                }
                let actions = legal_actions(&state);
                let (player, action) = actions[bot.random_range(0..actions.len())].clone();
                let events = apply(&mut state, player, action.clone(), &mut rng).unwrap();
                assert_eq!(
                    events,
                    apply(&mut replay, player, action, &mut replay_rng).unwrap()
                );
                assert_eq!(state, replay);
                if step % 17 == 0 {
                    state = serde_json::from_str(&serde_json::to_string(&state).unwrap()).unwrap();
                }
            }
            assert!(
                state.winner.is_some(),
                "Club game count={count} seed={seed} must finish"
            );
            invariant(&state);
        }
    }
}

#[test]
fn club_dynamite_death_removes_round_and_jail_without_a_killer() {
    let mut game = club();
    let dynamite = game.equip(1, CardKind::Dynamite);
    let jail = game.equip(1, CardKind::Jail);
    game.state.players[1].health = 3;
    game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
    game.end();
    let events = game.respond(None);
    assert!(!game.state.players[1].alive);
    assert!(game.state.dynamite_round.is_none());
    assert!(game.state.discard_pile.contains(&dynamite));
    assert!(game.state.discard_pile.contains(&jail));
    assert_eq!(game.state.players[1].jail_turns_served, 0);
    assert!(!has_event(&events, |event| matches!(
        event,
        EventKind::BountyAwarded { .. }
            | EventKind::SheriffPenalized { .. }
            | EventKind::DrawRevealed {
                reason: CardKind::Jail,
                ..
            }
    )));
}

#[test]
fn club_jailed_player_can_defend_then_escape_on_a_later_heart() {
    let mut game = club();
    let jail = game.equip(1, CardKind::Jail);
    game.top_face(CardKind::Missed, Suit::Spades, Rank::Two);
    game.end();
    game.shoot(2, 1);
    let missed = game.give(1, CardKind::Missed);
    game.respond(Some(missed));
    assert_eq!(game.state.players[1].health, 4);
    assert_eq!(game.state.players[1].jail_turns_served, 1);
    to_turn(&mut game, 0);
    game.top_face(CardKind::Beer, Suit::Hearts, Rank::Six);
    game.end();
    assert!(game.state.discard_pile.contains(&jail));
    assert_eq!(game.state.turn.player, PlayerId(1));
    assert_eq!(game.state.players[1].jail_turns_served, 0);
    assert_eq!(game.state.players[1].hand.len(), 2);
}

#[test]
fn club_jail_removal_or_inheritance_never_keeps_old_served_turns() {
    for vulture in [false, true] {
        let mut game = club();
        if vulture {
            game.character(3, Character::VultureSam);
        }
        let jail = game.equip(1, CardKind::Jail);
        game.state.players[1].jail_turns_served = 2;
        kill(&mut game, 0, 1);
        assert_eq!(game.state.players[1].jail_turns_served, 0);
        if vulture {
            assert!(game.state.players[3].hand.contains(&jail));
            game.state.turn.player = PlayerId(3);
            game.act(
                3,
                Action::Play {
                    card: jail,
                    target: Some(PlayerId(2)),
                },
            );
            assert_eq!(
                spectator_view(&game.state).players[2].jail_turns_left,
                Some(3)
            );
        } else {
            assert!(game.state.discard_pile.contains(&jail));
        }
    }
    let mut game = club();
    let jail = game.equip(1, CardKind::Jail);
    game.state.players[1].jail_turns_served = 2;
    let cat = game.give(0, CardKind::CatBalou);
    game.act(
        0,
        Action::AffectCard {
            card: cat,
            target: PlayerId(1),
            selection: CardSelection::InPlay(jail),
        },
    );
    assert_eq!(game.state.players[1].jail_turns_served, 0);
    assert!(game.state.discard_pile.contains(&jail));
}

#[test]
fn club_empty_jail_draw_still_loses_the_turn_and_emits_public_progress() {
    let mut game = club();
    game.equip(1, CardKind::Jail);
    game.state.players[2].hand.append(&mut game.state.draw_pile);
    let events = game.end();
    assert!(has_event(&events, |event| matches!(
        event,
        EventKind::JailHeld {
            player: PlayerId(1),
            turns_left: 2
        }
    )));
    assert!(!has_event(&events, |event| matches!(
        event,
        EventKind::DrawRevealed {
            reason: CardKind::Jail,
            ..
        }
    )));
    let public = serde_json::to_value(spectator_view(&game.state)).unwrap();
    assert_eq!(public["players"][1]["jail_turns_left"], 2);
    assert!(public["players"][0].get("jail_turns_left").is_none());
    game.state.config.mode = GameMode::Classic;
    let classic = serde_json::to_value(spectator_view(&game.state)).unwrap();
    assert!(classic["players"][1].get("jail_turns_left").is_none());
}
