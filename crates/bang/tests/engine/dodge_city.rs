use super::support::{Scenario, dodge_legal_actions, invariant};
use CardKind::*;
use Rank::*;
use Suit::*;
use bang::*;
use rand::{Rng, SeedableRng, seq::SliceRandom};
use rand_chacha::ChaCha8Rng;
use std::collections::{BTreeMap, BTreeSet};

fn dodge_config(count: usize) -> GameConfig {
    GameConfig {
        roles: RoleCounts::standard(count),
        expansions: [Expansion::DodgeCity].into(),
        ..Default::default()
    }
}

fn begin_turn(game: &mut Scenario, player: usize) -> Vec<Event> {
    game.state.turn.player =
        PlayerId((player + game.state.players.len() - 1) % game.state.players.len());
    game.end()
}

fn id(game: &Scenario) -> PendingId {
    game.state.pending.last().unwrap().id
}

fn play(game: &mut Scenario, player: usize, card: CardId, target: Option<usize>) -> Vec<Event> {
    game.act_with_checks(
        player,
        Action::Play {
            card,
            target: target.map(PlayerId),
        },
    )
}

fn drawn(events: &[Event], player: usize) -> usize {
    events
        .iter()
        .filter_map(|e| match e.kind {
            EventKind::CardsDrawn { player: p, count } if p == PlayerId(player) => Some(count),
            _ => None,
        })
        .sum()
}

fn health(game: &Scenario, player: usize) -> i16 {
    game.state.players[player].health
}

fn kinds(cards: &[CardId]) -> Vec<CardKind> {
    cards.iter().map(|c| c.card().unwrap().kind).collect()
}

// ---------------------------------------------------------------- catalog and config

#[test]
fn catalog_lists_the_40_cards_and_15_characters_of_the_pack() {
    let expected: Vec<(CardKind, Suit, Rank)> = vec![
        (Barrel, Clubs, Ace),
        (Binocular, Diamonds, Ten),
        (Dynamite, Clubs, Ten),
        (Mustang, Hearts, Five),
        (Remington, Diamonds, Six),
        (RevCarabine, Spades, Five),
        (Hideout, Diamonds, King),
        (Bang, Spades, Eight),
        (Bang, Clubs, Five),
        (Bang, Clubs, Six),
        (Bang, Clubs, King),
        (Beer, Hearts, Six),
        (Beer, Spades, Six),
        (CatBalou, Clubs, Eight),
        (GeneralStore, Spades, Ace),
        (Indians, Diamonds, Five),
        (Missed, Diamonds, Eight),
        (Panic, Hearts, Jack),
        (Punch, Spades, Ten),
        (RagTime, Hearts, Nine),
        (Brawl, Spades, Jack),
        (Dodge, Diamonds, Seven),
        (Dodge, Hearts, King),
        (Springfield, Spades, King),
        (Tequila, Clubs, Nine),
        (Whisky, Diamonds, Queen),
        (Bible, Hearts, Ten),
        (Canteen, Hearts, Seven),
        (CanCan, Clubs, Jack),
        (TenGallonHat, Diamonds, Jack),
        (Conestoga, Diamonds, Nine),
        (Derringer, Spades, Seven),
        (BuffaloRifle, Clubs, Queen),
        (Howitzer, Spades, Nine),
        (Pepperbox, Hearts, Ace),
        (IronPlate, Diamonds, Ace),
        (IronPlate, Spades, Queen),
        (PonyExpress, Diamonds, Queen),
        (Knife, Hearts, Eight),
        (Sombrero, Clubs, Seven),
    ];
    assert_eq!(DODGE_CITY_DECK.len(), 40);
    for (index, (kind, suit, rank)) in expected.into_iter().enumerate() {
        let card = CardId((80 + index) as u8).card().unwrap();
        assert_eq!(
            (card.kind, card.suit, card.rank),
            (kind, suit, rank),
            "{index}"
        );
    }
    assert_eq!(CardId(120).card(), None);
    let greens: Vec<_> = DODGE_CITY_DECK
        .iter()
        .filter(|c| c.kind.is_green())
        .collect();
    assert_eq!(greens.len(), 14);
    assert_eq!(
        greens.iter().map(|c| c.kind).collect::<BTreeSet<_>>().len(),
        13
    );
    // Only these cards are new kinds; the other 18 are extra copies of base kinds.
    let new_kinds: BTreeSet<_> = DODGE_CITY_DECK
        .iter()
        .map(|c| c.kind)
        .filter(|k| CardKind::DODGE_CITY.contains(k))
        .collect();
    assert_eq!(new_kinds.len(), 22);
    assert!(DECK.iter().all(|c| !CardKind::DODGE_CITY.contains(&c.kind)));

    let healths: BTreeMap<_, _> = Character::DODGE_CITY
        .iter()
        .map(|c| (*c, c.health()))
        .collect();
    let want = [
        (Character::ApacheKid, 3),
        (Character::BelleStar, 4),
        (Character::BillNoface, 4),
        (Character::ChuckWengam, 4),
        (Character::DocHolyday, 4),
        (Character::ElenaFuente, 3),
        (Character::GregDigger, 4),
        (Character::HerbHunter, 4),
        (Character::JoseDelgado, 4),
        (Character::MollyStark, 4),
        (Character::PatBrennan, 4),
        (Character::PixiePete, 3),
        (Character::SeanMallory, 3),
        (Character::TequilaJoe, 4),
        (Character::VeraCuster, 3),
    ];
    assert_eq!(healths, BTreeMap::from(want));
    assert!(
        Character::DODGE_CITY
            .iter()
            .all(|c| !Character::ALL.contains(c))
    );
}

