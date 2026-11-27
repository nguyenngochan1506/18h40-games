import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createServer } from 'vite';
import type {
  CatsCardKind,
  CatsCardView,
  CatsDecision,
  CatsPlayerView,
  GameAction,
  GameSnapshot,
  GameView,
  RoomView,
} from '../../generated/protocol.ts';
import type { GameBoardProps } from '../types.ts';
import { initialGameState } from '../../shared/gameSync.ts';
import type BoardComponent from './Board.tsx';
import type SettingsComponent from './Settings.tsx';

const dom = new Window({ url: 'http://localhost/' });
const globals = {
  window: dom,
  document: dom.document,
  navigator: dom.navigator,
  HTMLElement: dom.HTMLElement,
  Element: dom.Element,
  Node: dom.Node,
  Event: dom.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
};
const previous = Object.getOwnPropertyDescriptors(globalThis);
for (const [name, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
const { createRoot } = await import('react-dom/client');
const vite = await createServer({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
let Board: typeof BoardComponent;
let Settings: typeof SettingsComponent;
try {
  const clientMod = await vite.ssrLoadModule('/src/games/cats/index.ts');
  Board = clientMod.client.Board;
  Settings = clientMod.client.Settings;
  await vite.waitForRequestsIdle();
} catch (error) {
  await vite.close();
  throw error;
}

after(async () => {
  await vite.close();
  await dom.happyDOM.close();
  for (const name of Object.keys(globals)) {
    if (previous[name]) Object.defineProperty(globalThis, name, previous[name]);
    else Reflect.deleteProperty(globalThis, name);
  }
});

const defaultSettings = { imploding: true, streaking: true, barking: true };
const room: RoomView = {
  game: 'cats',
  settings: { game: 'cats', payload: defaultSettings },
  code: 'ABCDE',
  phase: 'playing',
  host: 'player-0',
  you: 'player-0',
  min_players: 2,
  max_players: 8,
  members: [
    { id: 'player-0', nickname: 'Meow', role: 'player', online: true },
    { id: 'player-1', nickname: 'Paws', role: 'player', online: true },
  ],
};
const seats = [
  { player_id: 0, member_id: 'player-0', nickname: 'Meow' },
  { player_id: 1, member_id: 'player-1', nickname: 'Paws' },
];

function playerView(
  hand: Array<{ id: number; kind: CatsCardKind }> = [],
  current: CatsDecision = { player: 0, pending_id: null, kind: { type: 'turn' } },
  previewCards: CatsCardView[] = [],
  winner: number | null = null,
): GameView {
  const view: CatsPlayerView = {
    you: 0,
    hand,
    preview_cards: previewCards,
    table: {
      settings: defaultSettings,
      players: [
        { id: 0, hand_count: hand.length, eliminated: false },
        { id: 1, hand_count: 8, eliminated: winner !== null },
      ],
      turn: { player: 0, turns_left: 1, direction: 1 },
      deck_count: 20,
      top_known: null,
      imploding_face_up: false,
      discard: [],
      decision: winner !== null ? null : current,
      last_action: null,
      winner,
    },
  };
  return { game: 'cats', payload: { perspective: 'player', view } };
}

function propsFor(
  gameView: GameView,
  sent: GameAction[],
  consumed: number[] = [],
  frames: GameBoardProps['sync']['frames'] = [],
  extra: Partial<GameBoardProps> = {},
): GameBoardProps {
  const game: GameSnapshot = { seq: 0, seats, view: gameView };
  return {
    room,
    sync: { ...initialGameState, game: { ...game, seq: frames[0]?.game.seq ?? 0 }, viewer: 0, you: 'player-0', frames },
    disabled: false,
    pending: false,
    requestVersion: 0,
    actionError: null,
    actionErrorCode: null,
    fxEnabled: false,
    roomMenu: null,
    consume: through => consumed.push(through),
    sendAction: action => sent.push(action),
    endGame() {},
    leaveRoom() {},
    hostSkip() {},
    ...extra,
  };
}

async function mount(t: TestContext) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => {
    await act(() => root.unmount());
    container.remove();
  });
  return { container, root };
}

test('turn controls send an action and a Feral Cat matching pair with physical card ids', async t => {
  const { container, root } = await mount(t);
  const sent: GameAction[] = [];
  const props = propsFor(playerView([
    { id: 1, kind: 'attack' },
    { id: 2, kind: 'cat_taco' },
    { id: 3, kind: 'feral_cat' },
  ]), sent);
  await act(async () => root.render(createElement(Board, props)));
  const cards = container.querySelectorAll<HTMLButtonElement>('.cats-card');
  await act(() => cards[0].click());
  assert.deepEqual(sent, [{ game: 'cats', payload: { type: 'play_card', card: 1 } }]);
  await act(() => cards[1].click());
  await act(() => cards[2].click());
  await act(() => [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.includes('Chơi cặp mèo'))!.click());
  assert.deepEqual(sent[1], {
    game: 'cats',
    payload: { type: 'play_pair', cards: [2, 3] },
  });
});

test('pending target, defuse, alter_future, and winner endGame emit typed actions', async t => {
  const { container, root } = await mount(t);
  const sent: GameAction[] = [];
  await act(async () => root.render(createElement(Board, propsFor(
    playerView([], { player: 0, pending_id: 7, kind: { type: 'random_target' } }),
    sent,
  ))));
  await act(() => [...container.querySelectorAll<HTMLButtonElement>('.cats-pending-panel button')]
    .find(button => button.textContent?.includes('Paws'))!.click());
  assert.deepEqual(sent.pop(), {
    game: 'cats',
    payload: { type: 'random_target', pending_id: 7, target: 1 },
  });

  await act(async () => root.render(createElement(Board, propsFor(
    playerView([], { player: 0, pending_id: 8, kind: { type: 'defuse', max_position: 4 } }),
    sent,
  ))));
  await act(() => [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent === 'Đặt Mèo Nổ')!.click());
  assert.deepEqual(sent.pop(), {
    game: 'cats',
    payload: { type: 'defuse', pending_id: 8, position: 0 },
  });

  await act(async () => root.render(createElement(Board, propsFor(
    playerView(
      [],
      { player: 0, pending_id: 15, kind: { type: 'alter_future', count: 2, share_with_next: false } },
      [{ id: 30, kind: 'skip' }, { id: 31, kind: 'exploding' }],
    ),
    sent,
  ))));
  await act(() => [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent === 'Xác nhận thứ tự')!.click());
  assert.deepEqual(sent.pop(), {
    game: 'cats',
    payload: { type: 'reorder_future', pending_id: 15, order: [30, 31] },
  });

  let ended = 0;
  await act(async () => root.render(createElement(Board, propsFor(
    playerView([], { player: 0, pending_id: null, kind: { type: 'turn' } }, [], 0),
    sent,
    [],
    [],
    { endGame: () => { ended += 1; } },
  ))));
  await act(() => [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.includes('Kết thúc ván'))!.click());
  assert.equal(ended, 1);
});

test('Nope works outside own turn, Future stays private, and Settings toggles expansions', async t => {
  const { container, root } = await mount(t);
  const sent: GameAction[] = [];
  const view = playerView([{ id: 11, kind: 'nope' }], {
    player: 1,
    pending_id: null,
    kind: { type: 'turn' },
  });
  if (view.game !== 'cats' || view.payload.perspective !== 'player') throw new Error('player view expected');
  view.payload.view.table.last_action = {
    id: 77,
    actor: 1,
    played: { type: 'card', kind: 'shuffle' },
    nopeable: true,
  };
  await act(async () => root.render(createElement(Board, propsFor(view, sent))));
  await act(() => container.querySelector<HTMLButtonElement>('.cats-nope')!.click());
  assert.deepEqual(sent.pop(), {
    game: 'cats',
    payload: { type: 'nope', pending_id: 77 },
  });

  const future = playerView([], { player: 0, pending_id: null, kind: { type: 'turn' } });
  if (future.game !== 'cats') throw new Error('Cats view expected');
  const snapshot: GameSnapshot = { seq: 1, seats, view: future };
  const frame: GameBoardProps['sync']['frames'][number] = {
    id: 1,
    game: snapshot,
    update: {
      game: 'cats',
      events: [{
        type: 'future_seen',
        player: 0,
        cards: [{ id: 12, kind: 'exploding' }],
      }],
      view: future.payload,
    },
    reset: null,
    setup: false,
  };
  const consumed: number[] = [];
  await act(async () => root.render(createElement(Board, {
    ...propsFor(future, sent, consumed, [frame]),
    sync: { ...propsFor(future, sent, consumed, [frame]).sync, game: snapshot },
  })));
  assert.match(container.textContent ?? '', /Mèo Nổ/);
  assert.deepEqual(consumed, [1]);

  let updated: unknown = null;
  await act(async () => root.render(createElement(Settings, {
    settings: { game: 'cats', payload: defaultSettings },
    players: 4,
    editable: true,
    onChange: next => { updated = next; },
  })));
  const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  assert.equal(checkboxes.length, 3);
  await act(() => checkboxes[0].click());
  assert.deepEqual(updated, {
    game: 'cats',
    payload: { imploding: false, streaking: true, barking: true },
  });
});
