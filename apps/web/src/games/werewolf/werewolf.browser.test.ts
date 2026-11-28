// Kiểm thử bấm ghế trên trình duyệt thật (Chrome/Edge headless qua DevTools Protocol).
// happy-dom không tính layout nên không phát hiện được HUD/danh sách thành viên che nút ghế.
// Đặt CHROME_PATH để chỉ định trình duyệt; không tìm thấy trình duyệt thì bỏ qua.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import type { Plugin } from 'vite';

type Scenario = {
  players: number;
  width: number;
  height: number;
  spectators?: number;
  speakers?: string[];
};

type SeatTarget = { id: number; x: number; y: number; selectable: boolean; inView: boolean };

const HARNESS_ID = 'virtual:werewolf-seat-harness';
const HARNESS_URL = '/__werewolf-seat-harness';

const HARNESS_CODE = `
import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '/src/style.css';
import { client } from '/src/games/werewolf/client.ts';
import { standardRoleDeck } from '/src/games/werewolf/roles.ts';
import { PROTOCOL_VERSION } from '/src/generated/protocol.ts';
import { consumeFrames, initialGameState, receiveGameState } from '/src/shared/gameSync.ts';

const NAMES = ['Nguyễn An', 'Trần Bình', 'Lê Chi', 'Phạm Dũng', 'Hoàng Em', 'Vũ Giang', 'Đặng Hà', 'Bùi Khánh',
  'Đỗ Linh', 'Hồ Minh', 'Ngô Nam', 'Dương Oanh', 'Lý Phúc', 'Mai Quân', 'Trịnh Sơn', 'Cao Tâm'];
const root = createRoot(document.getElementById('root'));
let generation = 0;

function build(s) {
  const seats = Array.from({ length: s.players }, (_, player_id) => ({ player_id, member_id: 'm' + player_id, nickname: NAMES[player_id] }));
  const members = seats.map(seat => ({ id: seat.member_id, nickname: seat.nickname, role: 'player', online: true }));
  for (let i = 0; i < (s.spectators ?? 0); i++) members.push({ id: 's' + i, nickname: 'Khán giả ' + (i + 1), role: 'spectator', online: true });
  const deck = standardRoleDeck(s.players);
  const room = {
    code: 'WOLF1', game: 'werewolf', settings: { game: 'werewolf', payload: { roles: deck, reveal_role_on_death: true } },
    phase: 'playing', host: 'm0', you: 'm0', min_players: 5, max_players: 16, members,
  };
  const view = {
    you: 0, your_role: 'seer', your_team: 'village', is_wolf_pack: false, known_wolves: [], lover: null, cupid_lovers: null,
    seer_history: [{ night: 1, target: 1, is_wolf: false }], sorcerer_history: [], wolf_votes: [], witch_victim: null,
    witch_heal_available: false, witch_poison_available: false, alpha_infect_available: false, bodyguard_last_protected: null,
    active_night_step: null, can_act: true,
    table: {
      players: seats.map(seat => ({ id: seat.player_id, alive: true, role: null, death_cause: null, day_vote: null, is_revealed_prince: false, is_revealed_mayor: false })),
      phase: { kind: 'day_vote', day: 1 }, day_number: 1, role_counts: deck, reveal_role_on_death: true,
      winner: null, winning_players: [], awaited_count: s.players,
    },
  };
  const sync = receiveGameState(initialGameState, {
    v: PROTOCOL_VERSION, type: 'game_started', seq: 0, seats,
    view: { game: 'werewolf', payload: { perspective: 'player', view } },
  });
  const speakers = s.speakers ?? [];
  const snapshot = { mic: 'on', micOn: speakers, speakers };
  const voice = { subscribe: () => () => {}, snapshot: () => snapshot };
  return { room, sync, voice };
}

function Harness({ scenario }) {
  const [{ room, voice, sync: first }] = useState(() => build(scenario));
  const [sync, setSync] = useState(first);
  return createElement('main', { className: 'min-h-svh game-app game-werewolf' },
    createElement('p', { className: 'connection-status', role: 'status' }, 'Đã kết nối'),
    createElement('div', { className: 'app-scenes' },
      createElement(client.Board, {
        room, sync, voice, disabled: false, pending: false, requestVersion: 0, actionError: null, actionErrorCode: null, fxEnabled: false,
        roomMenu: createElement('button', { type: 'button' }, 'Rời phòng'),
        roomTools: createElement('div', { className: 'room-voice' }, createElement('button', { type: 'button', className: 'voice-icon' }, '🎙')),
        consume: id => setSync(current => consumeFrames(current, id)),
        sendAction() {}, endGame() {}, leaveRoom() {}, hostSkip() {},
      })));
}

const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

window.__renderWerewolf = async scenario => {
  root.render(createElement(Harness, { key: ++generation, scenario }));
  await frame();
  await new Promise(resolve => setTimeout(resolve, 30));
  await Promise.all([...document.images].map(img => img.complete ? null : new Promise(resolve => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  })));
  await document.fonts?.ready;
  await frame();
};
`;

