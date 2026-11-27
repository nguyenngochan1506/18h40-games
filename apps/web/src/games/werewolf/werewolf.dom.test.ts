import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createServer } from 'vite';
import { PROTOCOL_VERSION } from '../../generated/protocol.ts';
import type { GameAction, GameSettings, RoomView, WerewolfPlayerView } from '../../generated/protocol.ts';
import { initialGameState, receiveGameState } from '../../shared/gameSync.ts';
import { deckBalance, deckError, deckTotal, ROLE_ORDER, ROLES, standardRoleDeck } from './roles.ts';

const dom = new Window({ url: 'http://localhost/' });
const previous = Object.getOwnPropertyDescriptors(globalThis);
const globals = {
  window: dom,
  document: dom.document,
  navigator: dom.navigator,
  HTMLElement: dom.HTMLElement,
  HTMLDialogElement: dom.HTMLDialogElement,
  KeyboardEvent: dom.KeyboardEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
};
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

const SEATS = ['An', 'Bình', 'Chi', 'Dũng', 'Em'].map((nickname, player_id) => ({
  player_id,
  member_id: `m${player_id}`,
  nickname,
}));

const BASE_ROOM: RoomView = {
  code: 'WOLF1',
  game: 'werewolf',
  settings: { game: 'werewolf', payload: { roles: standardRoleDeck(5), reveal_role_on_death: true } },
  phase: 'playing',
  host: 'm0',
  you: 'm0',
  min_players: 5,
  max_players: 16,
  members: SEATS.map(s => ({ id: s.member_id, nickname: s.nickname, role: 'player', online: true })),
};

function makePlayerView(overrides: Partial<WerewolfPlayerView> = {}): WerewolfPlayerView {
  return {
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
    active_night_step: 'seer',
    can_act: true,
    table: {
      players: SEATS.map(s => ({
        id: s.player_id,
        alive: true,
        role: null,
        death_cause: null,
        day_vote: null,
        is_revealed_prince: false,
        is_revealed_mayor: false,
      })),
      phase: { kind: 'night', night: 1 },
      day_number: 1,
      role_counts: standardRoleDeck(5),
      reveal_role_on_death: true,
      winner: null,
      winning_players: [],
      awaited_count: 0,
    },
    ...overrides,
  };
}

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

test('Settings renders all 16 role cards, preserves unsaved draft across identical room snapshots, and submits valid WerewolfSettings', async t => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); });

  const makeSettings = (): GameSettings => ({
    game: 'werewolf',
    payload: { roles: standardRoleDeck(5), reveal_role_on_death: true },
  });
  const submitted: GameSettings[] = [];
  const render = async (settings: GameSettings) => {
    await act(async () => {
      root.render(createElement(client.Settings, {
        settings,
        players: 5,
        maxPlayers: 16,
        editable: true,
        onChange: (next: GameSettings) => submitted.push(next),
      }));
    });
  };

  await render(makeSettings());
  assert.equal(container.querySelectorAll('.ww-role-option').length, 16);
  assert.equal(container.querySelectorAll('.ww-role-thumb').length, 16);

  // Edit draft (toggle reveal_role_on_death off), then re-render with a fresh identical settings object.
  const toggle = container.querySelector<HTMLInputElement>('.ww-toggle input[type="checkbox"]')!;
  assert.equal(toggle.checked, true);
  await act(() => toggle.click());
  assert.equal(toggle.checked, false);

  await render(makeSettings());
  assert.equal(toggle.checked, false, 'Unsaved draft must survive a new settings object reference with identical content');

  const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  await act(() => submit.click());
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0].game, 'werewolf');
  assert.equal(submitted[0].payload.reveal_role_on_death, false);
});

