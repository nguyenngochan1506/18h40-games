# Kế hoạch final: module hóa game + dựng khung UNO, Ma Sói

Cập nhật 2026-11-20. Nguồn: review của 3 codex (Rust, protocol, web) tại `/tmp/peer-agent/20261120-093900-2308342/*.answer.md`.
Mục tiêu: thêm game mới = thêm một module, không sửa nền tảng, không đụng game khác; UNO và Ma Sói sẽ giao cho thành viên khác cài đặt.

## 1. Quyết định đã chốt
1. `GameKind` là **enum hữu hạn** (`Bang`, `Uno`, `Werewolf`).
2. Wire **v7**: enum serde có tag `game` + payload có type. KHÔNG dùng `serde_json::Value` (giữ hàng rào chống lộ state/event thô; doctest `compile_fail`).
3. Trait `GameModule` + `GameSession` (dyn, đồng bộ) trong `apps/server/src/games/`; chưa tách crate `game-core` (trait là phần của server, crate game giữ là engine thuần, adapter nằm ở `games/<id>.rs`; chỉ tách khi crate game cần tự implement trait; tránh vòng phụ thuộc protocol↔bang↔core). Raw event batch không rời adapter (`apply()` giữ batch, `update(member)` render).
4. Web: `games/<id>/` + registry lazy + cờ `enabled`; tách lớp sync `seq` khỏi BANG!; CSS scope `.game-<id>`; script chặn import chéo.
5. Khung UNO/Ma Sói chỉ có hợp đồng + chỗ đặt code + tài liệu, không đoán luật; `enabled:false` nên lobby vẫn "Sắp có".
6. `games/bang/` chia thư mục con: fx/, sound/, scene/, drag/, demo/, styles/.
7. Assets: bỏ ignore `assets/bang/` (art bên thứ ba, đã chấp nhận rủi ro; repo public). XÓA `pnpm assets` + `scripts/fetch-assets.mjs`. Dời sang `assets/<game>/`.
8. `specs/` được bỏ ignore và đưa vào git (người dùng quyết 2026-11-20) để thành viên đọc trực tiếp trong repo; không còn bộ bàn giao riêng. Ngoại lệ: `specs/games/*/research/` (báo cáo phân tích repo bên thứ ba, ~120 KB) vẫn bị ignore, chỉ lưu trên máy tác giả. Specs sẽ được cập nhật ở P4.

## 2. Hợp đồng mới
**Protocol:** `GameKind`, `GameSettings`, `GameAction`, `GameView`, `GameDelta` đều tag `game`; `GameDelta::Bang{events,view}` gộp view+events; `ServerMessage::{GameUpdate,GameOver}` mang `update: GameDelta`; `GameSeat.player_id: usize`; `ErrorCode::GameUnavailable`; `BangView`/`BangEvents` + 2 doctest vào `protocol::bang`; `player_limits` rời protocol; `PROTOCOL_VERSION=7`.

**Server:** `GameModule`: `enabled`, `limits`, `default_settings`, `validate_settings`, `adjust_settings`, `start`. `GameSession`: `seq`, `seats`, `waiting_since`, `is_over`, `view`, `update`, `apply`, `apply_default`, `awaited_seat`, `may_continue_abandoned`. `rooms.rs` hết nhắc `bang::*`.
Giữ nguyên: thứ tự RNG/ChaCha, `seq=0` cho setup, lỗi không đổi state/RNG/seq, người bị loại nhận spectator view + public events (chính sách của Bang), `is_over` không tự về Waiting.

**Web:** `shared/gameSync.ts` (seq/gap/rejoin/setupPending/inputLocked); `games/registry.ts` + `types.ts`; Lobby/Room/WaitingRoom chỉ dùng registry; xử lý lỗi tải/game không hỗ trợ; xếp hàng batch khi module đang tải; portal root riêng (`GameTooltip`, `useCardDrag`); keyframe prefix; localStorage có tiền tố game; TS sinh tách theo game; `check-game-boundaries.mjs` (TypeScript AST) trong `pnpm check`.

