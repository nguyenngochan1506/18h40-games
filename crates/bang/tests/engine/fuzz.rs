use super::support::{invariant, legal_actions};
use bang::*;
use rand::{Rng, RngCore, SeedableRng};
use rand_chacha::ChaCha8Rng;
use std::collections::BTreeMap;

#[test]
fn seeded_bots_cover_all_cards_frames_and_outcomes() {
    let mut games = 0;
    let mut total_actions = 0;
    let mut longest = 0;
    let mut cards = BTreeMap::new();
    let mut frames = BTreeMap::new();
    let mut appearances = [0usize; 16];
    let mut skills = [0usize; 16];
    let mut wins = [0usize; 3];
    let mut beer_saves = 0;
    let mut sid_saves = 0;
    let mut bounties = 0;
    let mut penalties = 0;
    for count in 4..=7 {
        for seed in 0..1024 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed);
            let mut replay_rng = rng.clone();
            let (mut state, events) = setup(
                count,
                bang::GameConfig {
                    roles: bang::RoleCounts::standard(count),
                    ..Default::default()
                },
                &mut rng,
            )
            .unwrap();
            let (mut replay, replay_events) = setup(
                count,
                bang::GameConfig {
                    roles: bang::RoleCounts::standard(count),
                    ..Default::default()
                },
                &mut replay_rng,
            )
            .unwrap();
            assert_eq!(state, replay);
            assert_eq!(events, replay_events);
            invariant(&state);
            for player in &state.players {
                appearances[Character::ALL
                    .iter()
                    .position(|c| *c == player.character)
                    .unwrap()] += 1;
            }
            for event in &events {
                if let EventKind::SkillActivated { character, .. } = event.kind {
                    skills[Character::ALL.iter().position(|c| *c == character).unwrap()] += 1;
                }
            }
            let mut bot = ChaCha8Rng::seed_from_u64(seed + 10000);
            let mut steps = 0;
            while state.winner.is_none() && steps < 4096 {
                if steps % 7 == 0 {
                    let before = state.clone();
                    let before_rng = rng.clone();
                    assert!(
                        apply(
                            &mut state,
                            PlayerId(usize::MAX),
                            Action::EndTurn { discard: vec![] },
                            &mut rng
                        )
                        .is_err()
                    );
                    assert_eq!(state, before);
                    assert_eq!(rng.get_word_pos(), before_rng.get_word_pos());
                    assert_eq!(rng.clone().next_u64(), before_rng.clone().next_u64());
                    invariant(&state);
                }
                let actions = legal_actions(&state);
                let (player, action) = actions[bot.random_range(0..actions.len())].clone();
                let before_health = state.players[player.0].health;
                let dying = matches!(state.decision().unwrap().kind, DecisionKind::Dying { .. });
                let beer_response = matches!(&action, Action::Respond { card: Some(card), .. } if card.card().is_some_and(|card| card.kind == CardKind::Beer));
                let sid_heal = matches!(&action, Action::SidHeal { .. });
                let events = apply(&mut state, player, action.clone(), &mut rng).unwrap();
                let replay_events = apply(&mut replay, player, action, &mut replay_rng).unwrap();
                assert_eq!(state, replay);
                assert_eq!(events, replay_events);
                assert_eq!(rng.get_word_pos(), replay_rng.get_word_pos());
                invariant(&state);
                invariant(&replay);
                if dying && before_health <= 0 && state.players[player.0].health > 0 {
                    if beer_response {
                        beer_saves += 1;
                    }
                    if sid_heal {
                        sid_saves += 1;
                    }
                }
                for event in &events {
                    match event.kind {
                        EventKind::CardPlayed { card, .. } => {
                            *cards.entry(card.card().unwrap().kind).or_insert(0usize) += 1
                        }
                        EventKind::SkillActivated { character, .. } => {
                            skills[Character::ALL.iter().position(|c| *c == character).unwrap()] +=
                                1
                        }
                        EventKind::BountyAwarded { .. } => bounties += 1,
                        EventKind::SheriffPenalized { .. } => penalties += 1,
                        _ => {}
                    }
                }
                for frame in &state.pending {
                    let name = match frame.kind {
                        PendingKind::AttackResponse { .. } => "attack_response",
                        PendingKind::Dying { .. } => "dying",
                        PendingKind::Duel { .. } => "duel",
                        PendingKind::ResolveTargets { .. } => "resolve_targets",
                        PendingKind::GeneralStore { .. } => "general_store",
                        PendingKind::DrawChoice { .. } => "draw_choice",
                        PendingKind::KeepCards { .. } => "keep_cards",
                        PendingKind::ChooseDrawResult { .. } => "choose_draw_result",
                    };
                    if !frames.contains_key(name) {
                        let restored: GameState =
                            serde_json::from_str(&serde_json::to_string(&state).unwrap()).unwrap();
                        assert_eq!(restored, state);
                    }
                    *frames.entry(name).or_insert(0usize) += 1;
                }
                for event in filter_events(&events, None) {
                    assert_eq!(event.visibility, Visibility::Public);
                }
                steps += 1;
            }
            let winner = state
                .winner
                .unwrap_or_else(|| panic!("Bot game hit step limit: count={count}, seed={seed}"));
            wins[match winner {
                Winner::SheriffAndDeputies => 0,
                Winner::Outlaws => 1,
                Winner::Renegade { .. } => 2,
            }] += 1;
            invariant(&state);
            games += 1;
            total_actions += steps;
            longest = longest.max(steps);
        }
    }
    for kind in CardKind::ALL {
        assert!(
            cards.get(&kind).copied().unwrap_or(0) > 0,
            "Missing card coverage: {kind:?}"
        );
    }
    for name in [
        "attack_response",
        "dying",
        "duel",
        "resolve_targets",
        "general_store",
        "draw_choice",
        "keep_cards",
        "choose_draw_result",
    ] {
        assert!(
            frames.get(name).copied().unwrap_or(0) > 0,
            "Missing frame coverage: {name}"
        );
    }
    for (i, character) in Character::ALL.iter().enumerate() {
        assert!(
            appearances[i] > 0 && skills[i] > 0,
            "Missing skill coverage: {character:?}"
        );
        println!(
            "Character {character:?}: appearances={}, activations={}",
            appearances[i], skills[i]
        );
    }
    assert!(wins.iter().all(|count| *count > 0));
    assert!(beer_saves > 0 && sid_saves > 0 && bounties > 0 && penalties > 0);
    println!(
        "Fuzz: {games} games, {total_actions} actions plus replay, longest {longest}, 0 step-limit hits; wins sheriff/outlaw/renegade={wins:?}; beer_saves={beer_saves}, sid_saves={sid_saves}, bounties={bounties}, penalties={penalties}; cards={cards:?}; frames={frames:?}"
    );
}
