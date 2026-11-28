import type { Expansion, RoleCounts } from '../../generated/protocol.ts';

// Client-side catalog of expansions a host can enable. `maxPlayers` mirrors `Expansion::pack()` in
// crates/bang/src/model/expansion.rs (guarded by settings.test.ts); the room's real capacity always
// comes from the server (`room.max_players`). Adding a pack means adding one row here.
export const BASE_MAX_PLAYERS = 7;
export const expansionPacks: readonly { id: Expansion; name: string; description: string; maxPlayers: number }[] = [
  { id: 'dodge_city', name: 'Dodge City', description: 'Thêm 40 lá và 15 nhân vật; bàn tối đa 8 người.', maxPlayers: 8 },
];

/** Largest table for a set of enabled packs (the base game when empty). */
export function maxPlayersFor(expansions: readonly Expansion[]): number {
  return expansions.reduce((max, id) => Math.max(max, expansionPacks.find(pack => pack.id === id)?.maxPlayers ?? 0), BASE_MAX_PLAYERS);
}

export function standardRoles(players: number): RoleCounts {
  if (players >= 8) return { deputy: 2, outlaw: 3, renegade: 2 };
  return { deputy: players >= 7 ? 2 : players >= 5 ? 1 : 0, outlaw: players >= 6 ? 3 : 2, renegade: 1 };
}

export function roleTotal(roles: RoleCounts): number {
  return 1 + roles.deputy + roles.outlaw + roles.renegade;
}

export function settingsError(roles: RoleCounts, players: number, maxPlayers: number): string | null {
  if (players < 4 || players > maxPlayers) return `Cần 4–${maxPlayers} người chơi để áp dụng phân vai. Dưới 4 người, phòng hiển thị mặc định cho 4 người.`;
  if (Object.values(roles).some(count => !Number.isInteger(count) || count < 0 || count > players - 1)) return `Mỗi vai cần có từ 0 đến ${players - 1} người.`;
  if (roleTotal(roles) !== players) return `Điều chỉnh tổng số vai thành ${players}, gồm 1 Cảnh sát trưởng.`;
  if (roles.outlaw + roles.renegade === 0) return 'Thêm ít nhất 1 Tội phạm hoặc Kẻ phản bội để ván có đối thủ.';
  return null;
}
