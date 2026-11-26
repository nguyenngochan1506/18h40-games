use rand::{Rng, SeedableRng};
use rand_chacha::ChaCha8Rng;
use werewolf::*;

fn find_role(state: &GameState, role: Role) -> PlayerId {
    state
        .players
        .iter()
        .find(|p| p.role == role)
        .expect("role must exist")
        .id
}

fn find_roles(state: &GameState, role: Role) -> Vec<PlayerId> {
    state
        .players
        .iter()
        .filter(|p| p.role == role)
        .map(|p| p.id)
        .collect()
}

#[test]
fn standard_decks_valid_for_all_player_counts() {
    for n in 5..=16 {
        let deck = RoleDeck::standard(n);
        assert_eq!(deck.total(), n, "standard({n}) total mismatch");
        assert!(deck.valid_for(n), "standard({n}) should be valid");
    }
}

#[test]
fn setup_rejects_invalid_before_consuming_rng() {
    let mut rng = ChaCha8Rng::seed_from_u64(42);
    let before = rng.clone();
    assert_eq!(
        setup(4, Settings::default(), &mut rng).unwrap_err(),
        SetupError::InvalidPlayerCount
    );
    assert_eq!(rng, before);

    let mut bad_deck = RoleDeck::standard(5);
    bad_deck.werewolf = 0;
    bad_deck.villager += 1;
    let bad = Settings {
        roles: bad_deck,
        reveal_role_on_death: true,
    };
    assert_eq!(
        setup(5, bad, &mut rng).unwrap_err(),
        SetupError::InvalidSettings
    );
    assert_eq!(rng, before);
}

#[test]
fn error_does_not_mutate_state_or_rng() {
    let mut rng = ChaCha8Rng::seed_from_u64(7);
    let (mut state, _) = setup(5, Settings::default(), &mut rng).unwrap();
    let rng_before = rng.clone();
    let view_before = spectator_view(&state);

    let wolf = find_role(&state, Role::Werewolf);
    // Night 1 starts at Bodyguard, so wolf voting now must fail without mutating anything.
    let err = apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: PlayerId(0),
            infect: false,
        },
        &mut rng,
    )
    .unwrap_err();
    assert_eq!(err, ActionError::WrongPhase);
    assert_eq!(rng, rng_before);
    assert_eq!(spectator_view(&state), view_before);
}

#[test]
fn bodyguard_protects_and_cannot_repeat_target() {
    let mut rng = ChaCha8Rng::seed_from_u64(101);
    let (mut state, _) = setup(5, Settings::default(), &mut rng).unwrap();
    let bg = find_role(&state, Role::Bodyguard);
    let wolf = find_role(&state, Role::Werewolf);
    let seer = find_role(&state, Role::Seer);
    let villager = find_roles(&state, Role::Villager)[0];

    // Night 1: Bodyguard protects villager, wolf bites villager -> peaceful dawn!
    apply(
        &mut state,
        bg,
        Action::BodyguardProtect { target: villager },
        &mut rng,
    )
    .unwrap();
    apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: villager,
            infect: false,
        },
        &mut rng,
    )
    .unwrap();
    let events = apply(
        &mut state,
        seer,
        Action::SeerInspect { target: wolf },
        &mut rng,
    )
    .unwrap();
    assert!(
        events
            .iter()
            .any(|e| matches!(e.kind, EventKind::DawnPeaceful { day: 1 }))
    );
    assert!(state.players[villager.0].alive);

    // Day 1: Everyone abstains -> Night 2.
    for id in 0..5 {
        apply(
            &mut state,
            PlayerId(id),
            Action::DayVote { target: None },
            &mut rng,
        )
        .unwrap();
    }

    // Night 2: Bodyguard cannot protect villager again.
    let err = apply(
        &mut state,
        bg,
        Action::BodyguardProtect { target: villager },
        &mut rng,
    )
    .unwrap_err();
    assert_eq!(err, ActionError::CannotRepeatProtection);
}

