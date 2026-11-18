import type { ServerMessage } from '../../generated/protocol.ts';

// A missing barrier leaves the action outcome unknown; reconnect instead of retrying it.
export const REQUEST_TIMEOUT_MS = 15_000;

export function createRequestTracker<Connection>(onTimeout: (connection: Connection) => void) {
  let nextNonce = 0;
  let current: { connection: Connection; nonce: number; timer: ReturnType<typeof setTimeout> } | null = null;
  function cancel(connection: Connection): boolean {
    if (!current || current.connection !== connection) return false;
    clearTimeout(current.timer);
    current = null;
    return true;
  }
  return {
    get pending() { return current !== null; },
    start(connection: Connection): number | null {
      if (current) return null;
      const nonce = nextNonce = (nextNonce + 1) >>> 0;
      const request = { connection, nonce, timer: setTimeout(() => {
        if (current !== request) return;
        current = null;
        onTimeout(connection);
      }, REQUEST_TIMEOUT_MS) };
      current = request;
      return nonce;
    },
    finish(connection: Connection, message: ServerMessage): boolean {
      if (message.type !== 'pong' || !current || current.connection !== connection || current.nonce !== message.nonce) return false;
      return cancel(connection);
    },
    cancel,
  };
}
