import type { RoleCounts } from '../../generated/protocol.ts';

export function standardRoles(players: number): RoleCounts {
  return { deputy: players >= 7 ? 2 : players >= 5 ? 1 : 0, outlaw: players >= 6 ? 3 : 2, renegade: 1 };
}

export function roleTotal(roles: RoleCounts): number {
  return 1 + roles.deputy + roles.outlaw + roles.renegade;
}

export function settingsError(roles: RoleCounts, players: number): string | null {
  if (players < 4 || players > 7) return 'Cần 4–7 người chơi để áp dụng phân vai. Dưới 4 người, phòng hiển thị mặc định cho 4 người.';
  if (Object.values(roles).some(count => !Number.isInteger(count) || count < 0 || count > 6)) return 'Mỗi vai cần có từ 0 đến 6 người.';
  if (roleTotal(roles) !== players) return `Điều chỉnh tổng số vai thành ${players}, gồm 1 Cảnh sát trưởng.`;
  if (roles.outlaw + roles.renegade === 0) return 'Thêm ít nhất 1 Tội phạm hoặc Kẻ phản bội để ván có đối thủ.';
  return null;
}