test('Board consumes setup frame, displays role card image, selects target and emits action', async t => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); });

  const playerView = makePlayerView();
  let sync = receiveGameState(initialGameState, {
    v: PROTOCOL_VERSION,
    type: 'game_started',
    seq: 0,
    seats: SEATS,
    view: { game: 'werewolf', payload: { perspective: 'player', view: playerView } },
  });
  const consumed: number[] = [];
  const actions: GameAction[] = [];
  const leaveRoom = t.mock.fn();

  const renderBoard = async () => {
    await act(async () => {
      root.render(createElement(client.Board, {
        room: BASE_ROOM,
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

test('Board preserves selected day-vote target when another player casts a vote', async t => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); });

  const dayView = makePlayerView({
    your_role: 'villager',
    active_night_step: null,
    can_act: true,
    table: {
      ...makePlayerView().table,
      phase: { kind: 'day_vote', day: 1 },
      awaited_count: 5,
    },
  });

  let sync = receiveGameState(initialGameState, {
    v: PROTOCOL_VERSION,
    type: 'joined',
    room_code: BASE_ROOM.code,
    token: 't',
    voice_enabled: false,
    room: BASE_ROOM,
    game: {
      seq: 3,
      seats: SEATS,
      view: { game: 'werewolf', payload: { perspective: 'player', view: dayView } },
    },
  });
  const actions: GameAction[] = [];

  const renderBoard = async () => {
    await act(async () => {
      root.render(createElement(client.Board, {
        room: BASE_ROOM,
        sync,
        disabled: false,
        pending: false,
        requestVersion: 0,
        actionError: null,
        actionErrorCode: null,
        fxEnabled: false,
        roomMenu: null,
        consume: (id: number) => {
          sync = { ...sync, frames: sync.frames.filter(f => f.id > id) };
        },
        sendAction: (action: GameAction) => actions.push(action),
        endGame() {},
        hostSkip() {},
        leaveRoom() {},
      }));
    });
  };

  await renderBoard();
  await renderBoard();

  // Local player selects seat 2 (Chi) as lynch target.
  const seatButtons = container.querySelectorAll<HTMLButtonElement>('.ww-seat-card');
  await act(() => seatButtons[2].click());
  assert.ok(seatButtons[2].classList.contains('is-selected'));

  // Another player (seat 1) votes for seat 3 -> seq increments from 3 to 4 in same day_vote phase.
  const updatedView: WerewolfPlayerView = {
    ...dayView,
    table: {
      ...dayView.table,
      awaited_count: 4,
      players: dayView.table.players.map(p =>
        p.id === 1 ? { ...p, day_vote: { kind: 'target', target: 3 } } : p,
      ),
    },
  };
  sync = receiveGameState(sync, {
    v: PROTOCOL_VERSION,
    type: 'game_update',
    seq: 4,
    update: {
      game: 'werewolf',
      events: [{ type: 'day_voted', voter: 1, target: 3, weight: 1 }],
      view: { perspective: 'player', view: updatedView },
    },
  });

  await renderBoard();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await renderBoard();

  const updatedSeatButtons = container.querySelectorAll<HTMLButtonElement>('.ww-seat-card');
  assert.ok(
    updatedSeatButtons[2].classList.contains('is-selected'),
    'Selected target must not be cleared by another player voting in the same day',
  );
});

test('Board lets eliminated Hunter shoot during hunter_shot and uses modal <dialog> for deck', async t => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); });

  const hunterView = makePlayerView({
    you: 0,
    your_role: 'hunter',
    active_night_step: null,
    can_act: true,
    table: {
      ...makePlayerView().table,
      phase: { kind: 'hunter_shot', hunter: 0 },
      awaited_count: 1,
      players: makePlayerView().table.players.map(p =>
        p.id === 0 ? { ...p, alive: false, death_cause: 'werewolf_attack', role: 'hunter' } : p,
      ),
    },
  });

  let sync = receiveGameState(initialGameState, {
    v: PROTOCOL_VERSION,
    type: 'joined',
    room_code: BASE_ROOM.code,
    token: 't',
    voice_enabled: false,
    room: BASE_ROOM,
    game: {
      seq: 2,
      seats: SEATS,
      view: { game: 'werewolf', payload: { perspective: 'player', view: hunterView } },
    },
  });
  const actions: GameAction[] = [];

  const renderBoard = async () => {
    await act(async () => {
      root.render(createElement(client.Board, {
        room: BASE_ROOM,
        sync,
        disabled: false,
        pending: false,
        requestVersion: 0,
        actionError: null,
        actionErrorCode: null,
        fxEnabled: false,
        roomMenu: null,
        consume: (id: number) => {
          sync = { ...sync, frames: sync.frames.filter(f => f.id > id) };
        },
        sendAction: (action: GameAction) => actions.push(action),
        endGame() {},
        hostSkip() {},
        leaveRoom() {},
      }));
    });
  };

  await renderBoard();
  await renderBoard();

  // Deck dialog opens via <dialog>.showModal(), traps Tab, and closes on Escape.
  const deckBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.startsWith('Bộ bài'))!;
  await act(() => deckBtn.click());
  const dialog = container.querySelector<HTMLDialogElement>('dialog.ww-modal');
  assert.ok(dialog, 'Deck modal must render a native <dialog>');
  assert.equal(dialog.open, true);
  const closeBtn = dialog.querySelector<HTMLButtonElement>('button')!;
  assert.equal(document.activeElement, closeBtn);
  await act(() => {
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  });
  assert.equal(document.activeElement, closeBtn, 'Tab must stay trapped inside modal dialog');
  await act(() => {
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
  assert.equal(container.querySelector('dialog.ww-modal'), null, 'Escape must close deck dialog');

  // Eliminated Hunter can select a living player and fire hunter_shoot.
  const seatButtons = container.querySelectorAll<HTMLButtonElement>('.ww-seat-card');
  assert.equal(seatButtons[0].disabled, true);
  assert.equal(seatButtons[1].disabled, false);
  await act(() => seatButtons[1].click());
  const shootBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('Bắn mục tiêu'))!;
  assert.equal(shootBtn.disabled, false);
  await act(() => shootBtn.click());
  assert.deepEqual(actions, [{ game: 'werewolf', payload: { type: 'hunter_shoot', target: 1 } }]);
});