#[test]
fn seer_sees_lycan_as_wolf_and_minion_as_not_wolf() {
    let mut rng = ChaCha8Rng::seed_from_u64(202);
    let mut deck = RoleDeck::empty();
    deck.werewolf = 1;
    deck.minion = 1;
    deck.seer = 1;
    deck.lycan = 1;
    deck.villager = 1;
    let settings = Settings {
        roles: deck,
        reveal_role_on_death: true,
    };
    let (mut state, _) = setup(5, settings, &mut rng).unwrap();
    let wolf = find_role(&state, Role::Werewolf);
    let minion = find_role(&state, Role::Minion);
    let seer = find_role(&state, Role::Seer);
    let lycan = find_role(&state, Role::Lycan);
    let villager = find_role(&state, Role::Villager);

    // Minion knows wolves; wolf does NOT know Minion.
    let minion_view = view(&state, minion).unwrap();
    assert_eq!(minion_view.known_wolves, vec![wolf]);
    let wolf_view = view(&state, wolf).unwrap();
    assert_eq!(wolf_view.known_wolves, vec![wolf]);

    // Night 1: wolf bites villager, seer inspects lycan -> is_wolf == true!
    apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: villager,
            infect: false,
        },
        &mut rng,
    )
    .unwrap();
    let events = apply(
        &mut state,
        seer,
        Action::SeerInspect { target: lycan },
        &mut rng,
    )
    .unwrap();
    let seer_events = filter_events(&events, Some(seer));
    assert!(seer_events.iter().any(|e| matches!(
        e,
        EventKind::SeerInspected {
            target,
            is_wolf: true
        } if *target == lycan
    )));
    // Spectator must NOT receive SeerInspected!
    assert!(
        !filter_events(&events, None)
            .iter()
            .any(|e| matches!(e, EventKind::SeerInspected { .. }))
    );

    // Day 1: abstain -> Night 2 (4 alive: wolf, minion, seer, lycan).
    for p in state
        .players
        .iter()
        .filter(|p| p.alive)
        .map(|p| p.id)
        .collect::<Vec<_>>()
    {
        apply(&mut state, p, Action::DayVote { target: None }, &mut rng).unwrap();
    }
    // Night 2: wolf bites lycan, seer inspects minion -> is_wolf == false!
    apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: lycan,
            infect: false,
        },
        &mut rng,
    )
    .unwrap();
    let events = apply(
        &mut state,
        seer,
        Action::SeerInspect { target: minion },
        &mut rng,
    )
    .unwrap();
    let seer_events = filter_events(&events, Some(seer));
    assert!(seer_events.iter().any(|e| matches!(
        e,
        EventKind::SeerInspected {
            target,
            is_wolf: false
        } if *target == minion
    )));
}

#[test]
fn witch_heal_and_poison() {
    let mut rng = ChaCha8Rng::seed_from_u64(303);
    let mut deck = RoleDeck::empty();
    deck.werewolf = 1;
    deck.witch = 1;
    deck.villager = 3;
    let (mut state, _) = setup(
        5,
        Settings {
            roles: deck,
            reveal_role_on_death: true,
        },
        &mut rng,
    )
    .unwrap();
    let wolf = find_role(&state, Role::Werewolf);
    let witch = find_role(&state, Role::Witch);
    let villagers = find_roles(&state, Role::Villager);

    apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: villagers[0],
            infect: false,
        },
        &mut rng,
    )
    .unwrap();

    let wview = view(&state, witch).unwrap();
    assert_eq!(wview.witch_victim, Some(villagers[0]));
    assert!(wview.witch_heal_available);
    assert!(wview.witch_poison_available);

    // Witch heals villager[0] AND poisons wolf -> Village wins immediately!
    apply(
        &mut state,
        witch,
        Action::WitchAct {
            heal: true,
            poison: Some(wolf),
        },
        &mut rng,
    )
    .unwrap();
    assert!(state.players[villagers[0].0].alive);
    assert!(!state.players[wolf.0].alive);
    assert_eq!(state.winner, Some(Winner::Village));
}

