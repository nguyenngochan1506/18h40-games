# UNO (khung web)

Chưa có luật. Đây là **khung** để người cài đặt điền; làm theo [ADDING_A_GAME.md](../../../../../ADDING_A_GAME.md).

| File | Việc cần làm |
| --- | --- |
| `info.ts` | Metadata cho lobby; khi xong đổi `enabled: true`, `status: 'available'` (và bật `enabled()` ở `apps/server/src/games/uno.rs`) |
| `client.ts` | Xuất `GameClient { Board, Settings, Root? }` (thường không cần sửa) |
| `Board.tsx` | Bàn chơi: đọc frame của game từ `sync`, dựng UI, gọi `sendAction` |
| `Settings.tsx` | Editor cài đặt phòng chờ (gọi `onChange` cùng tag game) |
| `styles.css` | CSS dưới `.game-uno`; keyframe có tiền tố `uno-` |

Engine Rust ở `crates/uno`, adapter server ở `apps/server/src/games/uno.rs`, art ở `assets/uno/`, spec ở `specs/games/uno/` (sao chép từ `specs/games/_template/`). Không import từ `games/` của game khác (CI chặn).