#[test]
fn expansion_off_keeps_the_base_deck_characters_and_player_limit() {
    let config = GameConfig::default();
    assert!(config.expansions.is_empty() && !config.has(Expansion::DodgeCity));
    assert_eq!(config.deck(), (0..80).map(CardId).collect::<Vec<_>>());
    assert_eq!(config.characters(), Character::ALL.to_vec());
    assert_eq!(config.max_players(), 7);
    // Old payloads without the field still load, and stay off.
    let old: GameConfig =
        serde_json::from_str(r#"{"mode":"classic","roles":{"deputy":1,"outlaw":2,"renegade":1}}"#)
            .unwrap();
    assert!(old.expansions.is_empty());
    assert_eq!(
        serde_json::to_value(GameConfig::default()).unwrap()["expansions"],
        serde_json::json!([])
    );
    let on: GameConfig = serde_json::from_str(
        r#"{"mode":"club","roles":{"deputy":1,"outlaw":2,"renegade":1},"expansions":["dodge_city"]}"#,
    )
    .unwrap();
    assert!(on.has(Expansion::DodgeCity) && on.expansions_valid());
    assert_eq!(on.deck().len(), 120);
    assert_eq!(on.characters().len(), 31);
    assert_eq!(on.max_players(), 8);

    let mut rng = ChaCha8Rng::seed_from_u64(1);
    let before = rng.clone();
    assert_eq!(
        setup(
            8,
            GameConfig {
                roles: RoleCounts::standard(8),
                ..Default::default()
            },
            &mut rng
        ),
        Err(ActionError::InvalidPlayerCount)
    );
    assert_eq!(rng.get_word_pos(), before.get_word_pos());
}

#[test]
fn expansion_off_deals_exactly_what_the_base_game_dealt() {
    // Replays the base setup by hand: same shuffles in the same order on the same seed.
    for count in 4..=7 {
        let roles_cfg = RoleCounts::standard(count);
        let (state, _) = setup(
            count,
            GameConfig {
                roles: roles_cfg,
                ..Default::default()
            },
            &mut ChaCha8Rng::seed_from_u64(77),
        )
        .unwrap();
        let mut rng = ChaCha8Rng::seed_from_u64(77);
        let mut roles = vec![Role::Sheriff];
        for (role, n) in [
            (Role::Deputy, roles_cfg.deputy),
            (Role::Outlaw, roles_cfg.outlaw),
            (Role::Renegade, roles_cfg.renegade),
        ] {
            roles.extend(std::iter::repeat_n(role, usize::from(n)));
        }
        roles.shuffle(&mut rng);
        let mut characters = Character::ALL;
        characters.shuffle(&mut rng);
        let mut pile: Vec<CardId> = (0..80).map(CardId).collect();
        pile.shuffle(&mut rng);
        for (index, player) in state.players.iter().enumerate() {
            assert_eq!(player.role, roles[index]);
            assert_eq!(player.character, characters[index]);
            assert!(player.fresh_green.is_empty() && player.copied.is_none());
        }
        for player in &state.players {
            // The Sheriff's own draw phase has not run yet; hands hold the starting cards.
            let mut hand = Vec::new();
            for _ in 0..player.health {
                hand.push(pile.pop().unwrap());
            }
            assert!(player.hand.starts_with(&hand));
        }
        assert!(
            state
                .players
                .iter()
                .flat_map(|p| &p.hand)
                .chain(&state.draw_pile)
                .all(|c| c.0 < 80)
        );
    }
}

#[test]
fn expansion_on_adds_the_pack_to_deck_and_character_pool() {
    let mut seen = BTreeSet::new();
    for seed in 0..40 {
        let (state, _) = setup(8, dodge_config(8), &mut ChaCha8Rng::seed_from_u64(seed)).unwrap();
        invariant(&state);
        assert_eq!(state.config.deck().len(), 120);
        for player in &state.players {
            seen.insert(player.character);
            assert_eq!(
                player.max_health,
                player.character.health() + i16::from(player.role == Role::Sheriff)
            );
        }
        assert_eq!(
            state
                .players
                .iter()
                .map(|p| p.character)
                .collect::<BTreeSet<_>>()
                .len(),
            8
        );
    }
    for character in Character::DODGE_CITY {
        assert!(seen.contains(&character), "{character:?} never dealt");
    }
}

// ---------------------------------------------------------------- 8 players

#[test]
fn eight_players_get_two_renegades_and_only_with_the_expansion() {
    let roles = RoleCounts::standard(8);
    assert_eq!(
        roles,
        RoleCounts {
            deputy: 2,
            outlaw: 3,
            renegade: 2
        }
    );
    assert!(!roles.valid_for(8) && roles.valid_within(8, 8));
    for count in 4..=7 {
        assert!(RoleCounts::standard(count).valid_for(count));
        assert_eq!(RoleCounts::standard(count).renegade, 1);
    }
    for seed in 0..16 {
        let (state, _) = setup(8, dodge_config(8), &mut ChaCha8Rng::seed_from_u64(seed)).unwrap();
        invariant(&state);
        for (role, n) in [
            (Role::Sheriff, 1),
            (Role::Deputy, 2),
            (Role::Outlaw, 3),
            (Role::Renegade, 2),
        ] {
            assert_eq!(state.players.iter().filter(|p| p.role == role).count(), n);
        }
        assert_eq!(state.players.len(), 8);
    }
    for count in 4..=8 {
        assert!(
            setup(
                count,
                dodge_config(count),
                &mut ChaCha8Rng::seed_from_u64(3)
            )
            .is_ok()
        );
    }
    assert_eq!(
        setup(9, dodge_config(8), &mut ChaCha8Rng::seed_from_u64(3)).err(),
        Some(ActionError::InvalidPlayerCount)
    );
    assert_eq!(
        setup(8, dodge_config(7), &mut ChaCha8Rng::seed_from_u64(3)).err(),
        Some(ActionError::InvalidSettings)
    );
}

fn eight(roles: [Role; 8]) -> Scenario {
    let mut game = Scenario::dodge(8);
    for (index, role) in roles.into_iter().enumerate() {
        game.state.players[index].role = role;
        game.state.players[index].max_health = 4 + i16::from(role == Role::Sheriff);
        game.state.players[index].health = game.state.players[index].max_health;
    }
    game
}

fn kill_by_bang(game: &mut Scenario, source: usize, target: usize) {
    game.state.turn.player = PlayerId(source);
    game.state.turn.bangs_played = 0;
    game.state.players[target].health = 1;
    game.shoot(source, target);
    game.respond(None);
    if matches!(
        game.state.decision().map(|d| d.kind),
        Some(DecisionKind::Dying { .. })
    ) {
        game.respond(None);
    }
}

use Role::*;

#[test]
fn sheriff_dying_with_two_renegades_alive_is_an_outlaw_win() {
    let mut game = eight([
        Sheriff, Deputy, Deputy, Outlaw, Outlaw, Outlaw, Renegade, Renegade,
    ]);
    for dead in [1, 2, 3, 4, 5] {
        game.dead(dead);
    }
    // Only the Sheriff and both Renegades remain: the Sheriff's death is an Outlaw win.
    game.state.turn.player = PlayerId(6);
    kill_by_bang(&mut game, 6, 0);
    assert_eq!(game.state.winner, Some(Winner::Outlaws));
}

#[test]
fn each_renegade_wins_alone_and_not_while_the_other_lives() {
    let mut game = eight([
        Sheriff, Deputy, Deputy, Outlaw, Outlaw, Outlaw, Renegade, Renegade,
    ]);
    for dead in [1, 2, 3, 4, 5, 7] {
        game.dead(dead);
    }
    game.state.turn.player = PlayerId(6);
    kill_by_bang(&mut game, 6, 0);
    assert_eq!(
        game.state.winner,
        Some(Winner::Renegade {
            player: PlayerId(6)
        })
    );

    let mut game = eight([
        Sheriff, Deputy, Deputy, Outlaw, Outlaw, Outlaw, Renegade, Renegade,
    ]);
    for dead in [1, 2, 3, 4, 5, 6] {
        game.dead(dead);
    }
    game.state.turn.player = PlayerId(7);
    kill_by_bang(&mut game, 7, 0);
    assert_eq!(
        game.state.winner,
        Some(Winner::Renegade {
            player: PlayerId(7)
        })
    );
}

#[test]
fn sheriff_side_needs_both_renegades_and_all_outlaws_gone() {
    let mut game = eight([
        Sheriff, Deputy, Deputy, Outlaw, Outlaw, Outlaw, Renegade, Renegade,
    ]);
    for dead in [2, 3, 4, 5, 6] {
        game.dead(dead);
    }
    // Sheriff, one Deputy and one Renegade left: the game goes on until the Renegade falls.
    assert!(game.state.winner.is_none());
    kill_by_bang(&mut game, 0, 7);
    assert_eq!(game.state.winner, Some(Winner::SheriffAndDeputies));
}

// ---------------------------------------------------------------- green cards

#[test]
fn green_card_waits_until_the_owners_next_turn_then_heals() {
    let mut game = Scenario::dodge(4);
    game.state.players[0].health = 3;
    let canteen = game.give_face(0, Canteen, Hearts, Seven);
    play(&mut game, 0, canteen, None);
    assert!(game.state.players[0].in_play.contains(&canteen));
    assert_eq!(game.state.players[0].fresh_green, vec![canteen]);
    let table = spectator_view(&game.state);
    assert_eq!(table.players[0].green_ready, None);
    assert!(table.players[0].in_play.contains(&canteen));
    game.reject(
        0,
        Action::ActivateGreen {
            card: canteen,
            target: None,
            selection: None,
        },
        ActionError::InvalidCard,
    );
    // Every other turn comes and goes; at the start of the owner's next turn it is ready.
    game.state.turn.player = PlayerId(3);
    game.end();
    assert_eq!(game.state.turn.player, PlayerId(0));
    assert!(game.state.players[0].fresh_green.is_empty());
    assert_eq!(
        spectator_view(&game.state).players[0].green_ready,
        Some(vec![canteen])
    );
    let events = game.act(
        0,
        Action::ActivateGreen {
            card: canteen,
            target: None,
            selection: None,
        },
    );
    assert_eq!(health(&game, 0), 4);
    assert!(game.state.discard_pile.contains(&canteen));
    assert!(!game.state.players[0].in_play.contains(&canteen));
    assert!(events.iter().any(|e| matches!(
        e.kind,
        EventKind::GreenActivated { player: PlayerId(0), card, target: None } if card == canteen
    )));
    // A spent card cannot be used again.
    game.reject(
        0,
        Action::ActivateGreen {
            card: canteen,
            target: None,
            selection: None,
        },
        ActionError::InvalidCard,
    );
}

#[test]
fn green_cards_cannot_be_used_in_the_turn_they_are_placed_even_after_other_plays() {
    let mut game = Scenario::dodge(5);
    let pony = game.give_face(0, PonyExpress, Diamonds, Queen);
    play(&mut game, 0, pony, None);
    game.reject(
        0,
        Action::ActivateGreen {
            card: pony,
            target: None,
            selection: None,
        },
        ActionError::InvalidCard,
    );
    // Cards in other zones or not green are never activatable.
    let beer = game.give(0, Beer);
    game.reject(
        0,
        Action::ActivateGreen {
            card: beer,
            target: None,
            selection: None,
        },
        ActionError::InvalidCard,
    );
}

#[test]
fn green_card_taken_by_panic_or_conestoga_returns_to_hand_and_must_wait_again() {
    for steal in [Panic, Conestoga, RagTime, CanCan] {
        let mut game = Scenario::dodge(5);
        let canteen = game.ready_green(0, Canteen);
        game.state.turn.player = PlayerId(1);
        let card = match steal {
            Panic => game.give_face(1, Panic, Hearts, Jack),
            Conestoga => game.ready_green(1, Conestoga),
            RagTime => game.give_face(1, RagTime, Hearts, Nine),
            _ => game.ready_green(1, CanCan),
        };
        let discard = if steal == RagTime {
            Some(game.give(1, Beer))
        } else {
            None
        };
        let action = match steal {
            Panic => Action::AffectCard {
                card,
                target: PlayerId(0),
                selection: CardSelection::InPlay(canteen),
            },
            RagTime => Action::AffectWithDiscard {
                card,
                discard: discard.unwrap(),
                target: PlayerId(0),
                selection: CardSelection::InPlay(canteen),
            },
            _ => Action::ActivateGreen {
                card,
                target: Some(PlayerId(0)),
                selection: Some(CardSelection::InPlay(canteen)),
            },
        };
        game.act_with_checks(1, action);
        assert!(game.state.players[0].in_play.is_empty(), "{steal:?}");
        if steal.takes_card() {
            // Back in hand: it has to be placed again and is not ready until the next turn.
            assert!(game.state.players[1].hand.contains(&canteen), "{steal:?}");
            play(&mut game, 1, canteen, None);
            assert_eq!(game.state.players[1].fresh_green, vec![canteen]);
            game.reject(
                1,
                Action::ActivateGreen {
                    card: canteen,
                    target: None,
                    selection: None,
                },
                ActionError::InvalidCard,
            );
        } else {
            assert!(game.state.discard_pile.contains(&canteen), "{steal:?}");
        }
    }
}

#[test]
fn losing_a_fresh_green_card_forgets_that_it_was_fresh() {
    let mut game = Scenario::dodge(4);
    let hat = game.give_face(0, TenGallonHat, Diamonds, Jack);
    play(&mut game, 0, hat, None);
    game.state.turn.player = PlayerId(1);
    let cat = game.give_face(1, CatBalou, Clubs, Eight);
    game.act_with_checks(
        1,
        Action::AffectCard {
            card: cat,
            target: PlayerId(0),
            selection: CardSelection::InPlay(hat),
        },
    );
    assert!(game.state.players[0].fresh_green.is_empty());
    invariant(&game.state);
}

#[test]
fn a_second_copy_of_a_green_card_is_refused_while_the_first_is_in_front() {
    let mut game = Scenario::dodge(4);
    let first = game.give_face(0, IronPlate, Diamonds, Ace);
    let second = game.give_face(0, IronPlate, Spades, Queen);
    play(&mut game, 0, first, None);
    game.reject(
        0,
        Action::Play {
            card: second,
            target: None,
        },
        ActionError::DuplicateInPlay,
    );
    // Same for the other green names and for names shared with the base deck.
    let barrel = game.give_face(0, Barrel, Clubs, Ace);
    play(&mut game, 0, barrel, None);
    let barrel2 = game.give_face(0, Barrel, Spades, Queen);
    game.reject(
        0,
        Action::Play {
            card: barrel2,
            target: None,
        },
        ActionError::DuplicateInPlay,
    );
}

#[test]
fn green_missed_cards_answer_a_bang_off_turn_and_a_bible_also_draws() {
    for (kind, draws) in [(TenGallonHat, 0), (IronPlate, 0), (Sombrero, 0), (Bible, 1)] {
        let mut game = Scenario::dodge(4);
        let hand_before = game.state.players[0].hand.len();
        let card = game.ready_green(0, kind);
        game.state.turn.player = PlayerId(1);
        game.shoot(1, 0);
        let events = game.respond(Some(card));
        assert_eq!(health(&game, 0), 5, "{kind:?} cancels the shot");
        assert!(game.state.discard_pile.contains(&card));
        assert!(game.state.players[0].in_play.is_empty());
        assert_eq!(game.state.players[0].hand.len(), hand_before + draws);
        assert_eq!(drawn(&events, 0), draws);
        assert!(events.iter().any(|e| matches!(
            e.kind,
            EventKind::GreenActivated {
                player: PlayerId(0),
                ..
            }
        )));
        assert_eq!(game.state.decision().unwrap().player, PlayerId(1));
    }
}

#[test]
fn green_missed_card_answers_from_the_next_players_turn_while_its_effects_wait_for_the_owner() {
    // Rules example 1: "starting with the next player's turn, you can discard it".
    let mut game = Scenario::dodge(4);
    let sombrero = game.give_face(0, Sombrero, Clubs, Seven);
    let canteen = game.give_face(0, Canteen, Hearts, Seven);
    play(&mut game, 0, sombrero, None);
    play(&mut game, 0, canteen, None);
    assert_eq!(
        game.state.players[0].green_answers().count(),
        0,
        "not in the turn it was placed"
    );
    game.act(0, Action::EndTurn { discard: vec![] });
    assert_eq!(game.state.turn.player, PlayerId(1));
    // The very next turn: the Missed! card answers, the active Canteen still waits for its owner.
    assert_eq!(
        game.state.players[0].green_answers().collect::<Vec<_>>(),
        vec![sombrero]
    );
    assert_eq!(game.state.players[0].fresh_green.len(), 2);
    assert_eq!(spectator_view(&game.state).players[0].green_ready, None);
    // The snapshot already lists the card that may answer, once the shot opens the decision too.
    assert_eq!(
        spectator_view(&game.state).players[0].green_answers,
        Some(vec![sombrero])
    );
    game.shoot(1, 0);
    assert_eq!(
        spectator_view(&game.state).players[0].green_answers,
        Some(vec![sombrero])
    );
    let pending_id = id(&game);
    game.reject(
        0,
        Action::Respond {
            pending_id,
            card: Some(canteen),
        },
        ActionError::WrongAction,
    );
    game.respond(Some(sombrero));
    assert_eq!(health(&game, 0), 5);
    assert!(game.state.discard_pile.contains(&sombrero));
}

#[test]
fn a_green_missed_card_taken_and_placed_again_waits_for_its_new_turn_to_end() {
    let mut game = Scenario::dodge(4);
    let hat = game.ready_green(0, TenGallonHat);
    game.state.turn.player = PlayerId(1);
    let panic = game.give_face(1, Panic, Hearts, Jack);
    game.act_with_checks(
        1,
        Action::AffectCard {
            card: panic,
            target: PlayerId(0),
            selection: CardSelection::InPlay(hat),
        },
    );
    play(&mut game, 1, hat, None);
    assert_eq!(game.state.players[1].green_answers().count(), 0);
    game.act(1, Action::EndTurn { discard: vec![] });
    assert_eq!(
        game.state.players[1].green_answers().collect::<Vec<_>>(),
        vec![hat]
    );
}

#[test]
fn green_cards_only_answer_missed_requests_not_duels_indians_or_dying() {
    let mut game = Scenario::dodge(4);
    let hat = game.ready_green(0, TenGallonHat);
    let bible = game.ready_green(0, Bible);
    game.state.turn.player = PlayerId(1);
    let duel = game.give(1, Duel);
    play(&mut game, 1, duel, Some(0));
    for card in [hat, bible] {
        let pending_id = id(&game);
        game.reject(
            0,
            Action::Respond {
                pending_id,
                card: Some(card),
            },
            ActionError::WrongAction,
        );
    }
    game.respond(None);
    assert_eq!(health(&game, 0), 4);

    let mut game = Scenario::dodge(4);
    let hat = game.ready_green(2, TenGallonHat);
    let indians = game.give(0, Indians);
    play(&mut game, 0, indians, None);
    let pending_id = id(&game);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(1));
    game.respond(None);
    let pending_id2 = id(&game);
    assert_ne!(pending_id, pending_id2);
    game.reject(
        2,
        Action::Respond {
            pending_id: pending_id2,
            card: Some(hat),
        },
        ActionError::WrongAction,
    );

    let mut game = Scenario::dodge(4);
    let hat = game.ready_green(0, TenGallonHat);
    game.state.players[0].health = 1;
    game.state.turn.player = PlayerId(1);
    game.shoot(1, 0);
    game.respond(None);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::Dying { .. }
    ));
    let pending_id = id(&game);
    game.reject(
        0,
        Action::Respond {
            pending_id,
            card: Some(hat),
        },
        ActionError::WrongAction,
    );
}

#[test]
fn green_missed_cards_are_not_usable_during_the_owners_own_turn() {
    let mut game = Scenario::dodge(4);
    for kind in [TenGallonHat, IronPlate, Sombrero] {
        let card = game.ready_green(0, kind);
        game.reject(
            0,
            Action::ActivateGreen {
                card,
                target: None,
                selection: None,
            },
            ActionError::WrongAction,
        );
    }
}

#[test]
fn green_cards_enforce_their_targets_and_ranges() {
    let mut game = Scenario::dodge(6);
    let knife = game.ready_green(0, Knife);
    let ask = |card, target, selection| Action::ActivateGreen {
        card,
        target,
        selection,
    };
    game.reject(0, ask(knife, None, None), ActionError::InvalidTarget);
    game.reject(
        0,
        ask(knife, Some(PlayerId(0)), None),
        ActionError::InvalidTarget,
    );
    game.reject(
        0,
        ask(knife, Some(PlayerId(3)), None),
        ActionError::OutOfRange,
    );
    game.reject(
        0,
        ask(knife, Some(PlayerId(1)), Some(CardSelection::Hand)),
        ActionError::InvalidTarget,
    );
}

#[test]
fn knife_and_derringer_shoot_at_distance_one_without_using_the_bang_limit() {
    for (kind, draws) in [(Knife, 0), (Derringer, 1)] {
        let mut game = Scenario::dodge(6);
        game.character(0, Character::SuzyLafayette);
        let card = game.ready_green(0, kind);
        let bang = game.give(0, Bang);
        let far = Action::ActivateGreen {
            card,
            target: Some(PlayerId(3)),
            selection: None,
        };
        game.reject(0, far, ActionError::OutOfRange);
        let events = game.act(
            0,
            Action::ActivateGreen {
                card,
                target: Some(PlayerId(1)),
                selection: None,
            },
        );
        assert_eq!(drawn(&events, 0), draws, "{kind:?}");
        assert_eq!(game.state.turn.bangs_played, 0);
        assert!(matches!(
            game.state.decision().unwrap().kind,
            DecisionKind::AttackResponse { .. }
        ));
        game.respond(None);
        assert_eq!(health(&game, 1), 3);
        // The BANG! of the turn is still available afterwards.
        game.act_with_checks(
            0,
            Action::Play {
                card: bang,
                target: Some(PlayerId(1)),
            },
        );
        assert_eq!(game.state.turn.bangs_played, 1);
    }
}

#[test]
fn buffalo_rifle_and_pepperbox_follow_their_range_rules() {
    let mut game = Scenario::dodge(7);
    let rifle = game.ready_green(0, BuffaloRifle);
    game.act(
        0,
        Action::ActivateGreen {
            card: rifle,
            target: Some(PlayerId(3)),
            selection: None,
        },
    );
    game.respond(None);
    assert_eq!(health(&game, 3), 3);
    assert_eq!(game.state.turn.bangs_played, 0);

    let mut game = Scenario::dodge(7);
    let pepper = game.ready_green(0, Pepperbox);
    let ask = |target| Action::ActivateGreen {
        card: pepper,
        target: Some(PlayerId(target)),
        selection: None,
    };
    game.reject(0, ask(2), ActionError::OutOfRange);
    game.equip(0, Schofield);
    game.reject(0, ask(3), ActionError::OutOfRange);
    game.act(0, ask(2));
    game.respond(None);
    assert_eq!(health(&game, 2), 3);
}