#[test]
fn cursed_turns_into_wolf_and_diseased_skips_next_night() {
    let mut rng = ChaCha8Rng::seed_from_u64(404);
    let mut deck = RoleDeck::empty();
    deck.werewolf = 1;
    deck.cursed = 1;
    deck.diseased = 1;
    deck.villager = 3;
    let (mut state, _) = setup(
        6,
        Settings {
            roles: deck,
            reveal_role_on_death: true,
        },
        &mut rng,
    )
    .unwrap();
    let wolf = find_role(&state, Role::Werewolf);
    let cursed = find_role(&state, Role::Cursed);
    let diseased = find_role(&state, Role::Diseased);

    // Night 1: wolf bites cursed -> cursed turns into wolf, peaceful dawn!
    let events = apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: cursed,
            infect: false,
        },
        &mut rng,
    )
    .unwrap();
    assert!(state.players[cursed.0].alive);
    assert!(state.players[cursed.0].is_wolf_pack);
    assert!(
        events
            .iter()
            .any(|e| matches!(e.kind, EventKind::DawnPeaceful { day: 1 }))
    );
    assert!(
        filter_events(&events, Some(cursed))
            .iter()
            .any(|e| matches!(e, EventKind::PlayerTurnedWolf { player } if *player == cursed))
    );

    // Day 1: abstain -> Night 2 (2 wolves vs 4 non-wolves).
    for id in 0..6 {
        apply(
            &mut state,
            PlayerId(id),
            Action::DayVote { target: None },
            &mut rng,
        )
        .unwrap();
    }

    // Night 2: both wolves bite diseased -> diseased dies, wolves sick on Night 3.
    apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: diseased,
            infect: false,
        },
        &mut rng,
    )
    .unwrap();
    apply(
        &mut state,
        cursed,
        Action::WolfVote {
            target: diseased,
            infect: false,
        },
        &mut rng,
    )
    .unwrap();
    assert!(!state.players[diseased.0].alive);

    // Day 2: abstain -> Night 3 skips wolves and goes straight to Day 3!
    let living: Vec<PlayerId> = state
        .players
        .iter()
        .filter(|p| p.alive)
        .map(|p| p.id)
        .collect();
    let mut last_events = vec![];
    for p in living {
        last_events = apply(&mut state, p, Action::DayVote { target: None }, &mut rng).unwrap();
    }
    assert!(
        filter_events(&last_events, Some(wolf))
            .iter()
            .any(|e| matches!(e, EventKind::WolvesSickSkipped { night: 3 }))
    );
    assert_eq!(
        spectator_view(&state).phase,
        PublicPhase::DayVote { day: 3 }
    );
}

