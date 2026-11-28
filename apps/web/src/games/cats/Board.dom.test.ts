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
  cursed = false,
): GameView {
  const view: CatsPlayerView = {
    you: 0,
    hand: cursed ? [] : hand,
    cursed,
    preview_cards: previewCards,
    table: {
      settings: defaultSettings,
      players: [
        {
          id: 0,
          hand_count: hand.length,
          marked_cards: [],
          cursed,
          barking_in_front: false,
          ill_take_that_by: null,
          has_tower: false,
          eliminated: false,
        },
        {
          id: 1,
          hand_count: 8,
          marked_cards: [],
          cursed: false,
          barking_in_front: false,
          ill_take_that_by: null,
          has_tower: false,
          eliminated: winner !== null,
        },
      ],
      turn: { player: 0, turns_left: 1, direction: 1 },
      deck_count: 20,
      tower_stash_count: 6,
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
    maxPlayers: 8,
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

test('cursed blind hand emits play_blind and Alter Future NOW works outside own turn', async t => {
  const { container, root } = await mount(t);
  const sent: GameAction[] = [];

  // Cursed player sees face-down slots and clicks slot 0 -> play_blind
  await act(async () => root.render(createElement(Board, propsFor(
    playerView(
      [{ id: 1, kind: 'skip' }, { id: 2, kind: 'cat_taco' }],
      { player: 0, pending_id: null, kind: { type: 'turn' } },
      [],
      null,
      true,
    ),
    sent,
  ))));
  const blindCards = container.querySelectorAll<HTMLButtonElement>('.cats-blind-card');
  assert.equal(blindCards.length, 2);
  await act(() => blindCards[0].click());
  assert.deepEqual(sent.pop(), { game: 'cats', payload: { type: 'play_blind', slot: 0 } });

  // Alter Future NOW works during opponent's turn
  await act(async () => root.render(createElement(Board, propsFor(
    playerView(
      [{ id: 99, kind: 'alter_future_now' }],
      { player: 1, pending_id: null, kind: { type: 'turn' } },
    ),
    sent,
  ))));
  const nowBtn = container.querySelector<HTMLButtonElement>('.cats-alter-now');
  assert.ok(nowBtn);
  await act(() => nowBtn.click());
  assert.deepEqual(sent.pop(), { game: 'cats', payload: { type: 'play_card', card: 99 } });
});

test('dismissed future preview stays closed on non-mutating frames and clears on deck mutation', async t => {
  const { container, root } = await mount(t);
  const sent: GameAction[] = [];
  const baseView = playerView([], { player: 0, pending_id: null, kind: { type: 'turn' } });
  if (baseView.game !== 'cats') throw new Error('Cats view expected');

  const frame1: GameBoardProps['sync']['frames'][number] = {
    id: 1,
    game: { seq: 1, seats, view: baseView },
    update: {
      game: 'cats',
      events: [{ type: 'future_seen', player: 0, cards: [{ id: 12, kind: 'exploding' }] }],
      view: baseView.payload,
    },
    reset: null,
    setup: false,
  };
  await act(async () => root.render(createElement(Board, propsFor(baseView, sent, [], [frame1]))));
  assert.ok(container.querySelector('.cats-future-strip'));

  // Dismiss the future preview, then receive an unrelated frame -> must NOT reopen!
  await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Ẩn xem tương lai"]')!.click());
  assert.equal(container.querySelector('.cats-future-strip'), null);

  const frame2: GameBoardProps['sync']['frames'][number] = {
    id: 2,
    game: { seq: 2, seats, view: baseView },
    update: {
      game: 'cats',
      events: [{ type: 'card_played', player: 0, kind: 'ill_take_that' }],
      view: baseView.payload,
    },
    reset: null,
    setup: false,
  };
  await act(async () => root.render(createElement(Board, propsFor(baseView, sent, [], [frame2]))));
  assert.equal(container.querySelector('.cats-future-strip'), null);

  // Receive a second future_seen -> opens again, then deck-mutating catomic_bomb clears it.
  const frame3: GameBoardProps['sync']['frames'][number] = {
    id: 3,
    game: { seq: 3, seats, view: baseView },
    update: {
      game: 'cats',
      events: [{ type: 'future_seen', player: 0, cards: [{ id: 13, kind: 'skip' }] }],
      view: baseView.payload,
    },
    reset: null,
    setup: false,
  };
  await act(async () => root.render(createElement(Board, propsFor(baseView, sent, [], [frame3]))));
  assert.ok(container.querySelector('.cats-future-strip'));

  const frame4: GameBoardProps['sync']['frames'][number] = {
    id: 4,
    game: { seq: 4, seats, view: baseView },
    update: {
      game: 'cats',
      events: [{ type: 'catomic_bomb_triggered', player: 1, exploding_count: 2 }],
      view: baseView.payload,
    },
    reset: null,
    setup: false,
  };
  await act(async () => root.render(createElement(Board, propsFor(baseView, sent, [], [frame4]))));
  assert.equal(container.querySelector('.cats-future-strip'), null);
});

test('trapped Bury and eliminated player spectator state display accurately', async t => {
  const { container, root } = await mount(t);
  const sent: GameAction[] = [];

  // Trapped player with Bury cannot click to play it and sees "Xem chi tiết".
  const trappedView = playerView([{ id: 50, kind: 'bury' }]);
  if (trappedView.game !== 'cats' || trappedView.payload.perspective !== 'player') throw new Error('player view expected');
  trappedView.payload.view.table.players[0].ill_take_that_by = 1;
  await act(async () => root.render(createElement(Board, propsFor(trappedView, sent))));
  const buryCard = container.querySelector<HTMLButtonElement>('.cats-card')!;
  assert.match(buryCard.textContent ?? '', /Xem chi tiết/);
  await act(() => buryCard.click());
  assert.equal(sent.length, 0);
  assert.ok(container.querySelector('.cats-detail-card'));

  // Eliminated player receives spectator view while sync.viewer keeps their seat id.
  const specView: GameView = {
    game: 'cats',
    payload: {
      perspective: 'spectator',
      view: {
        ...trappedView.payload.view.table,
        players: [
          { ...trappedView.payload.view.table.players[0], eliminated: true, ill_take_that_by: null },
          { ...trappedView.payload.view.table.players[1], eliminated: false },
        ],
        winner: 1,
        decision: null,
      },
    },
  };
  await act(async () => root.render(createElement(Board, propsFor(specView, sent))));
  assert.match(container.textContent ?? '', /Bạn đã nổ tung và bị loại/);
  assert.match(container.querySelector('.cats-standings')?.textContent ?? '', /Meow \(bạn\)/);
});

test('playing Bury clears future preview immediately while choosing bury position', async t => {
  const { container, root } = await mount(t);
  const sent: GameAction[] = [];
  const baseView = playerView([], { player: 0, pending_id: null, kind: { type: 'turn' } });
  if (baseView.game !== 'cats') throw new Error('Cats view expected');

  const seeFutureFrame: GameBoardProps['sync']['frames'][number] = {
    id: 1,
    game: { seq: 1, seats, view: baseView },
    update: {
      game: 'cats',
      events: [{ type: 'future_seen', player: 0, cards: [{ id: 12, kind: 'exploding' }, { id: 13, kind: 'skip' }] }],
      view: baseView.payload,
    },
    reset: null,
    setup: false,
  };
  await act(async () => root.render(createElement(Board, propsFor(baseView, sent, [], [seeFutureFrame]))));
  assert.ok(container.querySelector('.cats-future-strip'));

  // Opponent plays Bury -> pops top card and enters bury_card pending (no card_buried yet).
  const buryPendingView = playerView([], { player: 1, pending_id: 22, kind: { type: 'bury_card', max_position: 19 } });
  if (buryPendingView.game !== 'cats') throw new Error('Cats view expected');
  const buryStartedFrame: GameBoardProps['sync']['frames'][number] = {
    id: 2,
    game: { seq: 2, seats, view: buryPendingView },
    update: {
      game: 'cats',
      events: [
        { type: 'card_played', player: 1, kind: 'bury' },
        { type: 'decision_changed', decision: { player: 1, pending_id: 22, kind: { type: 'bury_card', max_position: 19 } } },
      ],
      view: buryPendingView.payload,
    },
    reset: null,
    setup: false,
  };
  await act(async () => root.render(createElement(Board, propsFor(buryPendingView, sent, [], [buryStartedFrame]))));
  assert.equal(
    container.querySelector('.cats-future-strip'),
    null,
    'future preview must clear as soon as Bury takes the top card',
  );
});

test('future preview still opens after a rejoin reset even when previously dismissed', async t => {
  const { container, root } = await mount(t);
  const sent: GameAction[] = [];
  const baseView = playerView([], { player: 0, pending_id: null, kind: { type: 'turn' } });
  if (baseView.game !== 'cats') throw new Error('Cats view expected');

  const frame1: GameBoardProps['sync']['frames'][number] = {
    id: 1,
    game: { seq: 1, seats, view: baseView },
    update: {
      game: 'cats',
      events: [{ type: 'future_seen', player: 0, cards: [{ id: 12, kind: 'skip' }] }],
      view: baseView.payload,
    },
    reset: null,
    setup: false,
  };
  await act(async () => root.render(createElement(Board, propsFor(baseView, sent, [], [frame1]))));
  await act(() => container.querySelector<HTMLButtonElement>('[aria-label="Ẩn xem tương lai"]')!.click());
  assert.equal(container.querySelector('.cats-future-strip'), null);

  // Rejoin reset frame arrives, then a new future_seen arrives -> must reopen!
  const resetFrame: GameBoardProps['sync']['frames'][number] = {
    id: 2,
    game: { seq: 2, seats, view: baseView },
    update: null,
    reset: 'joined',
    setup: false,
  };
  await act(async () => root.render(createElement(Board, propsFor(baseView, sent, [], [resetFrame]))));

  const frame3: GameBoardProps['sync']['frames'][number] = {
    id: 3,
    game: { seq: 3, seats, view: baseView },
    update: {
      game: 'cats',
      events: [{ type: 'future_seen', player: 0, cards: [{ id: 14, kind: 'exploding' }] }],
      view: baseView.payload,
    },
    reset: null,
    setup: false,
  };
  await act(async () => root.render(createElement(Board, propsFor(baseView, sent, [], [frame3]))));
  assert.ok(
    container.querySelector('.cats-future-strip'),
    'new future_seen after rejoin reset must display even if an earlier preview was dismissed',
  );
});