#[test]
fn howitzer_shoots_every_other_player_in_seat_order_and_barrel_still_helps() {
    let mut game = Scenario::dodge(5);
    let howitzer = game.ready_green(0, Howitzer);
    game.equip(2, Barrel);
    game.top_face(Bang, Hearts, Queen);
    game.act(
        0,
        Action::ActivateGreen {
            card: howitzer,
            target: None,
            selection: None,
        },
    );
    assert_eq!(game.state.decision().unwrap().player, PlayerId(1));
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse {
            kind: AttackKind::Gatling,
            ..
        }
    ));
    // Player 1 takes the hit; player 2's Barrel is flipped (hearts) and saves them.
    game.respond(None);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(3));
    game.respond(None);
    game.respond(None);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(0));
    assert_eq!(health(&game, 0), 5);
    assert_eq!(health(&game, 2), 4);
    for victim in [1, 3, 4] {
        assert_eq!(health(&game, victim), 3, "{victim}");
    }
}

#[test]
fn howitzer_is_not_doubled_by_slab_and_does_not_use_the_bang_limit() {
    let mut game = Scenario::dodge(4);
    game.character(0, Character::SlabTheKiller);
    let howitzer = game.ready_green(0, Howitzer);
    game.act(
        0,
        Action::ActivateGreen {
            card: howitzer,
            target: None,
            selection: None,
        },
    );
    let DecisionKind::AttackResponse { remaining, .. } = game.state.decision().unwrap().kind else {
        panic!()
    };
    assert_eq!(remaining, 1);
    assert_eq!(game.state.turn.bangs_played, 0);
}

#[test]
fn pony_express_draws_three_and_bible_draws_one_during_the_turn() {
    for (kind, count) in [(PonyExpress, 3), (Bible, 1)] {
        let mut game = Scenario::dodge(4);
        let card = game.ready_green(0, kind);
        let events = game.act(
            0,
            Action::ActivateGreen {
                card,
                target: None,
                selection: None,
            },
        );
        assert_eq!(game.state.players[0].hand.len(), count);
        assert_eq!(drawn(&events, 0), count);
        game.reject(
            0,
            Action::ActivateGreen {
                card,
                target: Some(PlayerId(1)),
                selection: None,
            },
            ActionError::InvalidCard,
        );
    }
    let mut game = Scenario::dodge(4);
    let pony = game.ready_green(0, PonyExpress);
    game.reject(
        0,
        Action::ActivateGreen {
            card: pony,
            target: Some(PlayerId(1)),
            selection: None,
        },
        ActionError::InvalidTarget,
    );
}

#[test]
fn can_can_discards_and_conestoga_takes_from_hand_or_table_at_any_distance() {
    for kind in [CanCan, Conestoga] {
        // From the table.
        let mut game = Scenario::dodge(7);
        let card = game.ready_green(0, kind);
        let mustang = game.equip(3, Mustang);
        let events = game.act(
            0,
            Action::ActivateGreen {
                card,
                target: Some(PlayerId(3)),
                selection: Some(CardSelection::InPlay(mustang)),
            },
        );
        if kind == CanCan {
            assert!(game.state.discard_pile.contains(&mustang));
        } else {
            assert_eq!(game.state.players[0].hand, vec![mustang]);
        }
        assert!(events.iter().any(|e| matches!(
            e.kind,
            EventKind::InPlayCardAffected { kind: k, .. } if k == kind
        )));

        // From the hand: a blind slot pick, nothing about the card leaks in public events.
        let mut game = Scenario::dodge(7);
        let card = game.ready_green(0, kind);
        let a = game.give(3, Beer);
        game.give(3, Missed);
        let events = game.act(
            0,
            Action::ActivateGreen {
                card,
                target: Some(PlayerId(3)),
                selection: Some(CardSelection::Hand),
            },
        );
        let DecisionKind::PickHandSlot { kind: k, count, .. } = game.state.decision().unwrap().kind
        else {
            panic!()
        };
        assert_eq!((k, count), (kind, 2));
        assert!(
            filter_events(&events, None)
                .iter()
                .all(|e| !matches!(e.kind, EventKind::HandCardAffected { .. }))
        );
        let PendingKind::PickHandSlot { slots, .. } = &game.state.pending.last().unwrap().kind
        else {
            panic!()
        };
        let slot = slots.iter().position(|c| *c == a).unwrap() as u8;
        game.act(
            0,
            Action::ChooseHandSlot {
                pending_id: id(&game),
                slot,
            },
        );
        assert_eq!(game.state.players[3].hand.len(), 1);
        if kind == CanCan {
            assert!(game.state.discard_pile.contains(&a));
        } else {
            assert!(game.state.players[0].hand.contains(&a));
        }
    }
}

#[test]
fn a_green_card_cannot_pick_itself_as_its_own_can_can_target() {
    let mut game = Scenario::dodge(4);
    let can = game.ready_green(0, CanCan);
    game.reject(
        0,
        Action::ActivateGreen {
            card: can,
            target: Some(PlayerId(0)),
            selection: Some(CardSelection::InPlay(can)),
        },
        ActionError::InvalidTarget,
    );
}

// ---------------------------------------------------------------- brown cards

#[test]
fn punch_shoots_at_distance_one_ignores_weapons_and_the_bang_limit() {
    let mut game = Scenario::dodge(4);
    game.equip(0, Winchester);
    let punch = game.give_face(0, Punch, Spades, Ten);
    game.reject(
        0,
        Action::Play {
            card: punch,
            target: Some(PlayerId(2)),
        },
        ActionError::OutOfRange,
    );
    game.reject(
        0,
        Action::Play {
            card: punch,
            target: Some(PlayerId(0)),
        },
        ActionError::InvalidTarget,
    );
    game.reject(
        0,
        Action::Play {
            card: punch,
            target: None,
        },
        ActionError::InvalidTarget,
    );
    game.equip(1, Mustang);
    game.reject(
        0,
        Action::Play {
            card: punch,
            target: Some(PlayerId(1)),
        },
        ActionError::OutOfRange,
    );
    game.equip(0, Scope);
    let bang = game.give(0, Bang);
    play(&mut game, 0, punch, Some(1));
    assert_eq!(game.state.turn.bangs_played, 0);
    let missed = game.give(1, Missed);
    game.respond(Some(missed));
    assert_eq!(health(&game, 1), 4);
    play(&mut game, 0, bang, Some(1));
    assert_eq!(game.state.turn.bangs_played, 1);
    // A second BANG! is limited; another Punch is not.
    let bang2 = game.give(0, Bang);
    game.respond(None);
    game.reject(
        0,
        Action::Play {
            card: bang2,
            target: Some(PlayerId(1)),
        },
        ActionError::BangLimit,
    );
}

#[test]
fn slab_doubles_only_cards_played_as_bang_not_the_other_shooting_cards() {
    // FAQ Q04: Punch, Springfield, Knife, ... need just one Missed!; a BANG! card still needs two.
    let mut game = Scenario::dodge(4);
    game.character(0, Character::SlabTheKiller);
    let punch = game.give_face(0, Punch, Spades, Ten);
    play(&mut game, 0, punch, Some(1));
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse { remaining: 1, .. }
    ));
    game.respond(None);
    let bang = game.give(0, Bang);
    play(&mut game, 0, bang, Some(1));
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse { remaining: 2, .. }
    ));

    let mut game = Scenario::dodge(4);
    game.character(0, Character::SlabTheKiller);
    let springfield = game.give_face(0, Springfield, Spades, King);
    let extra = game.give(0, Beer);
    game.act(
        0,
        Action::PlayWithDiscard {
            card: springfield,
            discard: extra,
            target: Some(PlayerId(1)),
        },
    );
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse { remaining: 1, .. }
    ));

    // Green shooters, Doc Holyday's ability and a copied Slab (Vera) follow the same rule.
    let mut game = Scenario::dodge(4);
    game.character(0, Character::VeraCuster);
    game.state.players[0].copied = Some(Character::SlabTheKiller);
    let knife = game.ready_green(0, Knife);
    game.act(
        0,
        Action::ActivateGreen {
            card: knife,
            target: Some(PlayerId(1)),
            selection: None,
        },
    );
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse { remaining: 1, .. }
    ));
}

#[test]
fn barrel_and_jourdonnais_work_against_every_shooting_card() {
    // FAQ Q02.
    let mut game = Scenario::dodge(4);
    game.character(1, Character::Jourdonnais);
    game.equip(1, Barrel);
    let punch = game.give_face(0, Punch, Spades, Ten);
    game.act(
        0,
        Action::Play {
            card: punch,
            target: Some(PlayerId(1)),
        },
    );
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse { checks_left: 2, .. }
    ));
}

#[test]
fn springfield_costs_an_extra_card_and_shoots_anyone_at_any_range() {
    let mut game = Scenario::dodge(7);
    let springfield = game.give_face(0, Springfield, Spades, King);
    let ask = |discard, target| Action::PlayWithDiscard {
        card: springfield,
        discard,
        target,
    };
    game.reject(
        0,
        ask(springfield, Some(PlayerId(3))),
        ActionError::InvalidDiscard,
    );
    game.reject(
        0,
        ask(CardId(0), Some(PlayerId(3))),
        ActionError::CardNotInHand,
    );
    let extra = game.give(0, Beer);
    game.reject(0, ask(extra, None), ActionError::InvalidTarget);
    game.reject(0, ask(extra, Some(PlayerId(0))), ActionError::InvalidTarget);
    let events = game.act(0, ask(extra, Some(PlayerId(3))));
    assert!(game.state.discard_pile.contains(&extra));
    assert!(game.state.discard_pile.contains(&springfield));
    assert!(events.iter().any(|e| matches!(
        e.kind,
        EventKind::CardDiscarded { player: PlayerId(0), card } if card == extra
    )));
    assert_eq!(game.state.turn.bangs_played, 0);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(3));
    game.respond(None);
    assert_eq!(health(&game, 3), 3);
}

#[test]
fn tequila_heals_one_for_anyone_and_whisky_two_for_you_never_above_the_maximum() {
    let mut game = Scenario::dodge(4);
    game.state.players[2].health = 1;
    game.state.players[0].health = 2;
    let tequila = game.give_face(0, Tequila, Clubs, Nine);
    let whisky = game.give_face(0, Whisky, Diamonds, Queen);
    let extra1 = game.give(0, Beer);
    let extra2 = game.give(0, Beer);
    let tq = |discard, target| Action::PlayWithDiscard {
        card: tequila,
        discard,
        target,
    };
    game.reject(0, tq(extra1, None), ActionError::InvalidTarget);
    game.reject(
        0,
        tq(tequila, Some(PlayerId(2))),
        ActionError::InvalidDiscard,
    );
    game.act(0, tq(extra1, Some(PlayerId(2))));
    assert_eq!(health(&game, 2), 2);
    let wh = |discard, target| Action::PlayWithDiscard {
        card: whisky,
        discard,
        target,
    };
    game.reject(0, wh(extra2, Some(PlayerId(2))), ActionError::InvalidTarget);
    game.act(0, wh(extra2, None));
    assert_eq!(health(&game, 0), 4);
    // Capped at the maximum.
    let mut game = Scenario::dodge(4);
    game.state.players[1].health = 3;
    let whisky = game.give_face(0, Whisky, Diamonds, Queen);
    let extra = game.give(0, Beer);
    game.state.players[0].health = 4;
    game.act(
        0,
        Action::PlayWithDiscard {
            card: whisky,
            discard: extra,
            target: Some(PlayerId(0)),
        },
    );
    assert_eq!(health(&game, 0), 5);
    let tequila = game.give_face(0, Tequila, Clubs, Nine);
    let extra = game.give(0, Beer);
    game.act(
        0,
        Action::PlayWithDiscard {
            card: tequila,
            discard: extra,
            target: Some(PlayerId(1)),
        },
    );
    assert_eq!(health(&game, 1), 4);
}

#[test]
fn healing_cards_cannot_save_a_dying_player() {
    let mut game = Scenario::dodge(4);
    game.state.players[0].health = 1;
    let tequila = game.give_face(0, Tequila, Clubs, Nine);
    let whisky = game.give_face(0, Whisky, Diamonds, Queen);
    let extra = game.give(0, Beer);
    let canteen = game.ready_green(0, Canteen);
    game.state.turn.player = PlayerId(1);
    game.shoot(1, 0);
    game.respond(None);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::Dying { .. }
    ));
    for action in [
        Action::PlayWithDiscard {
            card: tequila,
            discard: extra,
            target: Some(PlayerId(0)),
        },
        Action::PlayWithDiscard {
            card: whisky,
            discard: extra,
            target: None,
        },
        Action::ActivateGreen {
            card: canteen,
            target: None,
            selection: None,
        },
    ] {
        game.reject(0, action, ActionError::WrongAction);
    }
    let saloon = game.give(0, Saloon);
    game.reject(
        0,
        Action::Play {
            card: saloon,
            target: None,
        },
        ActionError::WrongAction,
    );
}

#[test]
fn rag_time_takes_from_hand_or_table_anywhere_for_one_extra_card() {
    let mut game = Scenario::dodge(7);
    let rag = game.give_face(0, RagTime, Hearts, Nine);
    let extra = game.give(0, Beer);
    let target_hand = game.give(3, Missed);
    game.give(3, Bang);
    let ask = |discard, target, selection| Action::AffectWithDiscard {
        card: rag,
        discard,
        target: PlayerId(target),
        selection,
    };
    game.reject(
        0,
        ask(rag, 3, CardSelection::Hand),
        ActionError::InvalidDiscard,
    );
    game.reject(
        0,
        ask(extra, 4, CardSelection::Hand),
        ActionError::InvalidTarget,
    );
    game.reject(
        0,
        ask(extra, 0, CardSelection::Hand),
        ActionError::InvalidTarget,
    );
    game.act(0, ask(extra, 3, CardSelection::Hand));
    let PendingKind::PickHandSlot { slots, kind, .. } = &game.state.pending.last().unwrap().kind
    else {
        panic!()
    };
    assert_eq!(*kind, RagTime);
    let slot = slots.iter().position(|c| *c == target_hand).unwrap() as u8;
    game.act(
        0,
        Action::ChooseHandSlot {
            pending_id: id(&game),
            slot,
        },
    );
    assert_eq!(game.state.players[0].hand, vec![target_hand]);
    assert!(game.state.discard_pile.contains(&extra));
}

