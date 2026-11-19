import { PROTOCOL_VERSION } from '../../generated/protocol.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ServerMessage } from '../../generated/protocol.ts';
import { createRequestTracker, REQUEST_TIMEOUT_MS } from './request.ts';

const pong = (nonce: number): ServerMessage => ({ v: PROTOCOL_VERSION, type: 'pong', nonce });

test('only the matching connection and pong nonce finish a request, never shared updates or errors', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const connection = {}, other = {};
  const tracker = createRequestTracker(() => assert.fail('Completed request timed out'));
  const first = tracker.start(connection)!;
  assert.equal(tracker.start(connection), null);
  for (const message of [
    { v: PROTOCOL_VERSION, type: 'game_update', seq: 123 },
    { v: PROTOCOL_VERSION, type: 'game_over', seq: 124 },
    { v: PROTOCOL_VERSION, type: 'room_state' },
    { v: PROTOCOL_VERSION, type: 'joined' },
    { v: PROTOCOL_VERSION, type: 'left' },
    { v: PROTOCOL_VERSION, type: 'error', code: 'illegal_action' },
  ] as ServerMessage[]) {
    assert.equal(tracker.finish(connection, message), false);
    assert.equal(tracker.pending, true);
  }
  assert.equal(tracker.finish(other, pong(first)), false);
  assert.equal(tracker.finish(connection, pong(first + 1)), false);
  assert.equal(tracker.finish(connection, pong(first)), true);
  const second = tracker.start(connection)!;
  assert.notEqual(second, first);
  assert.equal(tracker.finish(connection, pong(first)), false);
  assert.equal(tracker.finish(connection, { v: PROTOCOL_VERSION, type: 'error', code: 'illegal_action', message: 'Old error' }), false);
  assert.equal(tracker.pending, true);
  assert.equal(tracker.finish(connection, pong(second)), true);
  t.mock.timers.tick(REQUEST_TIMEOUT_MS * 2);
});

test('an OPEN but silent connection expires once at the finite response deadline', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const connection = { readyState: 1 };
  const expired: object[] = [];
  const tracker = createRequestTracker((connection: object) => expired.push(connection));
  tracker.start(connection);
  t.mock.timers.tick(REQUEST_TIMEOUT_MS - 1);
  assert.equal(tracker.pending, true);
  assert.deepEqual(expired, []);
  t.mock.timers.tick(1);
  assert.equal(tracker.pending, false);
  assert.deepEqual(expired, [connection]);
  t.mock.timers.tick(120_000);
  assert.deepEqual(expired, [connection]);
});

test('closing or cleaning up a connection cancels its watchdog without cancelling another connection', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const old = {}, connection = {};
  const tracker = createRequestTracker(() => assert.fail('Cancelled request timed out'));
  tracker.start(old);
  assert.equal(tracker.cancel(old), true);
  tracker.start(connection);
  assert.equal(tracker.cancel(old), false);
  assert.equal(tracker.pending, true);
  assert.equal(tracker.cancel(connection), true);
  t.mock.timers.tick(120_000);
  assert.equal(tracker.pending, false);
});

test('even an already queued old timer cannot expire a newer request on the same or a new connection', (t) => {
  const timers: (() => void)[] = [];
  t.mock.method(globalThis, 'setTimeout', (callback: () => void) => { timers.push(callback); return 1; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  const connection = {}, nextConnection = {};
  const expired: object[] = [];
  const tracker = createRequestTracker((connection: object) => expired.push(connection));
  const first = tracker.start(connection)!;
  tracker.finish(connection, pong(first));
  tracker.start(connection);
  timers[0]();
  assert.equal(tracker.pending, true);
  assert.deepEqual(expired, []);
  tracker.cancel(connection);
  tracker.start(nextConnection);
  timers[1]();
  assert.equal(tracker.pending, true);
  assert.deepEqual(expired, []);
  timers[2]();
  assert.deepEqual(expired, [nextConnection]);
});