const COLLECT_SEATS = `[...document.querySelectorAll('.ww-seats-arena .ww-seat-card')].map(card => {
  const r = card.getBoundingClientRect();
  return {
    id: Number(card.dataset.seatId),
    x: r.left + r.width / 2,
    y: r.top + r.height / 2,
    selectable: card.classList.contains('is-selectable') && !card.disabled,
    inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
  };
})`;

function describeAt(x: number, y: number) {
  return `(() => {
    const el = document.elementFromPoint(${x}, ${y});
    if (!el) return 'không có phần tử';
    const owner = el.closest('.ww-seat-card, .ww-my-panel, .ww-log-panel, .ww-members, .ww-table-center, .ww-topbar') ?? el;
    return owner.tagName.toLowerCase() + '.' + [...owner.classList].join('.') + (owner.dataset.seatId ? '#' + owner.dataset.seatId : '');
  })()`;
}

function findBrowser(): string | null {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]) {
      if (!base) continue;
      candidates.push(join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      candidates.push(join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    candidates.push('/Applications/Chromium.app/Contents/MacOS/Chromium');
    candidates.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  } else {
    const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
      for (const dir of dirs) candidates.push(join(dir, name));
    }
  }
  return candidates.find(path => existsSync(path)) ?? null;
}

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };

class Cdp {
  ws: WebSocket;
  nextId = 0;
  pending = new Map<number, Pending>();

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      const waiter = message.id ? this.pending.get(message.id) : undefined;
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
      else waiter.resolve(message.result);
    });
  }

  static async connect(url: string) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('Không kết nối được DevTools')), { once: true });
    });
    return new Cdp(ws);
  }

  send(method: string, params: object = {}, sessionId?: string): Promise<any> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

function harnessPlugin(): Plugin {
  return {
    name: 'werewolf-seat-harness',
    resolveId(id) {
      return id === HARNESS_ID ? `\0${HARNESS_ID}` : undefined;
    },
    load(id) {
      return id === `\0${HARNESS_ID}` ? HARNESS_CODE : undefined;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== HARNESS_URL) return next();
        const html = await server.transformIndexHtml(
          HARNESS_URL,
          `<!doctype html><html lang="vi"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>` +
            `<body><div id="root"></div><script type="module" src="/@id/__x00__${HARNESS_ID}"></script></body></html>`,
        );
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      });
    },
  };
}

const browserPath = findBrowser();