## 3. Cấu trúc đích
```
crates/{bang,uno,werewolf,protocol(+bang.rs)}
apps/server/src/games/{mod,bang,uno,werewolf}.rs
apps/web/src/{app,features/{lobby,rooms},shared(+gameSync.ts),generated/{platform,bang,uno,werewolf}.ts,
  games/{registry.ts,types.ts,bang/{index,Board,Settings,state,log,actions,fx/,sound/,scene/,drag/,demo/,styles/},uno/,werewolf/}}
assets/{platform,bang,uno,werewolf}/
ADDING_A_GAME.md, scripts/check-game-boundaries.mjs
```

## 4. Cách làm: coder/reviewer (2 Codex), 4 pha, mỗi pha tối đa 3 vòng
Không commit/push. Reviewer chỉ xem diff từ mốc `git stash create`. Sau mỗi pha tôi tự xem diff và chạy kiểm tra.

| Pha | Việc | Xong khi |
|---|---|---|
| P1 Rust | Crate khung 2 game, protocol v7, trait + adapter Bang, sửa rooms.rs/lib.rs, gen-types, sửa test | fmt, clippy -D warnings, cargo test xanh; bất biến cũ qua (oracle cùng seed, privacy, seq=0, 59/60s, rejoin, abandoned-game, ping barrier) |
| P2 Web | Dời games/bang + thư mục con, tách sync, registry lazy, scope CSS/portal/asset/audio, xóa pnpm assets, script ranh giới | `pnpm check` xanh; shell không kéo BANG!/Pixi; kiểm tra trình duyệt: batch seq=0 không mất, CSS/portal không rò |
| P3 Khung + README | games/uno, games/werewolf (manifest, placeholder, CSS scope), ADDING_A_GAME.md, viết lại README (gốc = giới thiệu + kiến trúc + chạy nhanh + cấu hình; media/âm thanh/demo -> games/bang/README.md; sửa "gitignored"/"Không đưa art vào git"), test game khung không mở được phòng | `pnpm check` toàn bộ xanh |
| P4 Spec | Sửa overview.md, architech.md (cấu trúc repo, protocol v7, mã lỗi, M1), technical-rule.md điều 4; tạo specs/games/_template/; xóa progress.md rỗng; sửa 4 link chết tới research/ (engine.md:4, assets.md:3, rules.md:10, overview.md:26) thành ghi chú "báo cáo gốc chỉ lưu trên máy tác giả" | Spec khớp code; người mới đọc được hợp đồng module |

Tôi tự viết P4 và README (không giao coder).

## 5. Bàn giao
- `specs/` nằm trong git: thành viên clone repo là có đủ spec nền tảng (overview, architech, technical-rule, multi-game-plan) và spec game (`specs/games/<game>/`, BANG! làm mẫu).
- Giao việc UNO/Ma Sói được từ sau P1 (khung Rust ổn); spec cập nhật ở P4.
- `research/` không có trong repo; thành viên không cần nó để làm việc.
- Chưa commit: người dùng chưa yêu cầu.

## 6. Rủi ro
- v7 đổi wire: deploy server+web cùng nhau, phòng đang chạy rớt.
- Từ cuối P1 đến hết P2 typecheck web gãy (TS sinh lại).
- Giới hạn người chơi UNO 2-10, Ma Sói 5-16 chỉ là ước lượng (TODO cho người cài đặt).
- Art BANG! bên thứ ba nằm trong git public: rủi ro khiếu nại bản quyền (đã chấp nhận).

## 7. Ngoài phạm vi
Luật/bài/UI thật của UNO, Ma Sói; plugin loader runtime; crate game-core; packages/ui.

## Trạng thái (2026-11-20)
P1, P2, P3, P4 đã xong và được reviewer duyệt (P2 sau 2 vòng; P3+P4 sau khi sửa 6 lỗi tài liệu). `pnpm check` xanh (148 test Rust, 262 test web). Kiểm tra trình duyệt: lobby không tải BANG!, phòng chờ + bàn chơi lên đúng, rời phòng dọn sạch portal/CSS. Chưa commit/push.