#[test]
fn prince_mayor_tanner_and_hunter_mechanics() {
    // 1. Prince survives first lynch & Mayor counts as 2 votes.
    let mut rng = ChaCha8Rng::seed_from_u64(505);
    let mut deck = RoleDeck::empty();
    deck.werewolf = 1;
    deck.prince = 1;
    deck.mayor = 1;
    deck.tanner = 1;
    deck.hunter = 1;
    let (mut state, _) = setup(
        5,
        Settings {
            roles: deck,
            reveal_role_on_death: true,
        },
        &mut rng,
    )
    .unwrap();
    let wolf = find_role(&state, Role::Werewolf);
    let hunter = find_role(&state, Role::Hunter);

    // Night 1: wolf kills hunter -> Hunter triggers shot!
    apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: hunter,
            infect: false,
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(
        spectator_view(&state).phase,
        PublicPhase::HunterShot { hunter }
    );
    // Hunter shoots mayor? No, let's test Mayor + Prince + Tanner: let's have hunter shoot wolf -> Village wins!
    apply(
        &mut state,
        hunter,
        Action::HunterShoot { target: wolf },
        &mut rng,
    )
    .unwrap();
    assert_eq!(state.winner, Some(Winner::Village));

    // 2. Test Prince survival + Mayor double vote + Tanner win in a fresh 6-player game.
    let mut deck2 = RoleDeck::empty();
    deck2.werewolf = 1;
    deck2.prince = 1;
    deck2.mayor = 1;
    deck2.tanner = 1;
    deck2.villager = 2;
    let (mut state, _) = setup(
        6,
        Settings {
            roles: deck2,
            reveal_role_on_death: true,
        },
        &mut rng,
    )
    .unwrap();
    let wolf = find_role(&state, Role::Werewolf);
    let prince = find_role(&state, Role::Prince);
    let mayor = find_role(&state, Role::Mayor);
    let tanner = find_role(&state, Role::Tanner);
    let villagers = find_roles(&state, Role::Villager);

    // Night 1: wolf kills villager[0]
    apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: villagers[0],
            infect: false,
        },
        &mut rng,
    )
    .unwrap();

    // Day 1: Mayor votes Prince (2 votes), Wolf votes Tanner (1 vote), others abstain -> Prince gets 2 > 1 and reveals!
    apply(
        &mut state,
        mayor,
        Action::DayVote {
            target: Some(prince),
        },
        &mut rng,
    )
    .unwrap();
    apply(
        &mut state,
        wolf,
        Action::DayVote {
            target: Some(tanner),
        },
        &mut rng,
    )
    .unwrap();
    apply(
        &mut state,
        prince,
        Action::DayVote { target: None },
        &mut rng,
    )
    .unwrap();
    apply(
        &mut state,
        tanner,
        Action::DayVote { target: None },
        &mut rng,
    )
    .unwrap();
    let events = apply(
        &mut state,
        villagers[1],
        Action::DayVote { target: None },
        &mut rng,
    )
    .unwrap();
    assert!(
        events
            .iter()
            .any(|e| matches!(e.kind, EventKind::PrinceRevealed { player } if player == prince))
    );
    assert!(state.players[prince.0].alive);
    assert!(state.players[prince.0].prince_revealed);

    // Night 2: wolf kills villager[1]
    apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: villagers[1],
            infect: false,
        },
        &mut rng,
    )
    .unwrap();

    // Day 2: Mayor votes Tanner (2 votes), others abstain -> Tanner wins!
    apply(
        &mut state,
        mayor,
        Action::DayVote {
            target: Some(tanner),
        },
        &mut rng,
    )
    .unwrap();
    apply(&mut state, wolf, Action::DayVote { target: None }, &mut rng).unwrap();
    apply(
        &mut state,
        prince,
        Action::DayVote { target: None },
        &mut rng,
    )
    .unwrap();
    apply(
        &mut state,
        tanner,
        Action::DayVote { target: None },
        &mut rng,
    )
    .unwrap();
    assert_eq!(state.winner, Some(Winner::Tanner));
    assert_eq!(state.winning_players, vec![tanner]);
}

#[test]
fn cupid_mixed_lovers_win() {
    let mut rng = ChaCha8Rng::seed_from_u64(606);
    let mut deck = RoleDeck::empty();
    deck.werewolf = 1;
    deck.cupid = 1;
    deck.villager = 3;
    let (mut state, _) = setup(
        5,
        Settings {
            roles: deck,
            reveal_role_on_death: true,
        },
        &mut rng,
    )
    .unwrap();
    let wolf = find_role(&state, Role::Werewolf);
    let cupid = find_role(&state, Role::Cupid);
    let villagers = find_roles(&state, Role::Villager);

    // Cupid links wolf and villager[0] as mixed Lovers.
    apply(
        &mut state,
        cupid,
        Action::CupidLink {
            first: wolf,
            second: villagers[0],
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(view(&state, wolf).unwrap().your_team, Team::Lovers);
    assert_eq!(view(&state, villagers[0]).unwrap().your_team, Team::Lovers);
    assert_eq!(view(&state, villagers[1]).unwrap().lover, None);

    // Night 1: wolf kills villager[1] (4 alive)
    apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: villagers[1],
            infect: false,
        },
        &mut rng,
    )
    .unwrap();
    // Day 1: lynch villager[2] (3 alive: wolf, villager[0], cupid)
    for p in state
        .players
        .iter()
        .filter(|p| p.alive)
        .map(|p| p.id)
        .collect::<Vec<_>>()
    {
        apply(
            &mut state,
            p,
            Action::DayVote {
                target: Some(villagers[2]),
            },
            &mut rng,
        )
        .unwrap();
    }
    // Night 2: wolf kills cupid -> only wolf + villager[0] left -> Lovers win!
    apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: cupid,
            infect: false,
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(state.winner, Some(Winner::Lovers));
    assert_eq!(state.winning_players, vec![wolf, villagers[0]]);
}

