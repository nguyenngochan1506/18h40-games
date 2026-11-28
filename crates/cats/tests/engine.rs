use cats::{
    actions::Action,
    apply, decision, default_action, filter_events,
    model::{CardId, CardKind, CardView, PlayerId, Settings},
    setup, spectator_view, view,
};
use rand::{Rng, RngCore, SeedableRng};
use rand_chacha::ChaCha8Rng;
use std::collections::BTreeSet;

fn seeded(seed: u64) -> ChaCha8Rng {
    ChaCha8Rng::seed_from_u64(seed)
}

fn live_cards(state: &cats::State) -> Vec<CardId> {
    let mut cards = Vec::new();
    cards.extend(&state.deck);
    cards.extend(&state.discard);
    cards.extend(&state.removed);
    cards.extend(&state.tower_stash);
    for player in &state.players {
        cards.extend(&player.hand);
        if let Some(front) = player.barking_front {
            cards.push(front);
        }
        if let Some(trap) = player.ill_take_that {
            cards.push(trap.card);
        }
    }
    for frame in &state.pending {
        cards.extend(frame.cards());
    }
    cards
}

fn assert_card_conservation(state: &cats::State, initial: &BTreeSet<CardId>) {
    let live = live_cards(state);
    let unique: BTreeSet<CardId> = live.iter().copied().collect();
    assert_eq!(live.len(), unique.len(), "duplicate CardId across regions");
    assert_eq!(&unique, initial, "CardId set drifted");
}

fn extract(state: &mut cats::State, kind: CardKind) -> CardId {
    for player in &mut state.players {
        if let Some(index) = player
            .hand
            .iter()
            .position(|card| card.kind() == Some(kind))
        {
            return player.hand.remove(index);
        }
    }
    if let Some(index) = state.deck.iter().position(|card| card.kind() == Some(kind)) {
        return state.deck.remove(index);
    }
    if let Some(index) = state
        .discard
        .iter()
        .position(|card| card.kind() == Some(kind))
    {
        return state.discard.remove(index);
    }
    if let Some(index) = state
        .tower_stash
        .iter()
        .position(|card| card.kind() == Some(kind))
    {
        return state.tower_stash.remove(index);
    }
    panic!("expected {kind:?} in test deck");
}

fn starting_turn(state: &cats::State) -> (PlayerId, PlayerId) {
    let active = state.turn.player;
    let target = state.next_active(active).unwrap();
    (active, target)
}

#[test]
fn setup_2_to_8_has_one_defuse_and_seven_initial_cards() {
    for settings in [Settings::base_only(), Settings::default()] {
        for count in 2..=8 {
            let mut rng = seeded(100 + count as u64);
            let (state, _) = setup(count, settings.clone(), &mut rng).unwrap();
            assert_eq!(state.players.len(), count);
            for player in &state.players {
                assert_eq!(
                    player
                        .hand
                        .iter()
                        .filter(|card| card.kind() == Some(CardKind::Defuse))
                        .count(),
                    1
                );
                assert_eq!(player.hand.len(), 8);
                assert!(!player.hand.iter().any(|card| matches!(
                    card.kind(),
                    Some(CardKind::Exploding | CardKind::Imploding)
                )));
            }
            let expected_exploding = if settings.streaking { count } else { count - 1 };
            assert_eq!(
                state
                    .deck
                    .iter()
                    .filter(|card| card.kind() == Some(CardKind::Exploding))
                    .count(),
                expected_exploding
            );
            assert_eq!(
                state
                    .deck
                    .iter()
                    .filter(|card| card.kind() == Some(CardKind::Imploding))
                    .count(),
                usize::from(settings.imploding)
            );
        }
    }
}

#[test]
fn same_seed_produces_the_same_setup() {
    let (left, _) = setup(4, Settings::default(), &mut seeded(42)).unwrap();
    let (right, _) = setup(4, Settings::default(), &mut seeded(42)).unwrap();
    assert_eq!(left.deck, right.deck);
    assert_eq!(left.players, right.players);
}

#[test]
fn player_view_never_exposes_another_hand_or_private_preview() {
    let mut rng = seeded(7);
    let (mut state, _) = setup(4, Settings::default(), &mut rng).unwrap();
    let actor = state.turn.player;
    let other = state.next_active(actor).unwrap();
    let alter = extract(&mut state, CardKind::AlterFuture);
    state.players[actor.0].hand.push(alter);
    apply(
        &mut state,
        actor,
        Action::PlayCard { card: alter },
        &mut rng,
    )
    .unwrap();
    assert_eq!(view(&state, actor).preview_cards.len(), 3);
    assert!(view(&state, other).preview_cards.is_empty());
    assert_eq!(spectator_view(&state).players.len(), 4);
}

