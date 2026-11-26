# Ma Sói (Ultimate Werewolf: Deluxe Edition)

Bản cài đặt Ma Sói theo luật **Ultimate Werewolf: Deluxe Edition** cho 5–16 người chơi.

## Cấu trúc module
- `info.ts`: metadata cho sảnh và loader lazy.
- `client.ts`: xuất `GameClient { Board, Settings }`.
- `roles.ts`: dữ liệu 16 vai trò, điểm cân bằng chính thức và bộ bài chuẩn cho 5–16 người.
- `RoleCard.tsx`: hiển thị lá bài minh họa từng vai trò (ảnh tại `/werewolf/cards/*.webp`).
- `Settings.tsx`: tùy chỉnh bộ bài và tùy chọn lật vai khi chết ở phòng chờ.
- `state.ts`: xử lý frame đồng bộ từ server và nhật ký sự kiện tiếng Việt.
- `Board.tsx`: giao diện bàn chơi đêm/ngày, thẻ vai trò cá nhân, danh sách người chơi và nhật ký làng.

## Tài liệu luật & engine
- [specs/games/werewolf/rules.md](../../../../../specs/games/werewolf/rules.md)
- [specs/games/werewolf/engine.md](../../../../../specs/games/werewolf/engine.md)
- [specs/games/werewolf/assets.md](../../../../../specs/games/werewolf/assets.md)
