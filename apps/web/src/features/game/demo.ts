import type { GameSnapshot, RoomView } from '../../generated/protocol.ts';

export const demoGame: GameSnapshot = {
  seq: 17,
  seats: [
    { player_id: 0, member_id: '1', nickname: 'Hân' },
    { player_id: 1, member_id: '2', nickname: 'Minh' },
    { player_id: 2, member_id: '3', nickname: 'Linh' },
    { player_id: 3, member_id: '4', nickname: 'Nam' },
    { player_id: 4, member_id: '5', nickname: 'An' },
  ],
  view: {
    perspective: 'player',
    view: {
      you: 0, hand: [1, 26, 37, 43, 51], choices: [],
      table: {
        players: [
          { id: 0, character: 'rose_doolan', health: 3, max_health: 5, alive: true, hand_count: 5, in_play: [78], weapon_range: 4, role: 'sheriff' },
          { id: 1, character: 'slab_the_killer', health: 2, max_health: 4, alive: true, hand_count: 3, in_play: [74, 63], weapon_range: 2, role: null },
          { id: 2, character: 'lucky_duke', health: 4, max_health: 4, alive: true, hand_count: 4, in_play: [67], weapon_range: 1, role: null },
          { id: 3, character: 'bart_cassidy', health: 0, max_health: 4, alive: false, hand_count: 0, in_play: [], weapon_range: 1, role: 'outlaw' },
          { id: 4, character: 'calamity_janet', health: 2, max_health: 4, alive: true, hand_count: 2, in_play: [65], weapon_range: 1, role: null },
        ],
        turn: { player: 1, step: 'play', bangs_played: 1 },
        waiting: { player: 0, pending_id: 12, kind: { type: 'attack_response', kind: 'bang', remaining: 2, checks_left: 0 } },
        draw_count: 40, discard_count: 21, discard_top: 58, store_slots: 0, winner: null,
      },
    },
  },
};

export const demoRoom: RoomView = {
  code: 'DEMO', game: 'bang', settings: { mode: 'classic', roles: { deputy: 1, outlaw: 2, renegade: 1 } }, phase: 'playing', host: '1', you: '1', min_players: 4, max_players: 7,
  members: demoGame.seats.map((seat) => ({ id: seat.member_id, nickname: seat.nickname, role: 'player', online: seat.member_id !== '5' })),
};