#[test]
fn rag_time_on_yourself_cannot_pick_the_cards_it_is_paying_with() {
    let mut game = Scenario::dodge(4);
    let rag = game.give_face(0, RagTime, Hearts, Nine);
    let extra = game.give(0, Beer);
    game.reject(
        0,
        Action::AffectWithDiscard {
            card: rag,
            discard: extra,
            target: PlayerId(0),
            selection: CardSelection::Hand,
        },
        ActionError::InvalidTarget,
    );
    let mustang = game.equip(0, Mustang);
    game.act(
        0,
        Action::AffectWithDiscard {
            card: rag,
            discard: extra,
            target: PlayerId(0),
            selection: CardSelection::InPlay(mustang),
        },
    );
    assert_eq!(game.state.players[0].hand, vec![mustang]);
}

#[test]
fn brawl_makes_everyone_else_discard_the_card_the_player_picked() {
    let mut game = Scenario::dodge(5);
    let brawl = game.give_face(0, Brawl, Spades, Jack);
    let extra = game.give(0, Beer);
    let mustang = game.equip(2, Mustang);
    let barrel = game.equip(3, Barrel);
    let hand1 = game.give(1, Missed);
    game.give(3, Bang);
    // Player 4 has nothing at all and is skipped.
    let pick = |target, selection| BrawlPick {
        target: PlayerId(target),
        selection,
    };
    let good = vec![
        pick(1, CardSelection::Hand),
        pick(2, CardSelection::InPlay(mustang)),
        pick(3, CardSelection::InPlay(barrel)),
    ];
    let brawl_with = |picks| Action::Brawl {
        card: brawl,
        discard: extra,
        picks,
    };
    // Missing, duplicated, superfluous or invalid picks are all refused.
    game.reject(
        0,
        brawl_with(good[..2].to_vec()),
        ActionError::InvalidTarget,
    );
    let mut extra_pick = good.clone();
    extra_pick.push(pick(4, CardSelection::Hand));
    game.reject(0, brawl_with(extra_pick), ActionError::InvalidTarget);
    let mut dup = good.clone();
    dup.push(good[0]);
    game.reject(0, brawl_with(dup), ActionError::InvalidTarget);
    let mut wrong = good.clone();
    wrong[1] = pick(2, CardSelection::Hand);
    game.reject(0, brawl_with(wrong), ActionError::InvalidTarget);
    let mut foreign = good.clone();
    foreign[1] = pick(2, CardSelection::InPlay(barrel));
    game.reject(0, brawl_with(foreign), ActionError::InvalidTarget);
    game.reject(
        0,
        Action::Brawl {
            card: brawl,
            discard: brawl,
            picks: good.clone(),
        },
        ActionError::InvalidDiscard,
    );
    game.act(0, brawl_with(good.clone()));
    // Player 1's hand card is picked blind, then the table cards go in seat order.
    let DecisionKind::PickHandSlot {
        target,
        kind,
        count,
    } = game.state.decision().unwrap().kind
    else {
        panic!()
    };
    assert_eq!((target, kind, count), (PlayerId(1), Brawl, 1));
    game.act(
        0,
        Action::ChooseHandSlot {
            pending_id: id(&game),
            slot: 0,
        },
    );
    assert!(game.state.pending.is_empty());
    for card in [hand1, mustang, barrel, extra, brawl] {
        assert!(game.state.discard_pile.contains(&card), "{card:?}");
    }
    assert!(game.state.players[1].hand.is_empty());
    assert!(game.state.players[2].in_play.is_empty());
    assert_eq!(game.state.players[3].hand.len(), 1);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(0));
    assert_eq!(game.state.decision().unwrap().kind, DecisionKind::Turn);
}

#[test]
fn brawl_with_nobody_holding_a_card_needs_no_picks_and_skips_dead_players() {
    let mut game = Scenario::dodge(4);
    let brawl = game.give_face(0, Brawl, Spades, Jack);
    let extra = game.give(0, Beer);
    game.dead(2);
    game.give(1, Bang);
    game.act(
        0,
        Action::Brawl {
            card: brawl,
            discard: extra,
            picks: vec![BrawlPick {
                target: PlayerId(1),
                selection: CardSelection::Hand,
            }],
        },
    );
    game.act(
        0,
        Action::ChooseHandSlot {
            pending_id: id(&game),
            slot: 0,
        },
    );
    assert!(game.state.players[1].hand.is_empty());
}

#[test]
fn dodge_cancels_a_bang_draws_a_card_and_is_not_playable_on_your_turn() {
    let mut game = Scenario::dodge(4);
    let dodge = game.give_face(0, Dodge, Diamonds, Seven);
    game.reject(
        0,
        Action::Play {
            card: dodge,
            target: None,
        },
        ActionError::WrongAction,
    );
    game.state.turn.player = PlayerId(1);
    game.shoot(1, 0);
    let events = game.respond(Some(dodge));
    assert_eq!(health(&game, 0), 5);
    assert_eq!(drawn(&events, 0), 1);
    assert_eq!(game.state.players[0].hand.len(), 1);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(1));
}

#[test]
fn dodge_only_answers_missed_requests() {
    let mut game = Scenario::dodge(4);
    let dodge = game.give_face(0, Dodge, Hearts, King);
    game.state.turn.player = PlayerId(1);
    let duel = game.give(1, Duel);
    play(&mut game, 1, duel, Some(0));
    let pending_id = id(&game);
    game.reject(
        0,
        Action::Respond {
            pending_id,
            card: Some(dodge),
        },
        ActionError::WrongAction,
    );
}

#[test]
fn dodge_counts_for_one_of_slabs_two_missed_and_draws() {
    let mut game = Scenario::dodge(4);
    game.character(1, Character::SlabTheKiller);
    let dodge = game.give_face(0, Dodge, Hearts, King);
    let missed = game.give(0, Missed);
    game.state.turn.player = PlayerId(1);
    game.shoot(1, 0);
    let events = game.respond(Some(dodge));
    assert_eq!(drawn(&events, 0), 1);
    assert_eq!(health(&game, 0), 5);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse { remaining: 1, .. }
    ));
    game.respond(Some(missed));
    assert_eq!(health(&game, 0), 5);
}

#[test]
fn binocular_and_hideout_change_distance_by_one_each() {
    let mut game = Scenario::dodge(6);
    let d = |game: &Scenario, from, to| {
        effective_distance(&game.state, PlayerId(from), PlayerId(to)).unwrap()
    };
    assert_eq!(d(&game, 0, 3), 3);
    game.equip(0, Binocular);
    assert_eq!(d(&game, 0, 3), 2);
    game.equip(3, Hideout);
    assert_eq!(d(&game, 0, 3), 3);
    game.equip(3, Mustang);
    assert_eq!(d(&game, 0, 3), 4);
    // Different names, so Scope and Binocular (or Mustang and Hideout) may be held together.
    game.equip(0, Scope);
    assert_eq!(d(&game, 0, 3), 3);
    // Looking at someone else does not use their own Hideout.
    assert_eq!(d(&game, 3, 0), 3);
    let mut game = Scenario::dodge(4);
    let hideout = game.give_face(0, Hideout, Diamonds, King);
    play(&mut game, 0, hideout, None);
    let again = game.give_face(0, Binocular, Diamonds, Ten);
    play(&mut game, 0, again, None);
    for _ in 0..1 {
        let another = game.give(0, Mustang);
        play(&mut game, 0, another, None);
    }
    assert_eq!(game.state.players[0].in_play.len(), 3);
}

#[test]
fn pack_weapons_have_the_listed_ranges() {
    let mut game = Scenario::dodge(4);
    let remington = game.give_face(0, Remington, Diamonds, Six);
    play(&mut game, 0, remington, None);
    assert_eq!(game.state.players[0].weapon_range(), 3);
    let carabine = game.give_face(0, RevCarabine, Spades, Five);
    play(&mut game, 0, carabine, None);
    // Classic mode keeps one weapon: the new one replaces the old.
    assert_eq!(game.state.players[0].weapon_range(), 4);
    assert!(game.state.discard_pile.contains(&remington));
}

#[test]
fn two_dynamites_never_stack_on_one_player() {
    let mut game = Scenario::dodge(4);
    let first = game.give_face(0, Dynamite, Hearts, Two);
    let second = game.give_face(1, Dynamite, Clubs, Ten);
    play(&mut game, 0, first, None);
    game.state.turn.player = PlayerId(1);
    play(&mut game, 1, second, None);
    // Player 0's turn: a safe flip passes the Dynamite on, skipping player 1 who holds one.
    game.top_face(Bang, Hearts, Queen);
    begin_turn(&mut game, 0);
    assert!(game.state.players[0].in_play.is_empty());
    assert_eq!(kinds(&game.state.players[1].in_play), vec![Dynamite]);
    assert_eq!(kinds(&game.state.players[2].in_play), vec![Dynamite]);
    invariant(&game.state);
}

#[test]
fn club_mode_allows_only_one_dynamite_on_the_table() {
    let mut game = Scenario::dodge(4);
    game.state.config.mode = GameMode::Club;
    let first = game.give_face(0, Dynamite, Hearts, Two);
    let second = game.give_face(1, Dynamite, Clubs, Ten);
    play(&mut game, 0, first, None);
    game.state.turn.player = PlayerId(1);
    game.reject(
        1,
        Action::Play {
            card: second,
            target: None,
        },
        ActionError::DuplicateInPlay,
    );
}

// ---------------------------------------------------------------- characters

#[test]
fn apache_kid_ignores_diamond_cards_of_others_except_in_a_duel() {
    let mut game = Scenario::dodge(5);
    game.character(1, Character::ApacheKid);
    let bang_d = game.give_face(0, Bang, Diamonds, Two);
    let bang_c = game.give_face(0, Bang, Clubs, Two);
    let panic_d = game.give_face(0, Panic, Diamonds, Eight);
    let cat_d = game.give_face(0, CatBalou, Diamonds, Ten);
    let panic_h = game.give_face(0, Panic, Hearts, Jack);
    let beer = game.give(1, Beer);
    game.reject(
        0,
        Action::Play {
            card: bang_d,
            target: Some(PlayerId(1)),
        },
        ActionError::InvalidTarget,
    );
    for card in [panic_d, cat_d] {
        game.reject(
            0,
            Action::AffectCard {
                card,
                target: PlayerId(1),
                selection: CardSelection::Hand,
            },
            ActionError::InvalidTarget,
        );
    }
    // Other suits work, and the diamond BANG! is fine against everyone else.
    game.act_with_checks(
        0,
        Action::AffectCard {
            card: panic_h,
            target: PlayerId(1),
            selection: CardSelection::Hand,
        },
    );
    assert!(game.state.players[0].hand.contains(&beer));
    play(&mut game, 0, bang_c, Some(1));
    game.respond(None);
    assert_eq!(health(&game, 1), 2);
    let mut game = Scenario::dodge(5);
    game.character(1, Character::ApacheKid);
    let bang_d = game.give_face(0, Bang, Diamonds, Two);
    game.reject(
        0,
        Action::Play {
            card: bang_d,
            target: Some(PlayerId(1)),
        },
        ActionError::InvalidTarget,
    );
    let mut game = Scenario::dodge(5);
    game.character(2, Character::ApacheKid);
    let bang_d = game.give_face(0, Bang, Diamonds, Two);
    play(&mut game, 0, bang_d, Some(1));
    assert_eq!(game.state.decision().unwrap().player, PlayerId(1));
}

#[test]
fn apache_kid_is_skipped_by_indians_but_hit_by_gatling_and_duels_from_diamonds() {
    let mut game = Scenario::dodge(4);
    game.character(2, Character::ApacheKid);
    let indians = game.give_face(0, Indians, Diamonds, Five);
    play(&mut game, 0, indians, None);
    game.respond(None);
    game.respond(None);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(0));
    assert_eq!(health(&game, 1), 3);
    assert_eq!(health(&game, 2), 3);
    assert_eq!(health(&game, 3), 3);
    assert_eq!(game.state.players[2].max_health, 3);

    let mut game = Scenario::dodge(4);
    game.character(2, Character::ApacheKid);
    let gatling = game.give(0, Gatling);
    play(&mut game, 0, gatling, None);
    game.respond(None);
    game.respond(None);
    game.respond(None);
    assert_eq!(health(&game, 2), 2);

    // Duel Q♦: the ability is off, so the Duel works and ♦ BANG!s may be answered with.
    let mut game = Scenario::dodge(4);
    game.character(2, Character::ApacheKid);
    let duel = game.give_face(0, Duel, Diamonds, Queen);
    play(&mut game, 0, duel, Some(2));
    assert_eq!(game.state.decision().unwrap().player, PlayerId(2));
    game.respond(None);
    assert_eq!(health(&game, 2), 2);
}

#[test]
fn apache_kid_is_immune_to_conestoga_but_not_to_can_can() {
    let mut game = Scenario::dodge(4);
    game.character(1, Character::ApacheKid);
    let conestoga = game.ready_green(0, Conestoga);
    let can_can = game.ready_green(0, CanCan);
    game.give(1, Beer);
    game.reject(
        0,
        Action::ActivateGreen {
            card: conestoga,
            target: Some(PlayerId(1)),
            selection: Some(CardSelection::Hand),
        },
        ActionError::InvalidTarget,
    );
    game.act(
        0,
        Action::ActivateGreen {
            card: can_can,
            target: Some(PlayerId(1)),
            selection: Some(CardSelection::Hand),
        },
    );
}