#[test]
fn alpha_wolf_infects_victim() {
    let mut rng = ChaCha8Rng::seed_from_u64(707);
    let mut deck = RoleDeck::empty();
    deck.alpha_wolf = 1;
    deck.villager = 4;
    let (mut state, _) = setup(
        5,
        Settings {
            roles: deck,
            reveal_role_on_death: true,
        },
        &mut rng,
    )
    .unwrap();
    let alpha = find_role(&state, Role::AlphaWolf);
    let villagers = find_roles(&state, Role::Villager);

    apply(
        &mut state,
        alpha,
        Action::WolfVote {
            target: villagers[0],
            infect: true,
        },
        &mut rng,
    )
    .unwrap();
    assert!(state.players[villagers[0].0].alive);
    assert!(state.players[villagers[0].0].is_wolf_pack);
    assert!(!view(&state, alpha).unwrap().alpha_infect_available);
}

#[test]
fn privacy_spectator_never_sees_hidden_roles_until_game_over() {
    let mut rng = ChaCha8Rng::seed_from_u64(808);
    let (state, events) = setup(
        8,
        Settings {
            roles: RoleDeck::standard(8),
            reveal_role_on_death: true,
        },
        &mut rng,
    )
    .unwrap();
    let spec = spectator_view(&state);
    for p in &spec.players {
        assert_eq!(p.role, None, "living player role leaked to spectator");
    }
    let public_events = filter_events(&events, None);
    assert!(
        !public_events
            .iter()
            .any(|e| matches!(e, EventKind::RoleAssigned { .. }))
    );

    for i in 0..8 {
        let pe = filter_events(&events, Some(PlayerId(i)));
        let assigned: Vec<_> = pe
            .iter()
            .filter(|e| matches!(e, EventKind::RoleAssigned { .. }))
            .collect();
        assert_eq!(assigned.len(), 1);
    }
}

fn random_valid_action(state: &GameState, rng: &mut ChaCha8Rng) -> (PlayerId, Action) {
    let dec = decision(state).expect("game not over must have decision");
    let actor = dec.awaited[rng.random_range(0..dec.awaited.len())];
    let living: Vec<PlayerId> = state
        .players
        .iter()
        .filter(|p| p.alive)
        .map(|p| p.id)
        .collect();
    let pview = view(state, actor).unwrap();

    let action = match dec.phase {
        PublicPhase::Night { .. } => match dec.night_step.expect("night decision must have step") {
            NightStep::Cupid => {
                let first = living[rng.random_range(0..living.len())];
                let others: Vec<_> = living.iter().copied().filter(|&id| id != first).collect();
                let second = others[rng.random_range(0..others.len())];
                Action::CupidLink { first, second }
            }
            NightStep::Bodyguard => {
                let valid: Vec<_> = living
                    .iter()
                    .copied()
                    .filter(|&id| Some(id) != pview.bodyguard_last_protected)
                    .collect();
                Action::BodyguardProtect {
                    target: valid[rng.random_range(0..valid.len())],
                }
            }
            NightStep::Werewolves => {
                let prey: Vec<_> = state
                    .players
                    .iter()
                    .filter(|p| p.alive && !p.is_wolf_pack)
                    .map(|p| p.id)
                    .collect();
                let target = prey[rng.random_range(0..prey.len())];
                let infect = pview.alpha_infect_available && rng.random_bool(0.35);
                Action::WolfVote { target, infect }
            }
            NightStep::Seer => {
                let others: Vec<_> = living.iter().copied().filter(|&id| id != actor).collect();
                Action::SeerInspect {
                    target: others[rng.random_range(0..others.len())],
                }
            }
            NightStep::Sorcerer => {
                let others: Vec<_> = living.iter().copied().filter(|&id| id != actor).collect();
                Action::SorcererInspect {
                    target: others[rng.random_range(0..others.len())],
                }
            }
            NightStep::Witch => {
                let heal = pview.witch_heal_available
                    && pview.witch_victim.is_some()
                    && rng.random_bool(0.5);
                let others: Vec<_> = living.iter().copied().filter(|&id| id != actor).collect();
                let poison =
                    if pview.witch_poison_available && !others.is_empty() && rng.random_bool(0.4) {
                        Some(others[rng.random_range(0..others.len())])
                    } else {
                        None
                    };
                Action::WitchAct { heal, poison }
            }
        },
        PublicPhase::DayVote { .. } => {
            if rng.random_bool(0.2) {
                Action::DayVote { target: None }
            } else {
                Action::DayVote {
                    target: Some(living[rng.random_range(0..living.len())]),
                }
            }
        }
        PublicPhase::HunterShot { .. } => Action::HunterShoot {
            target: living[rng.random_range(0..living.len())],
        },
        PublicPhase::GameOver => unreachable!(),
    };
    (actor, action)
}

