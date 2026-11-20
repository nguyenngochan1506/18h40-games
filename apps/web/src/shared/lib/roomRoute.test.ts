import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inviteLink, isValidRoomCode, normalizeRoomCode, roomPath, roomRoute } from './roomRoute.ts';

test('room codes normalize whitespace and case and use the server alphabet', () => {
  assert.equal(normalizeRoomCode(' a b\tc\nd e '), 'ABCDE');
  for (const code of ['ABCDE', '23456', 'Z9HJK']) assert.equal(isValidRoomCode(code), true);
  for (const code of ['', 'abcdE', 'ABCD', 'ABCDEF', 'AB0DE', 'AB1DE', 'ABIDE', 'ABODE', 'ABLDE', 'ABC!E', 'AB/DE']) assert.equal(isValidRoomCode(code), false, code);
});

test('room paths and invite links contain only the normalized code', () => {
  assert.equal(roomPath('ab cde'), '/r/ABCDE');
  assert.equal(inviteLink('https://example.com', 'ab cde'), 'https://example.com/r/ABCDE');
  assert.equal(inviteLink('http://localhost:5173', '23456'), 'http://localhost:5173/r/23456');
  assert.equal(roomPath('ab/de'), '/r/AB%2FDE');
});

test('room URLs canonicalize or fall back without accepting malformed paths', () => {
  for (const path of ['/r/abcde', '/r/ABCDE/', '/r/a%20bcde?from=friend#join']) assert.deepEqual(roomRoute(path), { code: 'ABCDE', path: '/r/ABCDE', invalid: false });
  for (const path of ['/', '/foo', '//r/ABCDE']) assert.deepEqual(roomRoute(path), { code: null, path: '/', invalid: false });
  for (const path of ['/r', '/r/', '/r/abc!', '/r/ABC0E', '/r/ABCDE//', '/r//ABCDE', '/r/ABCDE/other', '/r/%E0%A4%A']) assert.deepEqual(roomRoute(path), { code: null, path: '/', invalid: true });
});
