import assert from 'node:assert/strict';
import test from 'node:test';
import { tableShortcut, tooltipContent, tooltipPosition } from './tablePolish.ts';
import { cardFiles, characterFiles, landscapeScenes } from './assetMap.ts';
import { gameSceneImages } from './sceneImages.ts';
import { demoGame } from './demo.ts';

const ready = { desktop: true, editing: false, overlay: false, nativeControl: false, modified: false, repeat: false, locked: false, dragging: false };
test('table shortcuts preserve native controls and block typing, overlays, repeat, drag and unavailable actions', () => {
  assert.equal(tableShortcut('Enter', ready), 'confirm');
  assert.equal(tableShortcut('Escape', ready), 'cancel');
  for (let i = 1; i <= 9; i++) assert.equal(tableShortcut(String(i), ready), i - 1);
  for (const key of ['0', 'a', 'Tab', 'ArrowRight', '!']) assert.equal(tableShortcut(key, ready), null);
  for (const state of [{ editing: true }, { overlay: true }, { modified: true }, { repeat: true }, { dragging: true }]) for (const key of ['Enter', 'Escape', '1']) assert.equal(tableShortcut(key, { ...ready, ...state }), null);
  assert.equal(tableShortcut('Enter', { ...ready, nativeControl: true }), null);
  assert.equal(tableShortcut('Enter', { ...ready, locked: true }), null);
  assert.equal(tableShortcut('1', { ...ready, locked: true }), null);
  assert.equal(tableShortcut('Escape', { ...ready, locked: true }), 'cancel');
});

test('Escape works on narrow viewports while Enter and card shortcuts remain desktop-only', () => {
  const narrow = { ...ready, desktop: false };
  assert.equal(tableShortcut('Escape', narrow), 'cancel');
  assert.equal(tableShortcut('Escape', { ...narrow, locked: true }), 'cancel');
  for (const key of ['Enter', '1', '2', '3', '4', '5', '6', '7', '8', '9']) assert.equal(tableShortcut(key, narrow), null);
});

test('Vietnamese tooltips cover all 22 cards, 16 characters, every role and public health without leaking a hidden role', () => {
  assert.equal(Object.keys(cardFiles).length, 22); assert.equal(Object.keys(characterFiles).length, 16);
  for (const [type, files] of [['card', cardFiles], ['character', characterFiles]] as const) for (const key of Object.keys(files)) {
    const content = tooltipContent(`${type}:${key}`);
    assert.ok(content?.title && content.text, key);
    assert.match(content.text, /[áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]/i, key);
  }
  assert.equal(tooltipContent('card:bang')?.title, 'BANG!');
  for (const kind of Object.keys(cardFiles)) assert.ok(tooltipContent(`card:${kind}`)?.image?.startsWith('/bang/'));
  assert.equal(tooltipContent('character:slab_the_killer')?.image, undefined);
  assert.equal(tooltipContent('card:back'), null);
  assert.match(tooltipContent('character:slab_the_killer')!.text, /2 lá Missed!/);
  for (const role of ['sheriff', 'deputy', 'outlaw', 'renegade', 'hidden']) assert.ok(tooltipContent(`role:${role}`));
  assert.equal(tooltipContent('role:hidden')?.title, 'Vai chưa lộ');
  assert.equal(tooltipContent('health:0:4')?.title, 'Máu: 0/4');
  for (const key of ['card:__proto__', 'character:constructor', 'role:unknown', 'health:-1:4', 'health:bad:4', 'missing']) assert.equal(tooltipContent(key), null);
});

test('tooltip stays inside the viewport and never covers the decision tray', () => {
  const viewport = { width: 1280, height: 720 }, tip = { width: 300, height: 130 };
  for (const anchor of [{ left: 0, top: 0, width: 30, height: 40 }, { left: 1260, top: 690, width: 20, height: 30 }]) {
    const p = tooltipPosition(anchor, tip, viewport)!;
    assert.ok(p.left >= 12 && p.top >= 12 && p.left + 300 <= 1268 && p.top + 130 <= 708);
  }
  const obstacle = { left: 490, top: 450, width: 320, height: 240 };
  const p = tooltipPosition({ left: 600, top: 620, width: 60, height: 80 }, tip, viewport, [obstacle])!;
  assert.ok(p.left + 300 <= obstacle.left - 12 || p.left >= obstacle.left + 320 + 12 || p.top + 130 <= obstacle.top - 12 || p.top >= obstacle.top + 240 + 12);
  assert.equal(tooltipPosition({ left: 600, top: 620, width: 60, height: 80 }, tip, viewport, [{ left: 0, top: 0, ...viewport }]), null);
});

test('large card previews prefer below a top-edge card and fit above the own tray', () => {
  const viewport = { width: 1280, height: 720 }, tip = { width: 234, height: 380 };
  const below = tooltipPosition({ left: 500, top: 30, width: 44, height: 70 }, tip, viewport)!;
  assert.equal(below.top, 112);
  const tray = { left: 333, top: 410, width: 614, height: 302 };
  const above = tooltipPosition({ left: 600, top: tray.top, width: 80, height: 0 }, tip, viewport, [tray])!;
  assert.equal(above.top, 18);
  assert.ok(above.top + tip.height < tray.top);
});

test('preload includes only the selected desktop background and visible actors, never every scene or hidden cards', () => {
  if (demoGame.view.perspective !== 'player') throw Error('Player fixture required');
  const template = demoGame.view.view.table.players[0];
  for (const count of [4, 5, 6, 7] as const) {
    const players = Array.from({ length: count }, (_, id) => ({ ...template, id, alive: id !== 2 }));
    const files = gameSceneImages(players, 0, true);
    assert.equal(files[0], landscapeScenes[count]);
    assert.equal(files.length, count);
    assert.equal(files.filter(file => file.includes('scene') && file.includes('landscape')).length, 1);
    assert.ok(files.some(file => file.includes('/ghost')));
    assert.equal(files.filter(file => file.includes('/bang/')).length, 0);
    assert.deepEqual(gameSceneImages(players, 0, false), []);
    assert.ok(gameSceneImages(players, null, true).length <= count + 1);
  }
});