#[test]
fn doc_holyday_cannot_hit_apache_kid_with_two_diamonds_only() {
    let mut game = Scenario::dodge(4);
    game.character(0, Character::DocHolyday);
    game.character(1, Character::ApacheKid);
    let a = game.give_face(0, Bang, Diamonds, Two);
    let b = game.give_face(0, Bang, Diamonds, Three);
    let c = game.give_face(0, Bang, Clubs, Two);
    game.reject(
        0,
        Action::DocHolyday {
            cards: [a, b],
            target: PlayerId(1),
        },
        ActionError::InvalidTarget,
    );
    game.act(
        0,
        Action::DocHolyday {
            cards: [a, c],
            target: PlayerId(1),
        },
    );
    assert_eq!(game.state.decision().unwrap().player, PlayerId(1));
}

#[test]
fn belle_star_switches_off_every_card_in_front_of_the_others_during_her_turn() {
    let mut game = Scenario::dodge(5);
    game.character(0, Character::BelleStar);
    game.equip(2, Mustang);
    game.equip(2, Barrel);
    game.equip(2, Hideout);
    let sombrero = game.ready_green(2, Sombrero);
    game.equip(0, Mustang);
    game.equip(0, Barrel);
    // Others' Mustang/Hideout do not count, so the BANG! at distance 2 reaches with Colt .45 + Scope.
    game.equip(0, Scope);
    assert_eq!(
        effective_distance(&game.state, PlayerId(0), PlayerId(2)),
        Ok(1)
    );
    game.shoot(0, 2);
    // No Barrel flip is offered and the green Missed! stays dead.
    let DecisionKind::AttackResponse { checks_left, .. } = game.state.decision().unwrap().kind
    else {
        panic!()
    };
    assert_eq!(checks_left, 0);
    let pending_id = id(&game);
    game.reject(
        2,
        Action::Respond {
            pending_id,
            card: Some(sombrero),
        },
        ActionError::WrongAction,
    );
    game.respond(None);
    assert_eq!(health(&game, 2), 3);
    // Her own cards keep working on other players' turns...
    game.state.turn.player = PlayerId(1);
    game.state.turn.bangs_played = 0;
    assert_eq!(
        effective_distance(&game.state, PlayerId(1), PlayerId(0)),
        Ok(2)
    );
    // ...and theirs work again once it is no longer her turn.
    assert_eq!(
        effective_distance(&game.state, PlayerId(1), PlayerId(2)),
        Ok(1 + 2)
    );
    game.equip(1, Winchester);
    // The Barrel is back in force: it flips (spades fails) before the green card answers.
    game.top_face(Missed, Spades, Two);
    let events = game.shoot(1, 2);
    let _ = events;
    assert!(
        game.state
            .discard_pile
            .iter()
            .any(|c| c.card().unwrap().suit == Spades)
    );
    let DecisionKind::AttackResponse { remaining, .. } = game.state.decision().unwrap().kind else {
        panic!()
    };
    assert_eq!(remaining, 1);
    game.respond(Some(sombrero));
    assert_eq!(health(&game, 2), 3);
}

#[test]
fn belle_star_does_not_disable_characters_only_cards() {
    let mut game = Scenario::dodge(4);
    game.character(0, Character::BelleStar);
    game.character(1, Character::Jourdonnais);
    let bang = game.give(0, Bang);
    game.act(
        0,
        Action::Play {
            card: bang,
            target: Some(PlayerId(1)),
        },
    );
    // Jourdonnais is not a card: his barrel draw is still offered on Belle's turn.
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse { checks_left: 1, .. }
    ));
}

#[test]
fn bill_noface_draws_one_plus_the_health_he_has_lost() {
    for (health_now, draws) in [(4, 1), (3, 2), (1, 4)] {
        let mut game = Scenario::dodge(4);
        game.character(1, Character::BillNoface);
        game.state.players[1].health = health_now;
        begin_turn(&mut game, 1);
        assert_eq!(game.state.players[1].hand.len(), draws, "hp {health_now}");
    }
}

#[test]
fn chuck_wengam_trades_health_for_two_cards_but_never_his_last_life() {
    let mut game = Scenario::dodge(4);
    game.character(0, Character::ChuckWengam);
    assert_eq!(health(&game, 0), 5);
    let events = game.act(0, Action::ChuckDraw);
    assert_eq!(health(&game, 0), 4);
    assert_eq!(game.state.players[0].hand.len(), 2);
    assert!(events.iter().any(|e| matches!(
        e.kind,
        EventKind::SkillActivated {
            character: Character::ChuckWengam,
            ..
        }
    )));
    for _ in 0..3 {
        game.act(0, Action::ChuckDraw);
    }
    assert_eq!(health(&game, 0), 1);
    assert_eq!(game.state.players[0].hand.len(), 8);
    game.reject(0, Action::ChuckDraw, ActionError::WrongAction);
    // Other characters and other players' turns cannot use it.
    game.state.turn.player = PlayerId(1);
    game.reject(1, Action::ChuckDraw, ActionError::WrongAction);
    game.reject(0, Action::ChuckDraw, ActionError::NotYourDecision);
}

#[test]
fn doc_holyday_shoots_once_per_turn_for_two_cards_without_the_bang_limit() {
    let mut game = Scenario::dodge(5);
    game.character(0, Character::DocHolyday);
    let hand: Vec<_> = (0..6).map(|_| game.give(0, Beer)).collect();
    let ask = |a, b, target| Action::DocHolyday {
        cards: [a, b],
        target: PlayerId(target),
    };
    game.reject(0, ask(hand[0], hand[0], 1), ActionError::InvalidDiscard);
    game.reject(0, ask(hand[0], hand[1], 0), ActionError::InvalidTarget);
    game.reject(0, ask(hand[0], hand[1], 2), ActionError::OutOfRange);
    game.reject(0, ask(hand[0], CardId(0), 1), ActionError::CardNotInHand);
    game.act(0, ask(hand[0], hand[1], 1));
    assert!(
        game.state.discard_pile.contains(&hand[0]) && game.state.discard_pile.contains(&hand[1])
    );
    assert_eq!(game.state.turn.bangs_played, 0);
    let missed = game.give(1, Missed);
    game.respond(Some(missed));
    assert_eq!(health(&game, 1), 4);
    // Once per turn, but the normal BANG! is still available.
    game.reject(0, ask(hand[2], hand[3], 1), ActionError::WrongAction);
    game.shoot(0, 1);
    game.respond(None);
    assert_eq!(health(&game, 1), 3);
    // A new turn refreshes the skill.
    begin_turn(&mut game, 0);
    game.state.draw_pile.reverse();
    game.act_with_checks(0, ask(hand[2], hand[3], 1));
    assert_eq!(game.state.decision().unwrap().player, PlayerId(1));
    // Only Doc has it.
    let mut other = Scenario::dodge(4);
    let (a, b) = (other.give(0, Beer), other.give(0, Beer));
    other.reject(0, ask(a, b, 1), ActionError::WrongAction);
}

#[test]
fn elena_fuente_answers_a_bang_with_any_card_but_only_a_missed_request() {
    let mut game = Scenario::dodge(4);
    game.character(0, Character::ElenaFuente);
    let junk = game.give(0, Saloon);
    let dodge = game.give_face(0, Dodge, Hearts, King);
    game.state.turn.player = PlayerId(1);
    game.shoot(1, 0);
    let events = game.respond(Some(junk));
    assert_eq!(health(&game, 0), 4);
    assert!(game.state.discard_pile.contains(&junk));
    assert!(events.iter().any(|e| matches!(
        e.kind,
        EventKind::SkillActivated {
            character: Character::ElenaFuente,
            ..
        }
    )));
    // A Dodge used this way still draws; it is a normal Missed! for her.
    game.state.turn.bangs_played = 0;
    game.shoot(1, 0);
    let events = game.respond(Some(dodge));
    assert_eq!(drawn(&events, 0), 1);
    assert!(
        !events
            .iter()
            .any(|e| matches!(e.kind, EventKind::SkillActivated { .. }))
    );
    // Not for BANG! requests (Duel) nor for Beer.
    let card = game.give(0, Stagecoach);
    let duel = game.give(1, Duel);
    game.state.turn.bangs_played = 0;
    play(&mut game, 1, duel, Some(0));
    let pending_id = id(&game);
    game.reject(
        0,
        Action::Respond {
            pending_id,
            card: Some(card),
        },
        ActionError::WrongAction,
    );
    game.respond(None);
    game.state.players[0].health = 1;
    game.shoot(1, 0);
    game.respond(None);
    let pending_id = id(&game);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::Dying { .. }
    ));
    let card = game.give(0, WellsFargo);
    game.reject(
        0,
        Action::Respond {
            pending_id,
            card: Some(card),
        },
        ActionError::WrongAction,
    );
}

#[test]
fn greg_digger_heals_two_and_herb_hunter_draws_two_when_someone_else_is_eliminated() {
    for (character, want_heal, want_draw) in
        [(Character::GregDigger, 2, 0), (Character::HerbHunter, 0, 2)]
    {
        let mut game = Scenario::dodge(6);
        game.character(4, character);
        game.state.players[4].health = 1;
        game.state.players[2].role = Role::Deputy;
        kill_by_bang(&mut game, 1, 2);
        assert!(!game.state.players[2].alive);
        assert_eq!(health(&game, 4), 1 + want_heal, "{character:?}");
        assert_eq!(game.state.players[4].hand.len(), want_draw, "{character:?}");
    }
    // Healing stops at the maximum, and his own death triggers nothing.
    let mut game = Scenario::dodge(5);
    game.character(3, Character::GregDigger);
    game.state.players[3].health = 3;
    kill_by_bang(&mut game, 1, 2);
    assert_eq!(health(&game, 3), 4);
    let mut game = Scenario::dodge(5);
    game.character(3, Character::HerbHunter);
    kill_by_bang(&mut game, 2, 3);
    assert!(!game.state.players[3].alive && game.state.players[3].hand.is_empty());
    for other in [0, 4] {
        assert_eq!(game.state.players[other].hand.len(), 0);
    }
    // The Outlaw's killer takes the bounty; the Herb Hunter's own death gives nobody two cards.
    assert_eq!(game.state.players[2].hand.len(), 3);
}

#[test]
fn herb_and_greg_act_after_vulture_sam_collects_the_cards() {
    let mut game = Scenario::dodge(6);
    game.character(3, Character::VultureSam);
    game.character(4, Character::HerbHunter);
    game.give(2, Beer);
    game.state.players[2].role = Role::Deputy;
    let canteen = game.ready_green(2, Canteen);
    kill_by_bang(&mut game, 1, 2);
    assert!(game.state.players[3].hand.contains(&canteen));
    assert!(game.state.players[3].fresh_green.is_empty());
    assert_eq!(game.state.players[4].hand.len(), 2);
    // The inherited green card is just a hand card: it must be placed again.
    assert!(!game.state.players[3].in_play.contains(&canteen));
    invariant(&game.state);
}

#[test]
fn jose_delgado_discards_a_blue_card_to_draw_two_up_to_twice_a_turn() {
    let mut game = Scenario::dodge(4);
    game.character(0, Character::JoseDelgado);
    let blues: Vec<_> = [Mustang, Barrel, Hideout]
        .into_iter()
        .map(|k| game.give(0, k))
        .collect();
    let green = game.give_face(0, Canteen, Hearts, Seven);
    let brown = game.give(0, Beer);
    game.reject(
        0,
        Action::JoseDelgado { card: green },
        ActionError::InvalidCard,
    );
    game.reject(
        0,
        Action::JoseDelgado { card: brown },
        ActionError::InvalidCard,
    );
    game.reject(
        0,
        Action::JoseDelgado { card: CardId(0) },
        ActionError::CardNotInHand,
    );
    let events = game.act(0, Action::JoseDelgado { card: blues[0] });
    assert_eq!(drawn(&events, 0), 2);
    assert!(game.state.discard_pile.contains(&blues[0]));
    game.act(0, Action::JoseDelgado { card: blues[1] });
    assert_eq!(game.state.skill_uses.jose_delgado, 2);
    game.reject(
        0,
        Action::JoseDelgado { card: blues[2] },
        ActionError::WrongAction,
    );
    assert_eq!(game.state.players[0].hand.len(), 7);
    // New turn, new allowance.
    begin_turn(&mut game, 0);
    game.act(0, Action::JoseDelgado { card: blues[2] });
    let mut other = Scenario::dodge(4);
    let m = other.give(0, Mustang);
    other.reject(0, Action::JoseDelgado { card: m }, ActionError::WrongAction);
}

#[test]
fn pixie_pete_draws_three_and_sean_mallory_keeps_ten_cards() {
    let mut game = Scenario::dodge(4);
    game.character(1, Character::PixiePete);
    begin_turn(&mut game, 1);
    assert_eq!(game.state.players[1].hand.len(), 3);

    let mut game = Scenario::dodge(4);
    game.character(0, Character::SeanMallory);
    for _ in 0..10 {
        game.give(0, Missed);
    }
    assert_eq!(game.state.players[0].health, 4);
    game.act(0, Action::EndTurn { discard: vec![] });
    assert_eq!(game.state.turn.player, PlayerId(1));
    assert_eq!(game.state.players[0].hand.len(), 10);

    let mut game = Scenario::dodge(4);
    game.character(0, Character::SeanMallory);
    game.state.players[0].health = 1;
    let hand: Vec<_> = (0..11).map(|_| game.give(0, Missed)).collect();
    game.reject(
        0,
        Action::EndTurn { discard: vec![] },
        ActionError::InvalidDiscard,
    );
    game.reject(
        0,
        Action::EndTurn {
            discard: hand[..2].to_vec(),
        },
        ActionError::InvalidDiscard,
    );
    let (player, action) = default_action(&game.state).unwrap();
    assert_eq!(player, PlayerId(0));
    let Action::EndTurn { discard } = &action else {
        panic!()
    };
    assert_eq!(discard.len(), 1);
    game.act(0, action);
    assert_eq!(game.state.players[0].hand.len(), 10);
}

