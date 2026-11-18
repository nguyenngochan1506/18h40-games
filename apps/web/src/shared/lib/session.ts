export type Session = { roomCode: string; token: string };
const SESSION_KEY = '18h40.session';
type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function loadSession(storage?: SessionStorage): Session | null {
  try {
    const value: unknown = JSON.parse((storage ?? window.localStorage).getItem(SESSION_KEY) ?? 'null');
    if (typeof value === 'object' && value !== null && 'roomCode' in value && 'token' in value
      && typeof value.roomCode === 'string' && /^[2-9A-HJKMNP-Z]{5}$/.test(value.roomCode)
      && typeof value.token === 'string' && /^[a-f0-9]{32}$/.test(value.token)) {
      return { roomCode: value.roomCode, token: value.token };
    }
  } catch { /* Storage may be unavailable in private browsing. */ }
  return null;
}

export function saveSession(session: Session | null, storage?: SessionStorage): void {
  try {
    const target = storage ?? window.localStorage;
    if (session) target.setItem(SESSION_KEY, JSON.stringify(session));
    else target.removeItem(SESSION_KEY);
  } catch { /* The active connection still works without persistent storage. */ }
}

export function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** Math.min(attempt, 4), 10_000);
}