test('Mọi ghế có thể chọn đều bấm được ở tâm nút, không bị HUD hay danh sách thành viên che', { skip: browserPath ? false : 'Không tìm thấy Chrome/Edge (đặt CHROME_PATH)', timeout: 240_000 }, async t => {
  const webRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const server = await createServer({
    root: webRoot,
    configFile: join(webRoot, 'vite.config.ts'),
    logLevel: 'silent',
    clearScreen: false,
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client'] },
    plugins: [harnessPlugin()],
  });
  await server.listen();
  t.after(() => server.close());
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');

  const profile = mkdtempSync(join(tmpdir(), 'ww-seat-'));
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--mute-audio', '--remote-debugging-port=0', `--user-data-dir=${profile}`];
  if (process.platform === 'linux') args.push('--no-sandbox');
  const browser = spawn(browserPath!, [...args, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  t.after(async () => {
    if (browser.exitCode === null) {
      const exited = new Promise(resolve => browser.once('exit', resolve));
      browser.kill();
      await exited;
    }
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  const endpoint = await new Promise<string>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Trình duyệt không mở DevTools:\n${output}`)), 30_000);
    browser.stderr!.on('data', chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    browser.once('exit', code => reject(new Error(`Trình duyệt thoát sớm (${code}):\n${output}`)));
  });

  const cdp = await Cdp.connect(endpoint);
  t.after(() => cdp.ws.close());
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method: string, params: object = {}) => cdp.send(method, params, sessionId);
  const evaluate = async <T>(expression: string): Promise<T> => {
    const result = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value as T;
  };
  const setViewport = (width: number, height: number) =>
    page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const click = async (x: number, y: number) => {
    await page('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await page('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await page('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  const selectedSeat = () => evaluate<number | null>(
    `(() => { const card = document.querySelector('.ww-seat-card.is-selected'); return card ? Number(card.dataset.seatId) : null; })()`,
  );
  const render = (scenario: Scenario) => evaluate(`window.__renderWerewolf(${JSON.stringify(scenario)})`);

  await setViewport(1280, 720);
  await page('Page.navigate', { url: `http://127.0.0.1:${address.port}${HARNESS_URL}` });
  const deadline = Date.now() + 120_000;
  while (!(await evaluate<boolean>(`typeof window.__renderWerewolf === 'function'`).catch(() => false))) {
    assert.ok(Date.now() < deadline, 'Trang thử nghiệm Ma Sói không tải được');
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  const viewports: [number, number][] = [[1024, 576], [1280, 720], [1366, 768], [1440, 900], [1920, 1080]];
  const scenarios: Scenario[] = [];
  for (const [width, height] of viewports) {
    for (const players of [5, 7, 10, 14, 16]) scenarios.push({ players, width, height, spectators: players === 16 ? 4 : 0 });
  }

  const failures: string[] = [];
  for (const scenario of scenarios) {
    const label = `${scenario.players} người @ ${scenario.width}×${scenario.height}`;
    await setViewport(scenario.width, scenario.height);
    await render(scenario);
    const seats = await evaluate<SeatTarget[]>(COLLECT_SEATS);
    assert.equal(seats.length, scenario.players, label);
    for (const seat of seats) {
      if (!seat.selectable) {
        failures.push(`${label}: ghế #${seat.id} không ở trạng thái chọn được`);
        continue;
      }
      if (!seat.inView) failures.push(`${label}: ghế #${seat.id} tràn ra ngoài khung nhìn`);
      await click(seat.x, seat.y);
      const picked = await selectedSeat();
      if (picked !== seat.id) {
        const blocker = await evaluate<string>(describeAt(seat.x, seat.y));
        failures.push(`${label}: bấm tâm ghế #${seat.id} (${Math.round(seat.x)}, ${Math.round(seat.y)}) trúng ${blocker}`);
        await render(scenario);
        continue;
      }
      await click(seat.x, seat.y);
      if ((await selectedSeat()) !== null) {
        failures.push(`${label}: bấm lại ghế #${seat.id} không bỏ chọn được`);
        await render(scenario);
      }
    }
  }
  assert.deepEqual(failures, []);

  // Viền "đang nói" phải còn thấy khi ghế đang ở trạng thái chọn được (bỏ phiếu ban ngày).
  await setViewport(1280, 720);
  await render({ players: 8, width: 1280, height: 720, speakers: ['m2'] });
  const ring = await evaluate<{ speaking: boolean; ringContent: string; ringColor: string; ringWidth: string; border: string; peerBorder: string }>(`(() => {
    const card = document.querySelector('.ww-seat-card[data-seat-id="2"]');
    const peer = document.querySelector('.ww-seat-card[data-seat-id="3"]');
    const after = getComputedStyle(card, '::after');
    return {
      speaking: card.classList.contains('is-speaking') && card.classList.contains('is-selectable'),
      ringContent: after.content,
      ringColor: after.borderTopColor,
      ringWidth: after.borderTopWidth,
      border: getComputedStyle(card).borderTopColor,
      peerBorder: getComputedStyle(peer).borderTopColor,
    };
  })()`);
  assert.equal(ring.speaking, true);
  assert.notEqual(ring.ringContent, 'none');
  assert.equal(ring.ringColor, 'rgb(127, 209, 122)');
  assert.notEqual(ring.ringWidth, '0px');
  assert.equal(ring.border, ring.peerBorder, 'viền ghế chọn được phải giữ nguyên khi đang nói');
});