test('Board hides secret wolf and lover badges when Úp bài is toggled on', async t => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); });

  const wolfView = makePlayerView({
    you: 0,
    your_role: 'alpha_wolf',
    your_team: 'werewolves',
    is_wolf_pack: true,
    known_wolves: [0, 1],
    lover: 2,
    alpha_infect_available: true,
    active_night_step: 'werewolves',
    wolf_votes: [{ wolf: 1, target: 3, infect: false }],
    can_act: true,
  });

  let sync = receiveGameState(initialGameState, {
    v: PROTOCOL_VERSION,
    type: 'game_started',
    seq: 0,
    seats: SEATS,
    view: { game: 'werewolf', payload: { perspective: 'player', view: wolfView } },
  });

  const renderBoard = async () => {
    await act(async () => {
      root.render(createElement(client.Board, {
        room: BASE_ROOM,
        sync,
        disabled: false,
        pending: false,
        requestVersion: 0,
        actionError: null,
        actionErrorCode: null,
        fxEnabled: false,
        roomMenu: null,
        consume: (id: number) => {
          sync = { ...sync, frames: sync.frames.filter(f => f.id > id) };
        },
        sendAction() {},
        endGame() {},
        hostSkip() {},
        leaveRoom() {},
      }));
    });
  };

  await renderBoard();
  await renderBoard();
  assert.ok(container.textContent!.includes('Bầy Sói'));
  assert.ok(container.textContent!.includes('Tình Nhân'));
  assert.ok(container.textContent!.includes('Sói chọn (1)'));

  const hideBtn = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === 'Úp bài')!;
  await act(() => hideBtn.click());
  assert.equal(container.querySelectorAll('.ww-mini-wolf').length, 0, 'Wolf badges must hide when Úp bài is active');
  assert.equal(container.querySelectorAll('.ww-mini-lover').length, 0, 'Lover badge must hide when Úp bài is active');
  assert.equal(container.querySelector('.ww-secrets'), null, 'Secrets panel must hide when Úp bài is active');
});