#[test]
fn fuzz_200_games_across_all_player_counts_terminate_and_are_deterministic() {
    for seed in 0..200_u64 {
        let players = 5 + (seed as usize % 12);
        let settings = Settings {
            roles: RoleDeck::standard(players),
            reveal_role_on_death: seed.is_multiple_of(2),
        };

        let run = || {
            let mut game_rng = ChaCha8Rng::seed_from_u64(seed);
            let mut bot_rng = ChaCha8Rng::seed_from_u64(seed.wrapping_add(10_000));
            let (mut state, _) = setup(players, settings, &mut game_rng).unwrap();
            let mut steps = 0usize;
            while state.winner.is_none() {
                assert!(steps < 500, "seed {seed} ({players}p) did not terminate");
                let (actor, action) = if steps.is_multiple_of(7) {
                    default_action(&state).expect("default action must exist")
                } else {
                    random_valid_action(&state, &mut bot_rng)
                };
                let events = apply(&mut state, actor, action, &mut game_rng).unwrap();
                // Verify spectator never sees private events.
                for ev in filter_events(&events, None) {
                    assert!(!matches!(
                        ev,
                        EventKind::RoleAssigned { .. }
                            | EventKind::NightStepStarted { .. }
                            | EventKind::LoversLinked { .. }
                            | EventKind::BodyguardProtected { .. }
                            | EventKind::WolfVoted { .. }
                            | EventKind::SeerInspected { .. }
                            | EventKind::SorcererInspected { .. }
                            | EventKind::WitchUsedHeal { .. }
                            | EventKind::WitchUsedPoison { .. }
                            | EventKind::PlayerTurnedWolf { .. }
                            | EventKind::WolvesSickSkipped { .. }
                    ));
                }
                steps += 1;
            }
            assert!(decision(&state).is_none());
            assert!(default_action(&state).is_none());
            (state.winner.unwrap(), state.winning_players, steps)
        };

        let first = run();
        let second = run();
        assert_eq!(first, second, "seed {seed} was not deterministic");
    }
}