#[test]
fn tequila_joe_heals_two_with_beer_but_one_with_everything_else() {
    let mut game = Scenario::dodge(4);
    game.character(0, Character::TequilaJoe);
    game.state.players[0].health = 1;
    let beer = game.give(0, Beer);
    play(&mut game, 0, beer, None);
    assert_eq!(health(&game, 0), 3);
    let beer = game.give(0, Beer);
    play(&mut game, 0, beer, None);
    assert_eq!(health(&game, 0), 5, "capped at his maximum");
    game.state.players[0].health = 1;
    let saloon = game.give(0, Saloon);
    play(&mut game, 0, saloon, None);
    assert_eq!(health(&game, 0), 2);
    let canteen = game.ready_green(0, Canteen);
    game.act(
        0,
        Action::ActivateGreen {
            card: canteen,
            target: None,
            selection: None,
        },
    );
    assert_eq!(health(&game, 0), 3);
    let extra = game.give(0, Bang);
    let tequila = game.give_face(0, Tequila, Clubs, Nine);
    game.act(
        0,
        Action::PlayWithDiscard {
            card: tequila,
            discard: extra,
            target: Some(PlayerId(0)),
        },
    );
    assert_eq!(health(&game, 0), 4);
    // The Beer that saves a dying Tequila Joe also heals two.
    let mut game = Scenario::dodge(4);
    game.character(1, Character::TequilaJoe);
    game.state.players[1].health = 1;
    game.state.turn.player = PlayerId(0);
    let beer = game.give(1, Beer);
    game.shoot(0, 1);
    game.respond(None);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::Dying { .. }
    ));
    game.respond(Some(beer));
    assert_eq!(health(&game, 1), 2);
}

#[test]
fn molly_stark_draws_for_voluntary_answers_off_turn_but_not_for_forced_discards() {
    // Missed!, then Dodge (its own draw plus hers), then declining and the green Missed!.
    let mut game = Scenario::dodge(4);
    game.character(1, Character::MollyStark);
    let missed = game.give(1, Missed);
    game.shoot(0, 1);
    let events = game.respond(Some(missed));
    assert_eq!(drawn(&events, 1), 1);
    assert_eq!(game.state.players[1].hand.len(), 1);

    let mut game = Scenario::dodge(4);
    game.character(1, Character::MollyStark);
    let dodge = game.give_face(1, Dodge, Hearts, King);
    game.shoot(0, 1);
    let events = game.respond(Some(dodge));
    assert_eq!(drawn(&events, 1), 2);

    let mut game = Scenario::dodge(4);
    game.character(1, Character::MollyStark);
    game.shoot(0, 1);
    let events = game.respond(None);
    assert_eq!(drawn(&events, 1), 0);
    let plate = game.ready_green(1, IronPlate);
    game.state.turn.bangs_played = 0;
    game.shoot(0, 1);
    let events = game.respond(Some(plate));
    assert_eq!(drawn(&events, 1), 0, "a green card is not a Missed! card");

    // Forced discards do not count.
    let mut game = Scenario::dodge(4);
    game.character(1, Character::MollyStark);
    game.give(1, Missed);
    let cat = game.give(0, CatBalou);
    let events = game.act_with_checks(
        0,
        Action::AffectCard {
            card: cat,
            target: PlayerId(1),
            selection: CardSelection::Hand,
        },
    );
    assert_eq!(drawn(&events, 1), 0);
    assert!(game.state.players[1].hand.is_empty());
}

#[test]
fn molly_stark_draws_for_a_beer_that_saves_her_and_for_bang_answers_to_indians() {
    let mut game = Scenario::dodge(4);
    game.character(1, Character::MollyStark);
    game.state.players[1].health = 1;
    let beer = game.give(1, Beer);
    game.shoot(0, 1);
    game.respond(None);
    let events = game.respond(Some(beer));
    assert_eq!(health(&game, 1), 1);
    assert_eq!(drawn(&events, 1), 1);

    let mut game = Scenario::dodge(4);
    game.character(1, Character::MollyStark);
    let bang = game.give(1, Bang);
    let indians = game.give(0, Indians);
    play(&mut game, 0, indians, None);
    let events = game.respond(Some(bang));
    assert_eq!(drawn(&events, 1), 1);
    assert_eq!(health(&game, 1), 4);
}

#[test]
fn molly_stark_is_paid_for_duel_bangs_only_after_the_duel_ends() {
    // Challenged on someone else's turn: her two BANG!s pay two cards once the Duel is over.
    let mut game = Scenario::dodge(4);
    game.character(1, Character::MollyStark);
    let bangs: Vec<_> = (0..3).map(|_| game.give(1, Bang)).collect();
    let opponent_bangs: Vec<_> = (0..2).map(|_| game.give(0, Bang)).collect();
    let duel = game.give(0, Duel);
    play(&mut game, 0, duel, Some(1));
    let before = game.state.players[1].hand.len();
    let events = game.respond(Some(bangs[0]));
    assert_eq!(drawn(&events, 1), 0);
    game.respond(Some(opponent_bangs[0]));
    let events = game.respond(Some(bangs[1]));
    assert_eq!(drawn(&events, 1), 0);
    assert_eq!(game.state.players[1].hand.len(), before - 2);
    // The challenger runs out: she takes the hit and Molly collects.
    let events = game.respond(None);
    assert_eq!(health(&game, 0), 4);
    assert_eq!(drawn(&events, 1), 2);
    assert_eq!(game.state.players[1].hand.len(), before - 2 + 2);

    // Her own Duel on her own turn counts too, and she is paid even if she loses it.
    let mut game = Scenario::dodge(4);
    game.character(0, Character::MollyStark);
    let bang = game.give(0, Bang);
    let other = game.give(1, Bang);
    let duel = game.give(0, Duel);
    play(&mut game, 0, duel, Some(1));
    game.respond(Some(other));
    game.respond(Some(bang));
    let events = game.respond(None);
    assert_eq!(health(&game, 1), 3);
    assert_eq!(drawn(&events, 0), 1);
}

#[test]
fn pat_brennan_takes_one_table_card_instead_of_drawing() {
    let mut game = Scenario::dodge(5);
    game.character(0, Character::PatBrennan);
    let mustang = game.equip(2, Mustang);
    let green_card = game.ready_green(3, Canteen);
    game.state.players[3].fresh_green.push(green_card);
    begin_turn(&mut game, 0);
    assert_eq!(
        game.state.decision().unwrap().kind,
        DecisionKind::DrawChoice
    );
    let pending_id = id(&game);
    let take = |player, card| Action::ChooseDrawSource {
        pending_id,
        source: DrawSource::InPlay {
            player: PlayerId(player),
            card,
        },
    };
    game.reject(0, take(1, mustang), ActionError::InvalidTarget);
    game.reject(0, take(2, green_card), ActionError::InvalidTarget);
    let events = game.act(0, take(3, green_card));
    assert_eq!(game.state.players[0].hand, vec![green_card]);
    assert!(game.state.players[3].in_play.is_empty());
    assert!(game.state.players[3].fresh_green.is_empty());
    assert_eq!(drawn(&events, 0), 0, "one card only, nothing drawn");
    assert!(filter_events(&events, None).iter().any(|e| matches!(
        e.kind,
        EventKind::TableCardTaken { player: PlayerId(0), target: PlayerId(3), card } if card == green_card
    )));
    assert_eq!(game.state.decision().unwrap().kind, DecisionKind::Turn);
    // The taken green card must be placed again before it can be used.
    play(&mut game, 0, green_card, None);
    assert_eq!(game.state.players[0].fresh_green, vec![green_card]);
}

#[test]
fn pat_brennan_may_take_from_himself_draw_two_or_time_out_to_the_deck() {
    let mut game = Scenario::dodge(4);
    game.character(0, Character::PatBrennan);
    let barrel = game.equip(0, Barrel);
    begin_turn(&mut game, 0);
    let pending_id = id(&game);
    game.act(
        0,
        Action::ChooseDrawSource {
            pending_id,
            source: DrawSource::InPlay {
                player: PlayerId(0),
                card: barrel,
            },
        },
    );
    assert_eq!(game.state.players[0].hand, vec![barrel]);

    let mut game = Scenario::dodge(4);
    game.character(0, Character::PatBrennan);
    begin_turn(&mut game, 0);
    let pending_id = id(&game);
    let events = game.act(
        0,
        Action::ChooseDrawSource {
            pending_id,
            source: DrawSource::Deck,
        },
    );
    assert_eq!(drawn(&events, 0), 2);

    let mut game = Scenario::dodge(4);
    game.character(0, Character::PatBrennan);
    begin_turn(&mut game, 0);
    game.end();
    assert_eq!(game.state.players[0].hand.len(), 2);
}

#[test]
fn vera_custer_picks_a_character_each_turn_before_drawing_and_keeps_it_until_then() {
    let mut game = Scenario::dodge(5);
    game.character(0, Character::VeraCuster);
    game.character(3, Character::WillyTheKid);
    game.character(4, Character::PixiePete);
    begin_turn(&mut game, 0);
    let decision = game.state.decision().unwrap();
    assert_eq!(decision.kind, DecisionKind::ChooseCopy);
    assert_eq!(decision.player, PlayerId(0));
    assert!(
        game.state.players[0].hand.is_empty(),
        "nothing is drawn before the pick"
    );
    let pending_id = id(&game);
    let pick = |pending_id, target| Action::ChooseCopy {
        pending_id,
        target: PlayerId(target),
    };
    game.reject(0, pick(pending_id, 0), ActionError::InvalidTarget);
    game.reject(0, pick(PendingId(999), 3), ActionError::StalePending);
    game.reject(
        0,
        Action::EndTurn { discard: vec![] },
        ActionError::WrongAction,
    );
    game.dead(2);
    game.reject(0, pick(pending_id, 2), ActionError::InvalidTarget);
    game.reject(1, pick(pending_id, 3), ActionError::NotYourDecision);
    let events = game.act(0, pick(pending_id, 3));
    assert!(events.iter().any(|e| matches!(
        e.kind,
        EventKind::CopyChosen {
            player: PlayerId(0),
            copied: Character::WillyTheKid
        }
    )));
    assert_eq!(game.state.players[0].copied, Some(Character::WillyTheKid));
    assert_eq!(
        spectator_view(&game.state).players[0].copied,
        Some(Character::WillyTheKid)
    );
    assert_eq!(game.state.players[0].hand.len(), 2);
    assert_eq!(game.state.decision().unwrap().kind, DecisionKind::Turn);
    // She now shoots without the one-BANG! limit, and the printed character is untouched.
    let range = game.give(0, Bang);
    let two = game.give(0, Bang);
    assert_eq!(game.state.players[0].character, Character::VeraCuster);
    play(&mut game, 0, range, Some(1));
    game.respond(None);
    play(&mut game, 0, two, Some(1));
    game.respond(None);
    // The ability lasts through the others' turns...
    game.state.turn.player = PlayerId(0);
    game.end();
    assert_eq!(game.state.players[0].copied, Some(Character::WillyTheKid));
    // ...until her next turn, where she picks again (the old one still holds before that).
    begin_turn(&mut game, 0);
    assert_eq!(
        game.state.decision().unwrap().kind,
        DecisionKind::ChooseCopy
    );
    assert_eq!(game.state.players[0].copied, Some(Character::WillyTheKid));
    let pending_id = id(&game);
    let before = game.state.players[0].hand.len();
    game.act(0, pick(pending_id, 4));
    assert_eq!(game.state.players[0].copied, Some(Character::PixiePete));
    assert_eq!(game.state.players[0].hand.len(), before + 3);
}

#[test]
fn vera_custer_timeout_picks_the_next_living_player_and_every_copy_runs_through_has() {
    let mut game = Scenario::dodge(4);
    game.character(0, Character::VeraCuster);
    game.character(1, Character::KitCarlson);
    begin_turn(&mut game, 0);
    let (player, action) = default_action(&game.state).unwrap();
    assert_eq!(player, PlayerId(0));
    assert!(matches!(
        action,
        Action::ChooseCopy {
            target: PlayerId(1),
            ..
        }
    ));
    game.act(0, action);
    // Kit Carlson's draw: three cards offered, two kept.
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::KeepCards { keep: 2 }
    ));

    let mut game = Scenario::dodge(4);
    game.character(0, Character::VeraCuster);
    game.character(2, Character::PatBrennan);
    begin_turn(&mut game, 0);
    let pending_id = id(&game);
    game.act(
        0,
        Action::ChooseCopy {
            pending_id,
            target: PlayerId(2),
        },
    );
    assert_eq!(
        game.state.decision().unwrap().kind,
        DecisionKind::DrawChoice
    );

    // Copying Jourdonnais gives her the barrel draw against shots at her.
    let mut game = Scenario::dodge(4);
    game.character(0, Character::VeraCuster);
    game.character(2, Character::Jourdonnais);
    begin_turn(&mut game, 0);
    let pending_id = id(&game);
    game.act(
        0,
        Action::ChooseCopy {
            pending_id,
            target: PlayerId(2),
        },
    );
    game.state.turn.player = PlayerId(1);
    let bang = game.give(1, Bang);
    game.act(
        1,
        Action::Play {
            card: bang,
            target: Some(PlayerId(0)),
        },
    );
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse { checks_left: 1, .. }
    ));
}

#[test]
fn vera_custer_as_the_first_player_asks_for_her_pick_at_the_start_of_the_game() {
    for seed in 0..400 {
        let (state, events) =
            setup(5, dodge_config(5), &mut ChaCha8Rng::seed_from_u64(seed)).unwrap();
        invariant(&state);
        if state.players[state.turn.player.0].character == Character::VeraCuster {
            assert_eq!(state.decision().unwrap().kind, DecisionKind::ChooseCopy);
            assert!(events.iter().any(|e| matches!(
                e.kind,
                EventKind::DecisionChanged {
                    decision: Some(Decision {
                        kind: DecisionKind::ChooseCopy,
                        ..
                    })
                }
            )));
            let restored: GameState =
                serde_json::from_str(&serde_json::to_string(&state).unwrap()).unwrap();
            assert_eq!(restored, state);
            return;
        }
    }
    panic!("no seed started with Vera Custer as the Sheriff");
}

// ---------------------------------------------------------------- interactions

