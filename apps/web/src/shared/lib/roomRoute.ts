export function normalizeRoomCode(input: string): string { return input.replace(/\s/g, '').toUpperCase(); }

// Keep this alphabet aligned with CODE_ALPHABET in apps/server/src/rooms.rs.
export function isValidRoomCode(code: string): boolean { return /^[2-9A-HJKMNP-Z]{5}$/.test(code); }

export function roomPath(code: string): string { return `/r/${encodeURIComponent(normalizeRoomCode(code))}`; }
export function inviteLink(origin: string, code: string): string { return new URL(roomPath(code), origin).href; }

export function roomRoute(path: string): { code: string | null; path: string; invalid: boolean } {
  const pathname = path.split(/[?#]/)[0];
  const match = /^\/r\/([^/]+)\/?$/.exec(pathname);
  if (match) {
    try {
      const code = normalizeRoomCode(decodeURIComponent(match[1]));
      if (isValidRoomCode(code)) return { code, path: roomPath(code), invalid: false };
    } catch { /* Malformed URL escapes are invalid room codes. */ }
  }
  return { code: null, path: '/', invalid: /^\/r(?:\/|$)/.test(pathname) };
}
