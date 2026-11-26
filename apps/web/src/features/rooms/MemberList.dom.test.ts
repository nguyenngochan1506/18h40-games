import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createServer } from 'vite';
import { PROTOCOL_VERSION } from '../../generated/protocol.ts';
import { createVoice } from './voice.ts';
import type { MediaEvents } from './voice.ts';
import type MemberListComponent from '../../shared/MemberList.tsx';

const dom = new Window({ url: 'http://localhost/' });
const previous = Object.getOwnPropertyDescriptors(globalThis);
const globals = { window: dom, document: dom.document, navigator: dom.navigator, IS_REACT_ACT_ENVIRONMENT: true };
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
const { createRoot } = await import('react-dom/client');
const vite = await createServer({ root: fileURLToPath(new URL('../../../', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
after(async () => {
  await vite.close();
  await dom.happyDOM.close();
  for (const name of Object.keys(globals)) {
    if (previous[name]) Object.defineProperty(globalThis, name, previous[name]);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test('member list preserves seat order and exposes live states and expandable spectators', async t => {
  const MemberList: typeof MemberListComponent = (await vite.ssrLoadModule('/src/shared/MemberList.tsx')).default;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  t.after(async () => { await act(() => root.unmount()); container.remove(); });
  let events!: MediaEvents;
  const voice = createVoice(async () => handlers => {
    events = handlers;
    return { async connect() {}, close() {}, async publish() {}, unpublish() {}, async startAudio() {} };
  });
  const socket = { readyState: 1 as const, send() {} };
  voice.attach(socket, 'voice-session', true);
  t.after(() => voice.detach(socket, false));
  voice.receive(socket, { type: 'voice_token_result', v: PROTOCOL_VERSION, nonce: 1,
    result: { status: 'ok', url: 'wss://example.test', token: 'test.header.signature', expires_at: Math.ceil(Date.now() / 1000) + 60 },
  });
  await new Promise<void>(resolve => setImmediate(resolve));

  const players = [
    { id: '2', nickname: 'Minh', online: true, eliminated: true, avatar: '/character.webp' },
    { id: '1', nickname: 'Hân', online: true },
    { id: '3', nickname: 'Lan', online: false },
  ];
  const spectators = ['Khánh', 'Nam', 'Mai', 'Long'].map((nickname, index) => ({ id: String(4 + index), online: true, nickname }));
  const props = { players, spectators, host: '1', turn: '1', you: '3', defaultAvatar: '/cowboy.webp', voice };
  await act(() => root.render(createElement(MemberList, props)));
  await act(() => { events.micOn(['1', '2', '4']); events.speakers(['1', '2']); });

  const rows = [...container.querySelectorAll('ul[aria-label="Người chơi"] > li')];
  assert.deepEqual(rows.map(row => row.querySelector('.member-name')?.textContent), ['Minh', 'Hân', 'Lan']);
  assert.match(rows[0].textContent!, /Bị loại/);
  assert.match(rows[0].textContent!, /Đang nói/);
  assert.match(rows[0].textContent!, /Bật mic/);
  assert.equal(rows[0].querySelector('img')?.getAttribute('src'), '/character.webp');
  assert.match(rows[1].textContent!, /Chủ phòng/);
  assert.match(rows[1].textContent!, /Đang có lượt/);
  assert.match(rows[1].textContent!, /Đang nói/);
  assert.match(rows[2].textContent!, /Mất kết nối/);
  assert.match(rows[2].textContent!, /Tắt mic/);

  const audience = container.querySelector('ul[aria-label="Khán giả"]')!;
  assert.match(container.textContent!, /Khán giả · 4/i);
  assert.equal(audience.children.length, 3);
  assert.match(audience.children[0].textContent!, /Bật mic/);
  assert.equal(audience.querySelector('img')?.getAttribute('src'), '/cowboy.webp');
  const expand = container.querySelector('button')!;
  assert.equal(expand.textContent, 'và 1 người khác');
  assert.equal(expand.getAttribute('aria-expanded'), 'false');
  await act(() => expand.click());
  assert.equal(audience.children.length, 4);
  assert.equal(expand.getAttribute('aria-expanded'), 'true');
  await act(() => expand.click());
  assert.equal(audience.children.length, 3);

  await act(() => root.render(createElement(MemberList, { ...props, spectators: [] })));
  assert.doesNotMatch(container.textContent!, /Khán giả/i);
  assert.equal(container.querySelector('ul[aria-label="Khán giả"]'), null);
});