#[test]
fn el_gringo_and_bart_react_to_the_new_attack_cards() {
    for card in [Punch, Knife, Derringer, BuffaloRifle] {
        let mut game = Scenario::dodge(4);
        game.character(1, Character::ElGringo);
        game.give(0, Beer);
        let shot = if card == Punch {
            let punch = game.give_face(0, Punch, Spades, Ten);
            Action::Play {
                card: punch,
                target: Some(PlayerId(1)),
            }
        } else {
            let green = game.ready_green(0, card);
            Action::ActivateGreen {
                card: green,
                target: Some(PlayerId(1)),
                selection: None,
            }
        };
        game.act(0, shot);
        game.respond(None);
        assert_eq!(health(&game, 1), 2, "{card:?}");
        let stolen = kinds(&game.state.players[1].hand);
        assert!(
            stolen.contains(&Beer),
            "{card:?}: El Gringo takes from the attacker"
        );
    }
    let mut game = Scenario::dodge(4);
    game.character(2, Character::BartCassidy);
    let howitzer = game.ready_green(0, Howitzer);
    game.act(
        0,
        Action::ActivateGreen {
            card: howitzer,
            target: None,
            selection: None,
        },
    );
    for _ in 0..3 {
        game.respond(None);
    }
    assert_eq!(game.state.players[2].hand.len(), 1);
}

#[test]
fn calamity_janet_uses_dodge_as_a_bang_and_every_missed_as_a_bang() {
    let mut game = Scenario::dodge(4);
    game.character(0, Character::CalamityJanet);
    let dodge = game.give_face(0, Dodge, Hearts, King);
    let spare = game.give(0, Bang);
    play(&mut game, 0, dodge, Some(1));
    assert_eq!(
        game.state.turn.bangs_played, 1,
        "Dodge played as BANG! counts"
    );
    game.respond(None);
    game.reject(
        0,
        Action::Play {
            card: spare,
            target: Some(PlayerId(1)),
        },
        ActionError::BangLimit,
    );
    // Answering a Duel: a Dodge is a BANG! for her and draws nothing.
    let mut game = Scenario::dodge(4);
    game.character(1, Character::CalamityJanet);
    let dodge = game.give_face(1, Dodge, Hearts, King);
    let duel = game.give(0, Duel);
    play(&mut game, 0, duel, Some(1));
    let events = game.respond(Some(dodge));
    assert_eq!(drawn(&events, 1), 0);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(0));
    // And a BANG! still answers a BANG! as a Missed!.
    let mut game = Scenario::dodge(4);
    game.character(1, Character::CalamityJanet);
    let bang = game.give(1, Bang);
    game.shoot(0, 1);
    game.respond(Some(bang));
    assert_eq!(health(&game, 1), 4);
}

#[test]
fn slab_against_a_green_missed_still_asks_for_a_second_answer() {
    let mut game = Scenario::dodge(4);
    game.character(0, Character::SlabTheKiller);
    let plate = game.ready_green(1, IronPlate);
    let missed = game.give(1, Missed);
    game.shoot(0, 1);
    game.respond(Some(plate));
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::AttackResponse { remaining: 1, .. }
    ));
    game.respond(Some(missed));
    assert_eq!(health(&game, 1), 4);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(0));
}

#[test]
fn brawl_empties_a_suzy_lafayette_who_then_draws_a_card() {
    let mut game = Scenario::dodge(4);
    game.character(2, Character::SuzyLafayette);
    let brawl = game.give_face(0, Brawl, Spades, Jack);
    let extra = game.give(0, Beer);
    game.give(2, Bang);
    let events = game.act(
        0,
        Action::Brawl {
            card: brawl,
            discard: extra,
            picks: vec![BrawlPick {
                target: PlayerId(2),
                selection: CardSelection::Hand,
            }],
        },
    );
    // The blind pick is private to the picker and to the one who loses the card.
    let events2 = game.act(
        0,
        Action::ChooseHandSlot {
            pending_id: id(&game),
            slot: 0,
        },
    );
    let all: Vec<_> = events.into_iter().chain(events2).collect();
    assert!(
        filter_events(&all, None)
            .iter()
            .all(|e| !matches!(e.kind, EventKind::HandCardAffected { .. }))
    );
    assert!(
        filter_events(&all, Some(PlayerId(2)))
            .iter()
            .any(|e| matches!(e.kind, EventKind::HandCardAffected { kind: Brawl, .. }))
    );
    assert_eq!(game.state.players[2].hand.len(), 1);
}

#[test]
fn vulture_sam_takes_a_dead_players_green_cards_into_hand() {
    let mut game = Scenario::dodge(5);
    game.character(3, Character::VultureSam);
    let bible = game.ready_green(2, Bible);
    game.state.players[2].fresh_green.push(bible);
    kill_by_bang(&mut game, 1, 2);
    assert!(game.state.players[3].hand.contains(&bible));
    assert!(game.state.players[3].in_play.is_empty());
    for player in &game.state.players {
        assert!(player.fresh_green.is_empty());
    }
    invariant(&game.state);
}

#[test]
fn every_new_action_and_frame_survives_a_json_round_trip() {
    let actions = vec![
        Action::PlayWithDiscard {
            card: CardId(1),
            discard: CardId(2),
            target: Some(PlayerId(3)),
        },
        Action::AffectWithDiscard {
            card: CardId(1),
            discard: CardId(2),
            target: PlayerId(3),
            selection: CardSelection::InPlay(CardId(9)),
        },
        Action::Brawl {
            card: CardId(1),
            discard: CardId(2),
            picks: vec![BrawlPick {
                target: PlayerId(1),
                selection: CardSelection::Hand,
            }],
        },
        Action::ActivateGreen {
            card: CardId(1),
            target: None,
            selection: Some(CardSelection::Hand),
        },
        Action::ChuckDraw,
        Action::JoseDelgado { card: CardId(5) },
        Action::DocHolyday {
            cards: [CardId(1), CardId(2)],
            target: PlayerId(2),
        },
        Action::ChooseCopy {
            pending_id: PendingId(4),
            target: PlayerId(1),
        },
        Action::ChooseDrawSource {
            pending_id: PendingId(4),
            source: DrawSource::InPlay {
                player: PlayerId(1),
                card: CardId(7),
            },
        },
    ];
    for action in actions {
        let json = serde_json::to_string(&action).unwrap();
        assert_eq!(
            serde_json::from_str::<Action>(&json).unwrap(),
            action,
            "{json}"
        );
    }
    assert_eq!(
        serde_json::to_value(Action::ChuckDraw).unwrap(),
        serde_json::json!({"type": "chuck_draw"})
    );
    // A Brawl or Vera frame in the middle of resolution serializes with the state.
    let mut game = Scenario::dodge(4);
    game.state.pending.push(Pending {
        id: PendingId(900),
        kind: PendingKind::ChooseCopy {
            player: PlayerId(0),
        },
    });
    game.state.pending.push(Pending {
        id: PendingId(901),
        kind: PendingKind::ResolveBrawl {
            source: PlayerId(0),
            picks: vec![BrawlPick {
                target: PlayerId(1),
                selection: CardSelection::Hand,
            }],
            cursor: 0,
        },
    });
    let restored: GameState =
        serde_json::from_str(&serde_json::to_string(&game.state).unwrap()).unwrap();
    assert_eq!(restored, game.state);
}

// ---------------------------------------------------------------- fuzz

#[test]
fn seeded_bots_play_full_dodge_city_games_covering_every_new_card_and_character() {
    let mut effects: BTreeMap<CardKind, usize> = BTreeMap::new();
    let mut placed: BTreeMap<CardKind, usize> = BTreeMap::new();
    let mut skills: BTreeMap<Character, usize> = BTreeMap::new();
    let mut appearances: BTreeSet<Character> = BTreeSet::new();
    let (mut games, mut actions_total) = (0, 0);
    let mut frames: BTreeSet<&'static str> = BTreeSet::new();
    let mut winners = [0usize; 3];
    for count in 4..=8usize {
        for seed in 0..48u64 {
            let mut rng = ChaCha8Rng::seed_from_u64(seed * 10 + count as u64);
            let mut replay_rng = rng.clone();
            let (mut state, events) = setup(count, dodge_config(count), &mut rng).unwrap();
            let (mut replay, replay_events) =
                setup(count, dodge_config(count), &mut replay_rng).unwrap();
            assert_eq!((&state, &events), (&replay, &replay_events));
            invariant(&state);
            for player in &state.players {
                appearances.insert(player.character);
            }
            let mut bot = ChaCha8Rng::seed_from_u64(seed + 5000);
            let mut steps = 0;
            while state.winner.is_none() && steps < 6000 {
                let actions = dodge_legal_actions(&state, &rng);
                let (player, action) = actions[bot.random_range(0..actions.len())].clone();
                // Coverage follows the action that produces each card's own effect, so a card
                // thrown away as something else (Elena's Missed!) or Janet's BANG! doesn't count.
                let kind_of = |card: &CardId| card.card().unwrap().kind;
                let own = &state.players[player.0];
                match &action {
                    Action::Play { card, .. } if own.play_kind(kind_of(card)) == kind_of(card) => {
                        let kind = kind_of(card);
                        let seen = if kind.is_equipment() {
                            &mut placed
                        } else {
                            &mut effects
                        };
                        *seen.entry(kind).or_default() += 1;
                    }
                    Action::PlayWithDiscard { card, .. }
                    | Action::AffectWithDiscard { card, .. }
                    | Action::Brawl { card, .. } => {
                        *effects.entry(kind_of(card)).or_default() += 1;
                    }
                    Action::ActivateGreen { card, .. } => {
                        *effects.entry(kind_of(card)).or_default() += 1;
                    }
                    Action::Respond {
                        card: Some(card), ..
                    } => {
                        let kind = kind_of(card);
                        if own.in_play.contains(card) || kind == Dodge {
                            *effects.entry(kind).or_default() += 1;
                        }
                    }
                    _ => {}
                }
                let events = apply(&mut state, player, action.clone(), &mut rng).unwrap();
                let replay_events = apply(&mut replay, player, action, &mut replay_rng).unwrap();
                assert_eq!((&state, &events), (&replay, &replay_events));
                invariant(&state);
                for event in &events {
                    match &event.kind {
                        EventKind::SkillActivated { character, .. } => {
                            *skills.entry(*character).or_default() += 1;
                        }
                        EventKind::CopyChosen { .. } => {
                            frames.insert("copy");
                        }
                        _ => {}
                    }
                }
                for frame in &state.pending {
                    if matches!(frame.kind, PendingKind::ResolveBrawl { .. }) {
                        frames.insert("brawl");
                    }
                }
                steps += 1;
            }
            let winner = state
                .winner
                .unwrap_or_else(|| panic!("Bot game hit step limit: count={count}, seed={seed}"));
            winners[match winner {
                Winner::SheriffAndDeputies => 0,
                Winner::Outlaws => 1,
                Winner::Renegade { .. } => 2,
            }] += 1;
            // Serialization survives the end of a long game too.
            let restored: GameState =
                serde_json::from_str(&serde_json::to_string(&state).unwrap()).unwrap();
            assert_eq!(restored, state);
            games += 1;
            actions_total += steps;
        }
    }
    for kind in CardKind::DODGE_CITY {
        let seen = |map: &BTreeMap<CardKind, usize>| map.get(&kind).copied().unwrap_or(0) > 0;
        if kind.is_equipment() {
            assert!(seen(&placed), "never placed: {kind:?}");
        }
        if !kind.is_equipment() || kind.is_green() {
            assert!(seen(&effects), "effect never produced: {kind:?}");
        }
    }
    for character in Character::DODGE_CITY {
        assert!(
            appearances.contains(&character),
            "never dealt: {character:?}"
        );
        assert!(
            skills.get(&character).copied().unwrap_or(0) > 0
                // Passive abilities that never produce an activation event.
                || matches!(
                    character,
                    Character::ApacheKid
                        | Character::BelleStar
                        | Character::SeanMallory
                        | Character::VeraCuster
                ),
            "skill never activated: {character:?}"
        );
    }
    assert!(frames.contains("brawl"));
    assert!(frames.contains("copy"));
    assert!(winners.iter().all(|w| *w > 0), "{winners:?}");
    println!("Dodge City fuzz: {games} games, {actions_total} actions, winners {winners:?}");
}

// ---------------------------------------------------------------- review round 2

#[test]
fn vera_copying_vulture_sam_shares_a_dead_players_cards_with_sam_alternately() {
    // FAQ Q03: the nearer one clockwise (Sam, seat 3) picks first, then Vera (seat 4), and so on.
    let mut game = Scenario::dodge(6);
    game.character(3, Character::VultureSam);
    game.character(4, Character::VeraCuster);
    game.state.players[4].copied = Some(Character::VultureSam);
    let mustang = game.equip(2, Mustang);
    let (a, b) = (game.give(2, Missed), game.give(2, Beer));
    game.equip(1, Scope);
    kill_by_bang(&mut game, 1, 2);
    let decision = game.state.decision().unwrap();
    assert_eq!(decision.player, PlayerId(3));
    assert_eq!(
        decision.kind,
        DecisionKind::VultureSplit {
            victim: PlayerId(2),
            hand_count: 2,
            table_count: 1
        }
    );
    assert_eq!(spectator_view(&game.state).loot_table, Some(vec![mustang]));
    let take = |game: &Scenario, selection| Action::VultureTake {
        pending_id: id(game),
        selection,
    };
    // Only the one whose turn it is may take; invalid selections change nothing.
    let action = take(&game, CardSelection::Hand);
    game.reject(4, action, ActionError::NotYourDecision);
    game.reject(
        3,
        take(&game, CardSelection::InPlay(a)),
        ActionError::InvalidCard,
    );
    game.reject(
        3,
        Action::VultureTake {
            pending_id: PendingId(999),
            selection: CardSelection::Hand,
        },
        ActionError::StalePending,
    );
    let hand_before = game.state.players[3].hand.len();
    let events = game.act(3, take(&game, CardSelection::InPlay(mustang)));
    assert!(game.state.players[3].hand.contains(&mustang));
    assert_eq!(game.state.players[3].hand.len(), hand_before + 1);
    assert!(filter_events(&events, None).iter().any(|e| matches!(
        e.kind,
        EventKind::TableCardTaken {
            player: PlayerId(3),
            target: PlayerId(2),
            ..
        }
    )));
    // Now Vera, from the hand: the card is hidden from everyone but her.
    assert_eq!(game.state.decision().unwrap().player, PlayerId(4));
    let events = game.act(4, take(&game, CardSelection::Hand));
    assert_eq!(game.state.players[4].hand.len(), 1);
    let taken = game.state.players[4].hand[0];
    assert!([a, b].contains(&taken));
    assert!(
        filter_events(&events, None)
            .iter()
            .all(|e| !matches!(e.kind, EventKind::CardsReceived { .. }))
    );
    assert!(
        filter_events(&events, Some(PlayerId(3)))
            .iter()
            .all(|e| !matches!(e.kind, EventKind::CardsReceived { .. }))
    );
    assert!(filter_events(&events, Some(PlayerId(4))).iter().any(
        |e| matches!(&e.kind, EventKind::CardsReceived { cards, .. } if cards == &vec![taken])
    ));
    // Sam takes the last card and the split ends; the victim's zones stay empty.
    assert_eq!(game.state.decision().unwrap().player, PlayerId(3));
    game.act(3, take(&game, CardSelection::Hand));
    assert!(game.state.pending.is_empty());
    assert_eq!(game.state.decision().unwrap().kind, DecisionKind::Turn);
    assert_eq!(spectator_view(&game.state).loot_table, None);
    invariant(&game.state);
}

