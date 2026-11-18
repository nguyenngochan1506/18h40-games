import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSession, retryDelay, saveSession } from './session.ts';

test('backoff grows from one second and stays capped', () => {
  assert.deepEqual(Array.from({ length: 8 }, (_, i) => retryDelay(i)), [1000, 2000, 4000, 8000, 10000, 10000, 10000, 10000]);
});

test('session persistence validates input and tolerates unavailable storage', () => {
  let saved: string | null = null;
  const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; }, removeItem: () => { saved = null; } };
  const session = { roomCode: 'ABCDE', token: 'ab'.repeat(16) };
  saveSession(session, storage);
  assert.deepEqual(loadSession(storage), session);
  saveSession(null, storage);
  assert.equal(loadSession(storage), null);
  for (const value of ['{', 'null', '{}', '{"roomCode":"ABCDE","token":5}', '{"roomCode":"ABCDE","token":"bad"}']) {
    saved = value;
    assert.equal(loadSession(storage), null);
  }
  const fail = () => { throw new Error('Storage unavailable'); };
  const unavailable = { getItem: fail, setItem: fail, removeItem: fail };
  assert.equal(loadSession(unavailable), null);
  assert.doesNotThrow(() => saveSession(session, unavailable));
  assert.doesNotThrow(() => saveSession(null, unavailable));
});
