import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createServer } from 'vite';
import type { GameAction, GameSettings, RoomView, WerewolfPlayerView } from '../../generated/protocol.ts';
import { initialGameState, receiveGameState } from '../../shared/gameSync.ts';
import { deckBalance, deckError, deckTotal, ROLE_ORDER, ROLES, standardRoleDeck } from './roles.ts';

const dom = new Window({ url: 'http://localhost/' });
const previous = Object.getOwnPropertyDescriptors(globalThis);
const globals = { window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
const { createRoot } = await import('react-dom/client');
const vite = await createServer({ root: fileURLToPath(new URL('../../../', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
const { client } = await vite.ssrLoadModule('/src/games/werewolf/client.ts');

after(async () => {
  await vite.close();
  await dom.happyDOM.close();
  for (const name of Object.keys(globals)) {
    if (previous[name]) Object.defineProperty(globalThis, name, previous[name]);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test('standardRoleDeck is valid for every player count from 5 to 16', () => {
  for (let n = 5; n <= 16; n++) {
    const deck = standardRoleDeck(n);
    assert.equal(deckTotal(deck), n);
    assert.equal(deckError(deck, n), null);
    assert.ok(Number.isFinite(deckBalance(deck)));
  }
  assert.equal(ROLE_ORDER.length, 16);
  for (const id of ROLE_ORDER) {
    assert.match(ROLES[id].image, /^\/werewolf\/cards\/[a-z_]+\.webp$/);
  }
});

test('Settings renders all 16 role cards and submits valid WerewolfSettings', async t => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); });

  const settings: GameSettings = { game: 'werewolf', payload: { roles: standardRoleDeck(5), reveal_role_on_death: true } };
  const submitted: GameSettings[] = [];
  await act(async () => {
    root.render(createElement(client.Settings, { settings, players: 5, editable: true, onChange: (next: GameSettings) => submitted.push(next) }));
  });
  assert.equal(container.querySelectorAll('.ww-role-option').length, 16);
  assert.equal(container.querySelectorAll('.ww-role-thumb').length, 16);
  const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  await act(() => submit.click());
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].game, 'werewolf');
});

test('Board consumes setup frame, displays role card image, selects target and emits action', async t => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); });

  const seats = ['An', 'Bình', 'Chi', 'Dũng', 'Em'].map((nickname, player_id) => ({
    player_id,
    member_id: `m${player_id}`,
    nickname,
  }));
  const playerView: WerewolfPlayerView = {
    you: 0,
    your_role: 'seer',
    your_team: 'village',
    is_wolf_pack: false,
    known_wolves: [],
    lover: null,
    cupid_lovers: null,
    seer_history: [],
    sorcerer_history: [],
    wolf_votes: [],
    witch_victim: null,
    witch_heal_available: false,
    witch_poison_available: false,
    alpha_infect_available: false,
    bodyguard_last_protected: null,
    can_act: true,
    table: {
      players: seats.map(s => ({
        id: s.player_id,
        alive: true,
        role: null,
        death_cause: null,
        day_vote: null,
        is_revealed_prince: false,
        is_revealed_mayor: false,
      })),
      phase: { kind: 'night', night: 1, step: 'seer' },
      day_number: 1,
      role_counts: standardRoleDeck(5),
      reveal_role_on_death: true,
      winner: null,
      winning_players: [],
      awaited_count: 1,
    },
  };

  let sync = receiveGameState(initialGameState, {
    v: 8,
    type: 'game_started',
    seq: 0,
    seats,
    view: { game: 'werewolf', payload: { perspective: 'player', view: playerView } },
  });
  const consumed: number[] = [];
  const actions: GameAction[] = [];
  const leaveRoom = t.mock.fn();
  const room: RoomView = {
    code: 'WOLF1',
    game: 'werewolf',
    settings: { game: 'werewolf', payload: { roles: standardRoleDeck(5), reveal_role_on_death: true } },
    phase: 'playing',
    host: 'm0',
    you: 'm0',
    min_players: 5,
    max_players: 16,
    members: seats.map(s => ({ id: s.member_id, nickname: s.nickname, role: 'player', online: true })),
  };

  const renderBoard = async () => {
    await act(async () => {
      root.render(createElement(client.Board, {
        room,
        sync,
        disabled: false,
        pending: false,
        requestVersion: 0,
        actionError: null,
        actionErrorCode: null,
        fxEnabled: false,
        roomMenu: null,
        consume: (id: number) => {
          consumed.push(id);
          sync = { ...sync, frames: sync.frames.filter(f => f.id > id) };
        },
        sendAction: (action: GameAction) => actions.push(action),
        endGame() {},
        hostSkip() {},
        leaveRoom,
      }));
    });
  };

  await renderBoard();
  await renderBoard();
  assert.ok(consumed.length >= 1, 'Board must consume frames');
  const myCardImg = container.querySelector<HTMLImageElement>('.ww-my-panel .ww-card-img');
  assert.ok(myCardImg);
  assert.equal(myCardImg.getAttribute('src'), '/werewolf/cards/seer.webp');

  // Select seat 1 (Bình) and submit seer_inspect.
  const seatButtons = container.querySelectorAll<HTMLButtonElement>('.ww-seat-card');
  assert.equal(seatButtons.length, 5);
  assert.equal(seatButtons[0].disabled, true);
  assert.equal(seatButtons[1].disabled, false);
  await act(() => seatButtons[1].click());
  const inspectBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('Soi danh tính'))!;
  await act(() => inspectBtn.click());
  assert.deepEqual(actions, [{ game: 'werewolf', payload: { type: 'seer_inspect', target: 1 } }]);

  const leaveBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === 'Rời phòng')!;
  await act(() => leaveBtn.click());
  assert.equal(leaveRoom.mock.callCount(), 1);
});