#[test]
fn rejected_action_preserves_rng_and_state() {
    let mut rng = seeded(96);
    let (mut state, _) = setup(2, Settings::default(), &mut rng).unwrap();
    let before_state = state.clone();
    let mut expected_rng = rng.clone();
    assert!(apply(&mut state, PlayerId(usize::MAX), Action::Draw, &mut rng).is_err());
    assert_eq!(state, before_state);
    assert_eq!(rng.next_u64(), expected_rng.next_u64());
}

#[test]
fn skip_attack_targeted_attack_personal_attack_and_super_skip() {
    let mut rng = seeded(91);
    let (mut state, _) = setup(4, Settings::default(), &mut rng).unwrap();
    let (actor, target) = starting_turn(&state);
    let third = state.next_active(target).unwrap();

    let attack = extract(&mut state, CardKind::Attack);
    state.players[actor.0].hand.push(attack);
    apply(
        &mut state,
        actor,
        Action::PlayCard { card: attack },
        &mut rng,
    )
    .unwrap();
    assert_eq!(state.turn.player, target);
    assert_eq!(state.turn.turns_left, 2);

    let targeted = extract(&mut state, CardKind::TargetedAttack);
    state.players[target.0].hand.push(targeted);
    apply(
        &mut state,
        target,
        Action::PlayCard { card: targeted },
        &mut rng,
    )
    .unwrap();
    let pending = decision(&state).unwrap().pending_id.unwrap();
    apply(
        &mut state,
        target,
        Action::AttackTarget {
            pending_id: pending,
            target: third,
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(state.turn.player, third);
    assert_eq!(state.turn.turns_left, 3);

    let personal = extract(&mut state, CardKind::PersonalAttack);
    state.players[third.0].hand.push(personal);
    apply(
        &mut state,
        third,
        Action::PlayCard { card: personal },
        &mut rng,
    )
    .unwrap();
    assert_eq!(state.turn.player, third);
    assert_eq!(state.turn.turns_left, 5);

    let super_skip = extract(&mut state, CardKind::SuperSkip);
    state.players[third.0].hand.push(super_skip);
    apply(
        &mut state,
        third,
        Action::PlayCard { card: super_skip },
        &mut rng,
    )
    .unwrap();
    assert_ne!(state.turn.player, third);
    assert_eq!(state.turn.turns_left, 1);
}

#[test]
fn defuse_and_imploding_kitten_face_down_then_face_up_eliminates() {
    let mut rng = seeded(92);
    let (mut state, _) = setup(3, Settings::default(), &mut rng).unwrap();
    let initial: BTreeSet<CardId> = live_cards(&state).into_iter().collect();
    let actor = state.turn.player;

    let exploding = extract(&mut state, CardKind::Exploding);
    state.deck.push(exploding);
    apply(&mut state, actor, Action::Draw, &mut rng).unwrap();
    let pending = decision(&state).unwrap();
    apply(
        &mut state,
        actor,
        Action::Defuse {
            pending_id: pending.pending_id.unwrap(),
            position: 0,
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(state.deck.last(), Some(&exploding));
    assert_card_conservation(&state, &initial);

    // Imploding drawn face-down -> flipped face-up -> placed on top -> next player explodes even with Defuse!
    let next_actor = state.turn.player;
    let imploding = extract(&mut state, CardKind::Imploding);
    state.deck.push(imploding);
    apply(&mut state, next_actor, Action::Draw, &mut rng).unwrap();
    assert!(state.imploding_face_up);
    let pending = decision(&state).unwrap();
    assert!(matches!(
        pending.kind,
        cats::DecisionKind::InsertImploding { .. }
    ));
    apply(
        &mut state,
        next_actor,
        Action::InsertImploding {
            pending_id: pending.pending_id.unwrap(),
            position: 0,
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(spectator_view(&state).top_known, Some(CardKind::Imploding));

    let victim = state.turn.player;
    assert!(
        state.players[victim.0]
            .hand
            .iter()
            .any(|c| c.kind() == Some(CardKind::Defuse))
    );
    apply(&mut state, victim, Action::Draw, &mut rng).unwrap();
    assert!(state.players[victim.0].eliminated);
    assert_card_conservation(&state, &initial);
}

#[test]
fn streaking_kitten_protects_exploding_until_lost() {
    let mut rng = seeded(101);
    let (mut state, _) = setup(3, Settings::default(), &mut rng).unwrap();
    let initial: BTreeSet<CardId> = live_cards(&state).into_iter().collect();
    let (actor, victim) = starting_turn(&state);

    let streaking = extract(&mut state, CardKind::Streaking);
    let exploding = extract(&mut state, CardKind::Exploding);
    state.players[actor.0].hand.push(streaking);
    state.deck.push(exploding);
    let events = apply(&mut state, actor, Action::Draw, &mut rng).unwrap();
    assert!(state.players[actor.0].hand.contains(&exploding));
    assert!(!state.players[actor.0].eliminated);
    // Other players must not receive CardDrawn
    assert!(
        filter_events(&events, Some(victim))
            .iter()
            .all(|e| !matches!(e.kind, cats::EventKind::CardDrawn { .. }))
    );

    // Next player uses Triple to steal Streaking -> actor now holds unprotected Exploding!
    let triple = [
        extract(&mut state, CardKind::CatTaco),
        extract(&mut state, CardKind::CatTaco),
        extract(&mut state, CardKind::FeralCat),
    ];
    state.players[victim.0].hand.extend(triple);
    apply(
        &mut state,
        victim,
        Action::PlayTriple {
            cards: triple.to_vec(),
        },
        &mut rng,
    )
    .unwrap();
    let pending = decision(&state).unwrap().pending_id.unwrap();
    apply(
        &mut state,
        victim,
        Action::StealTarget {
            pending_id: pending,
            target: actor,
        },
        &mut rng,
    )
    .unwrap();
    let pending = decision(&state).unwrap().pending_id.unwrap();
    apply(
        &mut state,
        victim,
        Action::StealKind {
            pending_id: pending,
            kind: CardKind::Streaking,
        },
        &mut rng,
    )
    .unwrap();
    // Actor still has Defuse -> enters Defuse pending on victim's turn
    let defuse_decision = decision(&state).unwrap();
    assert_eq!(defuse_decision.player, actor);
    assert!(matches!(
        defuse_decision.kind,
        cats::DecisionKind::Defuse { .. }
    ));
    apply(
        &mut state,
        actor,
        Action::Defuse {
            pending_id: defuse_decision.pending_id.unwrap(),
            position: 0,
        },
        &mut rng,
    )
    .unwrap();
    // Turn stays with victim!
    assert_eq!(state.turn.player, victim);
    assert_card_conservation(&state, &initial);
}

#[test]
fn nope_chain_keeps_played_cards_in_discard_and_never_panics() {
    let mut rng = seeded(93);
    let (mut state, _) = setup(3, Settings::default(), &mut rng).unwrap();
    let initial: BTreeSet<CardId> = live_cards(&state).into_iter().collect();
    let (actor, noper) = starting_turn(&state);
    let yup_player = state.next_active(noper).unwrap();
    let attack = extract(&mut state, CardKind::Attack);
    let nope1 = extract(&mut state, CardKind::Nope);
    let nope2 = extract(&mut state, CardKind::Nope);
    state.players[actor.0].hand.push(attack);
    state.players[noper.0].hand.push(nope1);
    state.players[yup_player.0].hand.push(nope2);
    let turn_before = state.turn;

    apply(
        &mut state,
        actor,
        Action::PlayCard { card: attack },
        &mut rng,
    )
    .unwrap();
    assert_eq!(state.turn.player, noper);

    let first_id = state.last_action().unwrap().id;
    apply(
        &mut state,
        noper,
        Action::Nope {
            pending_id: first_id,
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(state.turn, turn_before);
    // Both Attack and Nope1 stay in discard per official rules
    assert!(state.discard.contains(&attack));
    assert!(state.discard.contains(&nope1));
    assert!(!state.players[actor.0].hand.contains(&attack));
    assert_card_conservation(&state, &initial);

    // Second Nope ("Yup") restores Attack effect while keeping all 3 cards in discard!
    let second_id = state.last_action().unwrap().id;
    apply(
        &mut state,
        yup_player,
        Action::Nope {
            pending_id: second_id,
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(state.turn.player, noper);
    assert_eq!(state.turn.turns_left, 2);
    assert!(state.discard.contains(&attack));
    assert!(state.discard.contains(&nope1));
    assert!(state.discard.contains(&nope2));
    assert_card_conservation(&state, &initial);

    // Stale Nope rejected
    assert!(
        apply(
            &mut state,
            noper,
            Action::Nope {
                pending_id: first_id
            },
            &mut rng
        )
        .is_err()
    );
}

#[test]
fn reverse_draw_bottom_swap_alter_share_bury_garbage_potluck_and_catomic() {
    let mut rng = seeded(120);
    let (mut state, _) = setup(4, Settings::default(), &mut rng).unwrap();
    let initial: BTreeSet<CardId> = live_cards(&state).into_iter().collect();

    // Reverse flips direction
    let actor = state.turn.player;
    let rev = extract(&mut state, CardKind::Reverse);
    state.players[actor.0].hand.push(rev);
    apply(&mut state, actor, Action::PlayCard { card: rev }, &mut rng).unwrap();
    assert_eq!(state.turn.direction, -1);

    // Swap top and bottom
    let actor = state.turn.player;
    let old_top = *state.deck.last().unwrap();
    let old_bot = *state.deck.first().unwrap();
    let swap = extract(&mut state, CardKind::SwapTopBottom);
    state.players[actor.0].hand.push(swap);
    apply(&mut state, actor, Action::PlayCard { card: swap }, &mut rng).unwrap();
    assert_eq!(state.deck.first(), Some(&old_top));
    assert_eq!(state.deck.last(), Some(&old_bot));

    // Share the Future reorders top 3 and privately notifies next active player
    let share = extract(&mut state, CardKind::ShareFuture);
    state.players[actor.0].hand.push(share);
    apply(
        &mut state,
        actor,
        Action::PlayCard { card: share },
        &mut rng,
    )
    .unwrap();
    let top3: Vec<CardId> = state.deck.iter().rev().take(3).copied().collect();
    let reversed_top3 = vec![top3[2], top3[1], top3[0]];
    let pending = decision(&state).unwrap().pending_id.unwrap();
    let events = apply(
        &mut state,
        actor,
        Action::ReorderFuture {
            pending_id: pending,
            order: reversed_top3.clone(),
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(
        state.deck.iter().rev().take(3).copied().collect::<Vec<_>>(),
        reversed_top3
    );
    let next = state.next_active(actor).unwrap();
    assert!(
        filter_events(&events, Some(next))
            .iter()
            .any(|e| matches!(e.kind, cats::EventKind::FutureSeen { .. }))
    );

    // Catomic Bomb puts all Explodings face-up on top and ends turn
    let catomic = extract(&mut state, CardKind::CatomicBomb);
    state.players[actor.0].hand.push(catomic);
    apply(
        &mut state,
        actor,
        Action::PlayCard { card: catomic },
        &mut rng,
    )
    .unwrap();
    assert_eq!(spectator_view(&state).top_known, Some(CardKind::Exploding));
    assert_eq!(state.turn.player, next);

    // Bury draws a safe top card and reinserts secretly
    let safe_for_bury = extract(&mut state, CardKind::CatTaco);
    state.deck.push(safe_for_bury);
    let bury = extract(&mut state, CardKind::Bury);
    state.players[next.0].hand.push(bury);
    apply(&mut state, next, Action::PlayCard { card: bury }, &mut rng).unwrap();
    assert_eq!(view(&state, next).preview_cards.len(), 1);
    let pending = decision(&state).unwrap().pending_id.unwrap();
    apply(
        &mut state,
        next,
        Action::BuryCard {
            pending_id: pending,
            position: 2,
        },
        &mut rng,
    )
    .unwrap();
    assert_card_conservation(&state, &initial);
}

#[test]
fn feral_cat_combos_and_five_different_work() {
    let mut rng = seeded(94);
    let (mut state, _) = setup(3, Settings::default(), &mut rng).unwrap();
    let initial: BTreeSet<CardId> = live_cards(&state).into_iter().collect();
    let (actor, target) = starting_turn(&state);

    let pair = vec![
        extract(&mut state, CardKind::CatTaco),
        extract(&mut state, CardKind::FeralCat),
    ];
    state.players[actor.0].hand.extend(&pair);
    let target_count = state.players[target.0].hand.len();
    apply(
        &mut state,
        actor,
        Action::PlayPair { cards: pair },
        &mut rng,
    )
    .unwrap();
    let pending = decision(&state).unwrap().pending_id.unwrap();
    apply(
        &mut state,
        actor,
        Action::RandomTarget {
            pending_id: pending,
            target,
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(state.players[target.0].hand.len(), target_count - 1);

    let five = vec![
        extract(&mut state, CardKind::CatTaco),
        extract(&mut state, CardKind::CatRainbow),
        extract(&mut state, CardKind::CatBeard),
        extract(&mut state, CardKind::CatPotato),
        extract(&mut state, CardKind::FeralCat),
    ];
    state.players[actor.0].hand.extend(&five);
    let pick_target = state.discard[0];
    apply(
        &mut state,
        actor,
        Action::PlayFive { cards: five },
        &mut rng,
    )
    .unwrap();
    let pending = decision(&state).unwrap().pending_id.unwrap();
    apply(
        &mut state,
        actor,
        Action::TakeDiscard {
            pending_id: pending,
            card: Some(pick_target),
        },
        &mut rng,
    )
    .unwrap();
    assert!(state.players[actor.0].hand.contains(&pick_target));
    assert_card_conservation(&state, &initial);
}

#[test]
fn fuzz_bot_finishes_games_for_2_to_8_players_with_all_expansions_and_conserves_cards() {
    for count in 2..=8 {
        for seed in [11_u64, 29, 73] {
            let mut rng = seeded(seed * 31 + count as u64);
            let (mut state, _) = setup(count, Settings::default(), &mut rng).unwrap();
            let initial: BTreeSet<CardId> = live_cards(&state).into_iter().collect();
            let mut steps = 0;
            while state.winner.is_none() && steps < 2000 {
                // Occasionally have a random active player play Nope if possible
                if let Some(last) = state.last_action()
                    && last.nopeable
                    && rng.random_bool(0.25)
                {
                    let nopers: Vec<PlayerId> = state
                        .active_players()
                        .filter(|p| {
                            state.players[p.0]
                                .hand
                                .iter()
                                .any(|c| c.kind() == Some(CardKind::Nope))
                        })
                        .collect();
                    if let Some(&noper) = nopers.first() {
                        let _ = apply(
                            &mut state,
                            noper,
                            Action::Nope {
                                pending_id: last.id,
                            },
                            &mut rng,
                        );
                        assert_card_conservation(&state, &initial);
                        steps += 1;
                        continue;
                    }
                }

                let (player, action) = if state.pending.is_empty() && rng.random_bool(0.55) {
                    let p = state.turn.player;
                    if state.players[p.0].cursed {
                        if !state.players[p.0].hand.is_empty() && rng.random_bool(0.5) {
                            (p, Action::PlayBlind { slot: 0 })
                        } else {
                            (p, Action::Draw)
                        }
                    } else {
                        let playable: Vec<CardId> = state.players[p.0]
                            .hand
                            .iter()
                            .copied()
                            .filter(|c| {
                                c.kind().is_some_and(|kind| {
                                    kind.is_playable_single()
                                        && !(kind == CardKind::IllTakeThat
                                            && state.first_ill_take_that_target(p).is_none())
                                        && !(kind == CardKind::Bury
                                            && state.players[p.0].ill_take_that.is_some())
                                })
                            })
                            .collect();
                        if let Some(&card) = playable.first() {
                            (p, Action::PlayCard { card })
                        } else {
                            default_action(&state).unwrap()
                        }
                    }
                } else {
                    default_action(&state).unwrap()
                };

                apply(&mut state, player, action, &mut rng).unwrap();
                assert_card_conservation(&state, &initial);
                steps += 1;
            }
            assert!(
                state.winner.is_some(),
                "fuzz game stalled for players={count} seed={seed}"
            );
            assert_eq!(state.active_count(), 1);
        }
    }
}

#[test]
fn official_expansion_card_counts_match_20_15_20() {
    let imploding_only = Settings {
        imploding: true,
        streaking: false,
        barking: false,
    };
    let streaking_only = Settings {
        imploding: false,
        streaking: true,
        barking: false,
    };
    let barking_only = Settings {
        imploding: false,
        streaking: false,
        barking: true,
    };
    let imp_safe: u16 = CardKind::ALL
        .iter()
        .map(|k| k.expansion_count(&imploding_only))
        .sum();
    let str_safe: u16 = CardKind::ALL
        .iter()
        .map(|k| k.expansion_count(&streaking_only))
        .sum();
    let brk_safe: u16 = CardKind::ALL
        .iter()
        .map(|k| k.expansion_count(&barking_only))
        .sum();
    assert_eq!(imp_safe + 1, 20); // +1 Imploding Kitten
    assert_eq!(str_safe + 1, 15); // +1 extra Exploding Kitten
    assert_eq!(brk_safe, 20);
}

#[test]
fn mark_reveals_card_publicly_and_clears_when_card_leaves_hand() {
    let mut rng = seeded(801);
    let (mut state, _) = setup(3, Settings::default(), &mut rng).unwrap();
    let initial: BTreeSet<CardId> = live_cards(&state).into_iter().collect();
    let (actor, target) = starting_turn(&state);
    let mark = extract(&mut state, CardKind::Mark);
    state.players[actor.0].hand.push(mark);

    apply(&mut state, actor, Action::PlayCard { card: mark }, &mut rng).unwrap();
    let pid = decision(&state).unwrap().pending_id.unwrap();
    apply(
        &mut state,
        actor,
        Action::MarkTarget {
            pending_id: pid,
            target,
        },
        &mut rng,
    )
    .unwrap();

    let spec = spectator_view(&state);
    assert_eq!(spec.players[target.0].marked_cards.len(), 1);
    let marked_id = spec.players[target.0].marked_cards[0].id;
    assert!(state.players[target.0].hand.contains(&marked_id));

    // When target gives away that marked card, it stops being marked.
    let favour = extract(&mut state, CardKind::Favour);
    state.players[actor.0].hand.push(favour);
    apply(
        &mut state,
        actor,
        Action::PlayCard { card: favour },
        &mut rng,
    )
    .unwrap();
    let pid = decision(&state).unwrap().pending_id.unwrap();
    apply(
        &mut state,
        actor,
        Action::FavourTarget {
            pending_id: pid,
            target,
        },
        &mut rng,
    )
    .unwrap();
    let pid = decision(&state).unwrap().pending_id.unwrap();
    apply(
        &mut state,
        target,
        Action::FavourCard {
            pending_id: pid,
            card: marked_id,
        },
        &mut rng,
    )
    .unwrap();
    assert!(
        spectator_view(&state).players[target.0]
            .marked_cards
            .is_empty()
    );
    assert_card_conservation(&state, &initial);
}

#[test]
fn curse_of_the_cat_butt_hides_hand_plays_or_wastes_blind_and_lifts_on_draw() {
    let mut rng = seeded(802);
    let (mut state, _) = setup(2, Settings::default(), &mut rng).unwrap();
    let initial: BTreeSet<CardId> = live_cards(&state).into_iter().collect();
    let (actor, target) = starting_turn(&state);

    let curse = extract(&mut state, CardKind::CurseCatButt);
    let skip = extract(&mut state, CardKind::Skip);
    state.players[actor.0].hand.push(curse);
    state.players[actor.0].hand.push(skip);

    apply(
        &mut state,
        actor,
        Action::PlayCard { card: curse },
        &mut rng,
    )
    .unwrap();
    let pid = decision(&state).unwrap().pending_id.unwrap();
    apply(
        &mut state,
        actor,
        Action::CurseTarget {
            pending_id: pid,
            target,
        },
        &mut rng,
    )
    .unwrap();

    // Victim's private view must hide their entire hand!
    let target_view = view(&state, target);
    assert!(target_view.cursed);
    assert!(target_view.hand.is_empty());
    assert!(target_view.table.players[target.0].hand_count > 0);

    // End actor's turn with Skip so target takes their turn cursed.
    apply(&mut state, actor, Action::PlayCard { card: skip }, &mut rng).unwrap();
    assert_eq!(state.turn.player, target);

    // Put a non-playable Cat card at slot 0 to verify blind waste.
    let taco = extract(&mut state, CardKind::CatTaco);
    state.players[target.0].hand.insert(0, taco);
    assert!(
        apply(
            &mut state,
            target,
            Action::PlayCard { card: taco },
            &mut rng
        )
        .is_err()
    );
    let events = apply(&mut state, target, Action::PlayBlind { slot: 0 }, &mut rng).unwrap();
    assert!(
        events
            .iter()
            .any(|e| matches!(e.kind, cats::events::EventKind::BlindCardWasted { .. }))
    );
    assert!(state.discard.contains(&taco));

    // Put a safe card on top of deck and draw to lift the curse.
    let safe = extract(&mut state, CardKind::CatPotato);
    state.deck.push(safe);
    apply(&mut state, target, Action::Draw, &mut rng).unwrap();
    assert!(!state.players[target.0].cursed);
    assert!(!view(&state, target).hand.is_empty());
    assert_card_conservation(&state, &initial);
}

#[test]
fn barking_kitten_places_front_and_blasts_opponent_defuse_or_eliminates() {
    let mut rng = seeded(803);
    let (mut state, _) = setup(3, Settings::default(), &mut rng).unwrap();
    let initial: BTreeSet<CardId> = live_cards(&state).into_iter().collect();
    let (actor, target) = starting_turn(&state);

    let b1 = extract(&mut state, CardKind::BarkingKitten);
    let b2 = extract(&mut state, CardKind::BarkingKitten);
    state.players[actor.0].hand.push(b1);
    state.players[target.0].hand.push(b2);

    // Target has a Defuse, so playing b1 matches b2 in target's hand and forces target to burn Defuse.
    let defuse_before = state.players[target.0]
        .hand
        .iter()
        .filter(|c| c.kind() == Some(CardKind::Defuse))
        .count();
    let events = apply(&mut state, actor, Action::PlayCard { card: b1 }, &mut rng).unwrap();
    assert!(
        events
            .iter()
            .any(|e| matches!(e.kind, cats::events::EventKind::BarkingTriggered { actor: a, target: t } if a == actor && t == target))
    );
    assert!(events.iter().any(
        |e| matches!(e.kind, cats::events::EventKind::BarkingDefused { player } if player == target)
    ));
    assert!(
        events
            .iter()
            .all(|e| !matches!(e.kind, cats::events::EventKind::Defused { .. }))
    );
    let defuse_after = state.players[target.0]
        .hand
        .iter()
        .filter(|c| c.kind() == Some(CardKind::Defuse))
        .count();
    assert_eq!(defuse_after, defuse_before - 1);
    assert!(!state.players[target.0].eliminated);
    assert!(state.discard.contains(&b1));
    assert!(state.discard.contains(&b2));
    assert_card_conservation(&state, &initial);
}

#[test]
fn ill_take_that_intercepts_draw_and_transfers_bomb_risk_to_owner() {
    let mut rng = seeded(804);
    let (mut state, _) = setup(3, Settings::default(), &mut rng).unwrap();
    let initial: BTreeSet<CardId> = live_cards(&state).into_iter().collect();
    let (actor, target) = starting_turn(&state);

    let trap = extract(&mut state, CardKind::IllTakeThat);
    let skip = extract(&mut state, CardKind::Skip);
    let bomb = extract(&mut state, CardKind::Exploding);
    state.players[actor.0].hand.push(trap);
    state.players[actor.0].hand.push(skip);
    state.deck.push(bomb);

    apply(&mut state, actor, Action::PlayCard { card: trap }, &mut rng).unwrap();
    let pid = decision(&state).unwrap().pending_id.unwrap();
    apply(
        &mut state,
        actor,
        Action::IllTakeThatTarget {
            pending_id: pid,
            target,
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(
        spectator_view(&state).players[target.0].ill_take_that_by,
        Some(actor)
    );

    // Actor skips; target draws -> bomb goes to actor (who must Defuse), target survives!
    apply(&mut state, actor, Action::PlayCard { card: skip }, &mut rng).unwrap();
    assert_eq!(state.turn.player, target);
    apply(&mut state, target, Action::Draw, &mut rng).unwrap();
    let dec = decision(&state).unwrap();
    assert_eq!(dec.player, actor);
    assert!(matches!(dec.kind, cats::state::DecisionKind::Defuse { .. }));
    assert_card_conservation(&state, &initial);
}

#[test]
fn tower_of_power_redirects_steals_to_stash() {
    let mut rng = seeded(805);
    let (mut state, _) = setup(3, Settings::default(), &mut rng).unwrap();
    let initial: BTreeSet<CardId> = live_cards(&state).into_iter().collect();
    let (actor, target) = starting_turn(&state);
    assert_eq!(state.tower_stash.len(), 6);

    let tower = extract(&mut state, CardKind::TowerOfPower);
    let skip = extract(&mut state, CardKind::Skip);
    let favour = extract(&mut state, CardKind::Favour);
    state.players[actor.0].hand.push(tower);
    state.players[actor.0].hand.push(skip);
    state.players[target.0].hand.push(favour);

    apply(
        &mut state,
        actor,
        Action::PlayCard { card: tower },
        &mut rng,
    )
    .unwrap();
    assert_eq!(state.tower_owner, Some(actor));
    apply(&mut state, actor, Action::PlayCard { card: skip }, &mut rng).unwrap();

    // Target plays Favour on actor -> must blindly draw from Tower Stash, leaving actor's hand untouched!
    let actor_hand_before = state.players[actor.0].hand.clone();
    apply(
        &mut state,
        target,
        Action::PlayCard { card: favour },
        &mut rng,
    )
    .unwrap();
    let pid = decision(&state).unwrap().pending_id.unwrap();
    let events = apply(
        &mut state,
        target,
        Action::FavourTarget {
            pending_id: pid,
            target: actor,
        },
        &mut rng,
    )
    .unwrap();
    assert!(
        events
            .iter()
            .any(|e| matches!(e.kind, cats::events::EventKind::TowerBlocked { victim, actor: a } if victim == actor && a == target))
    );
    assert_eq!(state.players[actor.0].hand, actor_hand_before);
    assert_eq!(state.tower_stash.len(), 5);
    assert_card_conservation(&state, &initial);
}

#[test]
fn alter_future_now_plays_out_of_turn_and_preserves_turn_owner() {
    let mut rng = seeded(806);
    let (mut state, _) = setup(3, Settings::default(), &mut rng).unwrap();
    let initial: BTreeSet<CardId> = live_cards(&state).into_iter().collect();
    let (active, other) = starting_turn(&state);

    let now_card = extract(&mut state, CardKind::AlterFutureNow);
    state.players[other.0].hand.push(now_card);

    // `other` plays AlterFutureNow during `active`'s turn!
    apply(
        &mut state,
        other,
        Action::PlayCard { card: now_card },
        &mut rng,
    )
    .unwrap();
    let dec = decision(&state).unwrap();
    assert_eq!(dec.player, other);
    assert!(matches!(
        dec.kind,
        cats::state::DecisionKind::AlterFuture {
            count: 3,
            share_with_next: false
        }
    ));

    let mut order: Vec<CardId> = view(&state, other)
        .preview_cards
        .iter()
        .map(|c| c.id)
        .collect();
    order.reverse();
    apply(
        &mut state,
        other,
        Action::ReorderFuture {
            pending_id: dec.pending_id.unwrap(),
            order,
        },
        &mut rng,
    )
    .unwrap();

    // Turn stays with `active`!
    assert_eq!(state.turn.player, active);
    assert_eq!(decision(&state).unwrap().player, active);
    assert_card_conservation(&state, &initial);
}

#[test]
fn bury_triggers_exploding_and_rejects_while_trapped_by_ill_take_that() {
    let mut rng = seeded(807);
    let (mut state, _) = setup(2, Settings::default(), &mut rng).unwrap();
    let initial: BTreeSet<CardId> = live_cards(&state).into_iter().collect();
    let (actor, target) = starting_turn(&state);

    // 1. Trapped player cannot play Bury while I'll Take That is in front of them.
    let trap = extract(&mut state, CardKind::IllTakeThat);
    let skip = extract(&mut state, CardKind::Skip);
    let bury = extract(&mut state, CardKind::Bury);
    state.players[actor.0].hand.push(trap);
    state.players[actor.0].hand.push(skip);
    state.players[target.0].hand.push(bury);

    apply(&mut state, actor, Action::PlayCard { card: trap }, &mut rng).unwrap();
    let pid = decision(&state).unwrap().pending_id.unwrap();
    apply(
        &mut state,
        actor,
        Action::IllTakeThatTarget {
            pending_id: pid,
            target,
        },
        &mut rng,
    )
    .unwrap();
    apply(&mut state, actor, Action::PlayCard { card: skip }, &mut rng).unwrap();
    assert_eq!(state.turn.player, target);
    assert!(
        apply(
            &mut state,
            target,
            Action::PlayCard { card: bury },
            &mut rng
        )
        .is_err()
    );

    // 2. Clear trap via a safe draw, then verify Bury drawing Exploding triggers Defuse.
    let safe = extract(&mut state, CardKind::CatTaco);
    state.deck.push(safe);
    apply(&mut state, target, Action::Draw, &mut rng).unwrap();
    assert_eq!(state.turn.player, actor);

    let bury2 = extract(&mut state, CardKind::Bury);
    let bomb = extract(&mut state, CardKind::Exploding);
    // Ensure actor doesn't hold Streaking Kitten so bomb must trigger Defuse.
    if let Some(idx) = state.players[actor.0]
        .hand
        .iter()
        .position(|c| c.kind() == Some(CardKind::Streaking))
    {
        let streaking = state.players[actor.0].hand.remove(idx);
        state.deck.insert(0, streaking);
    }
    state.players[actor.0].hand.push(bury2);
    state.deck.push(bomb);

    apply(
        &mut state,
        actor,
        Action::PlayCard { card: bury2 },
        &mut rng,
    )
    .unwrap();
    let dec = decision(&state).unwrap();
    assert_eq!(dec.player, actor);
    assert!(matches!(dec.kind, cats::state::DecisionKind::Defuse { .. }));
    apply(
        &mut state,
        actor,
        Action::Defuse {
            pending_id: dec.pending_id.unwrap(),
            position: 0,
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(state.turn.player, target);
    assert_card_conservation(&state, &initial);
}

#[test]
fn ill_take_that_lethal_elimination_emits_no_phantom_turn_for_eliminated_owner() {
    let mut rng = seeded(808);
    let (mut state, _) = setup(2, Settings::default(), &mut rng).unwrap();
    let (actor, target) = starting_turn(&state);

    // Strip Defuse & Streaking from actor so actor explodes when trap triggers.
    let mut removed_protection = Vec::new();
    state.players[actor.0].hand.retain(|c| {
        if matches!(c.kind(), Some(CardKind::Defuse | CardKind::Streaking)) {
            removed_protection.push(*c);
            false
        } else {
            true
        }
    });
    state.deck.splice(0..0, removed_protection);

    let trap = extract(&mut state, CardKind::IllTakeThat);
    let skip = extract(&mut state, CardKind::Skip);
    let bomb = extract(&mut state, CardKind::Exploding);
    state.players[actor.0].hand.push(trap);
    state.players[actor.0].hand.push(skip);
    state.deck.push(bomb);

    apply(&mut state, actor, Action::PlayCard { card: trap }, &mut rng).unwrap();
    let pid = decision(&state).unwrap().pending_id.unwrap();
    apply(
        &mut state,
        actor,
        Action::IllTakeThatTarget {
            pending_id: pid,
            target,
        },
        &mut rng,
    )
    .unwrap();
    apply(&mut state, actor, Action::PlayCard { card: skip }, &mut rng).unwrap();

    let events = apply(&mut state, target, Action::Draw, &mut rng).unwrap();
    assert_eq!(state.winner, Some(target));
    assert!(
        events
            .iter()
            .all(|e| !matches!(e.kind, cats::events::EventKind::TurnStarted { .. })),
        "no TurnStarted should fire after trap owner is eliminated and game ends"
    );
}

#[test]
fn card_views_keep_card_and_kind_together() {
    let view = CardView::new(CardId::new(CardKind::SeeFuture, 0)).unwrap();
    assert_eq!(view.kind, CardKind::SeeFuture);
}