#[test]
fn hidden_death_roles_do_not_leak_seer_step_on_subsequent_nights() {
    let mut rng = ChaCha8Rng::seed_from_u64(101);
    let settings = Settings {
        roles: RoleDeck::standard(5),
        reveal_role_on_death: false,
    };
    let (mut state, setup_events) = setup(5, settings, &mut rng).unwrap();
    let wolf = find_role(&state, Role::Werewolf);
    let seer = find_role(&state, Role::Seer);
    let bg = find_role(&state, Role::Bodyguard);
    let villagers = find_roles(&state, Role::Villager);

    // Spectators and non-acting players must never receive NightStepStarted.
    assert!(
        !filter_events(&setup_events, None)
            .iter()
            .any(|e| matches!(e, EventKind::NightStepStarted { .. }))
    );
    assert!(
        !filter_events(&setup_events, Some(villagers[0]))
            .iter()
            .any(|e| matches!(e, EventKind::NightStepStarted { .. }))
    );
    assert!(
        filter_events(&setup_events, Some(bg))
            .iter()
            .any(|e| matches!(
                e,
                EventKind::NightStepStarted {
                    night: 1,
                    step: NightStep::Bodyguard
                }
            ))
    );
    assert_eq!(
        view(&state, bg).unwrap().active_night_step,
        Some(NightStep::Bodyguard)
    );
    assert_eq!(view(&state, villagers[0]).unwrap().active_night_step, None);
    assert_eq!(spectator_view(&state).awaited_count, 0);

    // Night 1: BG protects villager[0], Wolf kills Seer, Seer inspects wolf -> Seer dies at dawn.
    apply(
        &mut state,
        bg,
        Action::BodyguardProtect {
            target: villagers[0],
        },
        &mut rng,
    )
    .unwrap();
    apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: seer,
            infect: false,
        },
        &mut rng,
    )
    .unwrap();
    apply(
        &mut state,
        seer,
        Action::SeerInspect { target: wolf },
        &mut rng,
    )
    .unwrap();
    assert!(!state.players[seer.0].alive);
    assert_eq!(spectator_view(&state).players[seer.0].role, None);

    // Day 1: everyone abstains -> Night 2 starts.
    let living: Vec<_> = state
        .players
        .iter()
        .filter(|p| p.alive)
        .map(|p| p.id)
        .collect();
    let mut night2_events = Vec::new();
    for id in living {
        night2_events = apply(&mut state, id, Action::DayVote { target: None }, &mut rng).unwrap();
    }
    assert_eq!(
        spectator_view(&state).phase,
        PublicPhase::Night { night: 2 }
    );
    assert_eq!(spectator_view(&state).awaited_count, 0);
    assert!(
        !filter_events(&night2_events, None)
            .iter()
            .any(|e| matches!(e, EventKind::NightStepStarted { .. }))
    );

    // Night 2: BG acts -> Werewolves act -> Dawn (Seer skipped silently without leaking to spectator).
    let ev_bg = apply(
        &mut state,
        bg,
        Action::BodyguardProtect {
            target: villagers[1],
        },
        &mut rng,
    )
    .unwrap();
    assert!(
        !filter_events(&ev_bg, None)
            .iter()
            .any(|e| matches!(e, EventKind::NightStepStarted { .. }))
    );
    assert_eq!(
        view(&state, wolf).unwrap().active_night_step,
        Some(NightStep::Werewolves)
    );
    assert_eq!(view(&state, villagers[0]).unwrap().active_night_step, None);
}

#[test]
fn villager_linked_with_minion_is_not_mixed_lovers_and_wins_with_village() {
    let mut rng = ChaCha8Rng::seed_from_u64(202);
    let mut deck = RoleDeck::empty();
    deck.werewolf = 1;
    deck.minion = 1;
    deck.cupid = 1;
    deck.villager = 2;
    let settings = Settings {
        roles: deck,
        reveal_role_on_death: true,
    };
    let (mut state, _) = setup(5, settings, &mut rng).unwrap();
    let wolf = find_role(&state, Role::Werewolf);
    let minion = find_role(&state, Role::Minion);
    let cupid = find_role(&state, Role::Cupid);
    let villagers = find_roles(&state, Role::Villager);
    let linked_villager = villagers[0];
    let other_villager = villagers[1];

    // Cupid links Villager + Minion (neither is in wolf pack -> NOT mixed lovers).
    apply(
        &mut state,
        cupid,
        Action::CupidLink {
            first: linked_villager,
            second: minion,
        },
        &mut rng,
    )
    .unwrap();
    assert_eq!(
        view(&state, linked_villager).unwrap().your_team,
        Team::Village
    );
    assert_eq!(view(&state, minion).unwrap().your_team, Team::Werewolves);

    // Wolf kills other_villager on Night 1.
    apply(
        &mut state,
        wolf,
        Action::WolfVote {
            target: other_villager,
            infect: false,
        },
        &mut rng,
    )
    .unwrap();

    // Day 1: everyone lynches the Werewolf -> Village wins, and linked_villager MUST be in winning_players.
    let living: Vec<_> = state
        .players
        .iter()
        .filter(|p| p.alive)
        .map(|p| p.id)
        .collect();
    for id in living {
        apply(
            &mut state,
            id,
            Action::DayVote { target: Some(wolf) },
            &mut rng,
        )
        .unwrap();
    }
    assert_eq!(state.winner, Some(Winner::Village));
    assert!(
        state.winning_players.contains(&linked_villager),
        "Villager paired with Minion must still win with Village"
    );
    assert!(!state.winning_players.contains(&minion));
}