#[test]
fn vulture_split_starts_with_whichever_holder_is_nearer_the_victim_and_times_out_safely() {
    // Victim in seat 5: clockwise the nearer one is Vera (seat 0), not Sam (seat 3).
    let mut game = Scenario::dodge(6);
    game.character(3, Character::VultureSam);
    game.character(0, Character::VeraCuster);
    game.state.players[0].copied = Some(Character::VultureSam);
    let card = game.give(5, Beer);
    game.state.players[5].role = Role::Deputy;
    kill_by_bang(&mut game, 4, 5);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(0));
    // The timeout default takes a hand card (here the only card).
    game.end();
    assert!(game.state.players[0].hand.contains(&card));
    assert!(game.state.pending.is_empty());
    invariant(&game.state);
}

#[test]
fn vulture_split_finishes_before_the_game_ends_and_hands_the_cards_over_privately() {
    // FAQ Q03: the loot is shared in full even when the victim's death decides the game.
    let mut game = Scenario::dodge(5);
    game.character(1, Character::VultureSam);
    game.character(2, Character::VeraCuster);
    game.state.players[2].copied = Some(Character::VultureSam);
    game.state.players[0].health = 1;
    let (beer, missed) = (game.give(0, Beer), game.give(0, Missed));
    let mustang = game.equip(0, Mustang);
    game.equip(3, Scope);
    game.equip(3, Winchester);
    kill_by_bang(&mut game, 3, 0);
    // The Sheriff is dead, yet the game is still waiting for the first claim.
    assert!(!game.state.players[0].alive);
    assert_eq!(game.state.winner, None);
    assert_eq!(game.state.decision().unwrap().player, PlayerId(1));
    let take = |game: &Scenario, selection| Action::VultureTake {
        pending_id: id(game),
        selection,
    };
    let action = take(&game, CardSelection::InPlay(mustang));
    game.act(1, action);
    let action = take(&game, CardSelection::Hand);
    game.act(2, action);
    assert_eq!(game.state.winner, None);
    let action = take(&game, CardSelection::Hand);
    let events = game.act(1, action);
    assert_eq!(game.state.winner, Some(Winner::Outlaws));
    assert!(game.state.pending.is_empty());
    // The cards went into the hands, not the discard pile.
    assert!(
        game.state
            .discard_pile
            .iter()
            .all(|c| ![beer, missed, mustang].contains(c))
    );
    assert_eq!(
        game.state.players[1].hand.len() + game.state.players[2].hand.len(),
        3
    );
    // The last card is private to Sam and arrives before the game-over event.
    let received = events
        .iter()
        .position(|e| matches!(e.kind, EventKind::CardsReceived { .. }))
        .unwrap();
    let ended = events
        .iter()
        .position(|e| matches!(e.kind, EventKind::GameEnded { .. }))
        .unwrap();
    assert!(received < ended);
    assert_eq!(events[received].visibility, Visibility::Player(PlayerId(1)));
    assert!(
        filter_events(&events, None)
            .iter()
            .all(|e| !matches!(e.kind, EventKind::CardsReceived { .. }))
    );
    invariant(&game.state);
}

#[test]
fn greg_and_herb_act_only_after_vera_and_sam_have_finished_sharing() {
    let mut game = Scenario::dodge(6);
    game.character(1, Character::VultureSam);
    game.character(2, Character::VeraCuster);
    game.state.players[2].copied = Some(Character::VultureSam);
    game.character(4, Character::GregDigger);
    game.character(5, Character::HerbHunter);
    game.state.players[4].health = 1;
    game.give(3, Beer);
    game.give(3, Missed);
    game.equip(0, Winchester);
    kill_by_bang(&mut game, 0, 3);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::VultureSplit { .. }
    ));
    assert_eq!(
        game.state.players[5].hand.len(),
        0,
        "Herb waits for the split"
    );
    assert_eq!(health(&game, 4), 1, "Greg waits for the split");
    let action = Action::VultureTake {
        pending_id: id(&game),
        selection: CardSelection::Hand,
    };
    game.act(1, action);
    assert_eq!(game.state.players[5].hand.len(), 0);
    let action = Action::VultureTake {
        pending_id: id(&game),
        selection: CardSelection::Hand,
    };
    let events = game.act(2, action);
    assert_eq!(game.state.players[5].hand.len(), 2);
    assert_eq!(health(&game, 4), 3);
    let received = events
        .iter()
        .position(|e| {
            matches!(
                e.kind,
                EventKind::CardsReceived {
                    player: PlayerId(2),
                    ..
                }
            )
        })
        .unwrap();
    let herb = events
        .iter()
        .position(|e| {
            matches!(
                e.kind,
                EventKind::SkillActivated {
                    character: Character::HerbHunter,
                    ..
                }
            )
        })
        .unwrap();
    assert!(received < herb);
}

#[test]
fn vulture_take_timeout_takes_a_table_card_when_the_hand_is_empty() {
    let mut game = Scenario::dodge(6);
    game.character(3, Character::VultureSam);
    game.character(4, Character::VeraCuster);
    game.state.players[4].copied = Some(Character::VultureSam);
    let mustang = game.equip(2, Mustang);
    game.equip(1, Scope);
    game.equip(1, Winchester);
    kill_by_bang(&mut game, 1, 2);
    let (player, action) = default_action(&game.state).unwrap();
    assert_eq!(player, PlayerId(3));
    assert!(matches!(
        action,
        Action::VultureTake {
            selection: CardSelection::InPlay(card),
            ..
        } if card == mustang
    ));
    game.end();
    assert!(game.state.players[3].hand.contains(&mustang));
    assert!(game.state.pending.is_empty());
}

#[test]
fn a_lone_vulture_sam_in_the_base_game_takes_cards_in_order_without_touching_the_rng() {
    // Regression: no shuffle and no RNG use when there is a single Vulture (hand, then table).
    let mut game = Scenario::new(5);
    game.character(3, Character::VultureSam);
    let hand: Vec<_> = [Bang, Missed, Beer, Panic]
        .into_iter()
        .map(|k| game.give(2, k))
        .collect();
    let mustang = game.equip(2, Mustang);
    game.equip(1, Scope);
    let before = game.rng.clone();
    kill_by_bang(&mut game, 1, 2);
    assert_eq!(game.rng.get_word_pos(), before.get_word_pos());
    let mut want = hand.clone();
    want.push(mustang);
    assert_eq!(game.state.players[3].hand, want);
    assert!(game.state.pending.is_empty());
    assert_eq!(game.state.config.deck().len(), 80);
}

#[test]
fn vera_loses_her_old_copy_when_jail_costs_her_the_turn() {
    let mut game = Scenario::dodge(4);
    game.character(1, Character::VeraCuster);
    game.state.players[1].copied = Some(Character::ElenaFuente);
    game.equip(1, Jail);
    game.top_face(Missed, Spades, Two);
    begin_turn(&mut game, 1);
    // The Jail check failed: the turn was lost before Vera could pick, and the old copy is gone.
    assert_eq!(game.state.turn.player, PlayerId(2));
    assert_eq!(game.state.players[1].copied, None);
    let spare = game.give(1, Saloon);
    assert!(!game.state.players[1].accepts_response(kinds(&[spare])[0], Missed));
    assert_eq!(game.state.players[1].character, Character::VeraCuster);
}

#[test]
fn vera_keeps_the_copy_when_she_escapes_jail_and_picks_again() {
    let mut game = Scenario::dodge(4);
    game.character(1, Character::VeraCuster);
    game.state.players[1].copied = Some(Character::ElenaFuente);
    game.equip(1, Jail);
    game.top_face(Bang, Hearts, Queen);
    begin_turn(&mut game, 1);
    assert_eq!(
        game.state.decision().unwrap().kind,
        DecisionKind::ChooseCopy
    );
    assert_eq!(game.state.players[1].copied, Some(Character::ElenaFuente));
}

#[test]
fn suzy_waits_for_the_whole_brawl_before_drawing_after_paying_with_her_last_cards() {
    let mut game = Scenario::dodge(4);
    game.character(0, Character::SuzyLafayette);
    let brawl = game.give_face(0, Brawl, Spades, Jack);
    let cost = game.give(0, Beer);
    let target_card = game.give(1, Bang);
    let events = game.act(
        0,
        Action::Brawl {
            card: brawl,
            discard: cost,
            picks: vec![BrawlPick {
                target: PlayerId(1),
                selection: CardSelection::Hand,
            }],
        },
    );
    // Her hand is empty, but she draws only once the blind pick of the Brawl has resolved.
    assert!(game.state.players[0].hand.is_empty());
    assert_eq!(drawn(&events, 0), 0);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::PickHandSlot {
            kind: Brawl,
            target: PlayerId(1),
            ..
        }
    ));
    let events = game.act(
        0,
        Action::ChooseHandSlot {
            pending_id: id(&game),
            slot: 0,
        },
    );
    assert!(game.state.discard_pile.contains(&target_card));
    assert_eq!(drawn(&events, 0), 1);
    assert_eq!(game.state.players[0].hand.len(), 1);
    // With only table targets nothing is blind, so she draws as soon as the Brawl is over.
    let mut game = Scenario::dodge(4);
    game.character(0, Character::SuzyLafayette);
    let brawl = game.give_face(0, Brawl, Spades, Jack);
    let cost = game.give(0, Beer);
    let mustang = game.equip(1, Mustang);
    let events = game.act(
        0,
        Action::Brawl {
            card: brawl,
            discard: cost,
            picks: vec![BrawlPick {
                target: PlayerId(1),
                selection: CardSelection::InPlay(mustang),
            }],
        },
    );
    assert_eq!(drawn(&events, 0), 1);
}

#[test]
fn two_dynamites_with_two_players_left_keep_the_surviving_dynamite_in_place() {
    // FAQ Q06: the other player already holds a Dynamite, so a safe flip leaves it where it is.
    let mut game = Scenario::dodge(4);
    game.dead(2);
    game.dead(3);
    let mine = game.equip(0, Dynamite);
    let theirs = game.equip(1, Dynamite);
    game.top_face(Bang, Hearts, Queen);
    game.state.turn.player = PlayerId(1);
    game.end();
    assert_eq!(game.state.turn.player, PlayerId(0));
    assert_eq!(game.state.players[0].in_play, vec![mine]);
    assert_eq!(game.state.players[1].in_play, vec![theirs]);
    invariant(&game.state);
}

#[test]
fn tequila_joe_needs_two_beers_after_a_dynamite_takes_him_to_minus_two() {
    // FAQ Q09: 1 life, Dynamite (3 damage) -> -2; each Beer gives 2, so two Beers leave him at 2.
    let mut game = Scenario::dodge(4);
    game.character(1, Character::TequilaJoe);
    game.state.players[1].health = 1;
    game.equip(1, Dynamite);
    let beers = [game.give(1, Beer), game.give(1, Beer)];
    game.top_face(Missed, Spades, Five);
    game.state.turn.player = PlayerId(0);
    game.end();
    assert_eq!(health(&game, 1), -2);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::Dying { needed: 3 }
    ));
    game.respond(Some(beers[0]));
    assert_eq!(health(&game, 1), 0);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::Dying { needed: 1 }
    ));
    game.respond(Some(beers[1]));
    assert_eq!(health(&game, 1), 2);
    assert!(game.state.players[1].alive);
}

#[test]
fn molly_stark_who_loses_her_own_duel_is_still_paid_for_her_bangs_after_the_damage() {
    let mut game = Scenario::dodge(4);
    game.character(0, Character::MollyStark);
    game.state.players[0].health = 1;
    let mine = game.give(0, Bang);
    let theirs: Vec<_> = (0..2).map(|_| game.give(1, Bang)).collect();
    let duel = game.give(0, Duel);
    play(&mut game, 0, duel, Some(1));
    game.respond(Some(theirs[0]));
    game.respond(Some(mine));
    game.respond(Some(theirs[1]));
    assert!(game.state.players[0].hand.is_empty());
    // She is out of BANG!s: she takes the last hit, then collects her card.
    let events = game.respond(None);
    assert_eq!(health(&game, 0), 0);
    assert_eq!(drawn(&events, 0), 1);
    assert_eq!(game.state.players[0].hand.len(), 1);
    assert!(matches!(
        game.state.decision().unwrap().kind,
        DecisionKind::Dying { .. }
    ));
    assert_eq!(health(&game, 1), 4);
}

#[test]
fn belle_star_hides_other_players_green_answers_from_the_snapshot_during_her_turn() {
    let mut game = Scenario::dodge(4);
    game.character(1, Character::BelleStar);
    let hat = game.ready_green(0, TenGallonHat);
    game.state.turn.player = PlayerId(1);
    assert_eq!(
        game.state.players[0].green_answers().collect::<Vec<_>>(),
        vec![hat]
    );
    assert_eq!(spectator_view(&game.state).players[0].green_answers, None);
    // On anyone else's turn the same card is listed again.
    game.state.turn.player = PlayerId(2);
    assert_eq!(
        spectator_view(&game.state).players[0].green_answers,
        Some(vec![hat])
    );
}
