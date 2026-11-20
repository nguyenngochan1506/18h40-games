# Thêm một game mới

Hướng dẫn cho người cài đặt UNO, Ma Sói hoặc game khác. Nền tảng lo phòng, ghế, kết nối, phiên, timeout và đồng bộ `seq`; **game lo luật, bài, view, giao diện bàn, art và âm thanh**. Mỗi game là một module: với UNO và Ma Sói (đã có khung) chỉ cần điền code rồi bật cờ `enabled`, không sửa logic nền tảng và không đụng game khác. Một game thứ tư cần thêm bước đăng ký, xem mục "Đăng ký game mới (ngoài UNO, Ma Sói)" ở cuối.

UNO và Ma Sói đã có **khung** (biên dịch và test xanh, `enabled = false`, lobby ghi "Sắp có"). BANG! là bản cài đặt hoàn chỉnh để tham khảo.

Đọc trước: [specs/technical-rule.md](specs/technical-rule.md) (8 nguyên tắc, đặc biệt: server authoritative, engine thuần, `GameState` ≠ `PlayerView`, RNG có seed) và [specs/architech.md](specs/architech.md).

## Bản đồ file của một game `<id>`

| Việc | Nơi làm | Mẫu để xem |
| --- | --- | --- |
| Spec luật, engine, art | `specs/games/<id>/` (sao chép `specs/games/_template/`) | `specs/games/bang/` |
| Engine luật (thuần) | `crates/<id>/` | `crates/bang/` |
| Kiểu wire (Settings, Action, View, Events) | `crates/<id>/src/lib.rs`, gói vào enum ở `crates/protocol/src/lib.rs` | `crates/protocol/src/bang.rs` |
| Adapter server (GameModule + GameSession) | `apps/server/src/games/<id>.rs` | `apps/server/src/games/bang.rs` |
| Giao diện | `apps/web/src/games/<id>/` | `apps/web/src/games/bang/` |
| Art, âm thanh | `assets/<id>/` | `assets/bang/` |
| Tài liệu riêng của game | `apps/web/src/games/<id>/README.md` | `apps/web/src/games/bang/README.md` |

Khung đã tạo sẵn các file trên với `TODO` đánh dấu chỗ cần điền.

## Các bước

### 1. Spec
Viết `specs/games/<id>/rules.md` (luật, các chỗ luật không rõ phải chốt) và `engine.md` (cơ chế chờ quyết định, quyền sở hữu bài, hết giờ, view, ca biên). Xin duyệt trước khi code nhiều.

### 2. Engine Rust (`crates/<id>`)
Thư viện thuần: không network, không DB, không render, không biết phòng. API theo mẫu `crates/bang`:

- `setup(số người, settings, &mut rng) -> Result<(State, Vec<Event>), _>`: kiểm tra settings **trước khi** tiêu thụ RNG.
- `apply(&mut state, người_chơi, action, &mut rng) -> Result<Vec<Event>, _>`: validator chạy **trước mọi thay đổi** state/RNG; lỗi thì không đổi gì.
- `view(&state, người)` và `spectator_view(&state)`: chỉ chứa thứ người đó được phép thấy.
- `filter_events(&events, người nhận)`: lọc event theo người nhận (người rút bài thấy lá gì, người khác chỉ thấy số lượng).
- `default_action(&state) -> Option<(người, action)>`: hành động mặc định khi người được chờ hết giờ hoặc rời phòng.
- `decision(&state)`: ai đang được chờ.

`State` và `Event` thô chứa bí mật nên **không derive `Serialize` trong game mới**; chỉ `View` và `Events` đã lọc mới được gửi ra ngoài. (BANG! là trường hợp cũ: state/event thô có `Serialize` để replay/test, và chốt chống đưa chúng lên wire nằm ở DTO/wrapper của `protocol` cùng test privacy.) Cập nhật `PLAYER_LIMITS` (khung đang ghi con số ước lượng).

### 3. Protocol (`crates/protocol`)
Wire dùng enum serde có tag `game` + payload có type, **không dùng `serde_json::Value`** để giữ hàng rào chống lộ bí mật. Khung đã có sẵn variant `Uno`/`Werewolf` trong `GameKind`, `GameSettings`, `GameAction`, `GameView`, `GameDelta`; bạn thay kiểu rỗng bằng kiểu thật. Với events: tạo wrapper như `BangEvents` (trường private, chỉ tạo qua hàm lọc theo người nhận) kèm doctest `compile_fail` chặn đưa state/event thô vào wire. Sau đó chạy `pnpm gen:types` và đưa `apps/web/src/generated/protocol.ts` vào cùng thay đổi. Đổi hình dạng wire của game đang chạy thì tăng `PROTOCOL_VERSION` (server và web deploy cùng nhau).

### 4. Adapter server (`apps/server/src/games/<id>.rs`)
Cài `GameModule` (giới hạn người chơi, settings mặc định, validate/adjust settings, `start`) và `GameSession`. Quy tắc nền tảng đòi hỏi:

- **`seq`** tăng đúng 1 ở **một chỗ** (hàm `step`), chỉ sau khi `apply` thành công. Setup batch có `seq = 0`.
- Lỗi **không đổi** state, RNG, `seq`, batch.
- `update(member)` render batch của bước gần nhất; event thô không rời adapter.
- Quyền xem do adapter quyết (BANG!: người bị loại nhận view khán giả); đừng đưa khái niệm riêng của game (chết, vai, bài chờ) lên `rooms.rs`.
- `awaited_seat` bám theo `default_action` (không dùng thứ không có bước mặc định); `may_continue_abandoned` quyết định có tự đánh tiếp khi mọi người đã rời.
- `waiting_since` chỉ reset khi quyết định đang chờ đổi.
- Đừng quên `is_over`: game over không tự đưa phòng về waiting; chủ phòng bấm Kết thúc ván.
- RNG: seed OS (hoặc seed test từ `Config`), mỗi phòng một RNG.

### 5. Giao diện (`apps/web/src/games/<id>/`)
- `info.ts`: metadata cho lobby (tên, mô tả, giới hạn, icon, `status`, `enabled`) và `load()` lazy; `client.ts` xuất `GameClient { Board, Settings, Root? }`.
- `Board` nhận `GameBoardProps` (room, `sync`, callback `sendAction`, `endGame`, `leaveRoom`, `hostSkip`...). **Phải xử lý `sync.frames` theo thứ tự rồi gọi `consume(frame.id)`**, nếu không hàng đợi không rỗng, Room khóa thao tác và tràn 128 frame thì phải rejoin; phân biệt reset/setup `seq = 0`, không replay hiệu ứng khi vào lại (joined); `requestVersion` Board dùng để chốt trạng thái kéo-thả phải đi cùng frame đã render (xem bản sửa ở `games/bang/Client.tsx`). `sync` do nền tảng quản lý (`shared/gameSync.ts`: bỏ gói trùng/lùi, xử lý seq nhảy, rejoin); game đọc payload đã có tag `game` của mình và dựng UI. Xem `games/bang/Client.tsx` làm mẫu cách đọc frame, log, hiệu ứng.
- **Chỉ dựng action từ thao tác của người chơi**, không tự tính luật: luật ở server.
- `Settings` nhận `GameSettingsProps`; shell lo gửi `update_settings`.
- Tiếng Việt cho mọi chuỗi hiển thị; hỗ trợ bàn phím, focus rõ, `prefers-reduced-motion`.

### 6. Bật game
1. `apps/server/src/games/<id>.rs`: `enabled()` trả `true`.
2. `apps/web/src/games/<id>/info.ts`: `enabled: true`, `status: 'available'`.
3. Đảm bảo `pnpm check` xanh.

## Đăng ký game mới (ngoài UNO, Ma Sói)
Danh sách game là tĩnh (không có plugin loader), nên game thứ tư phải được đăng ký ở các điểm sau; logic phòng, shell và game cũ không cần sửa:
1. `Cargo.toml` (workspace members) và `crates/protocol/Cargo.toml`, `apps/server/Cargo.toml` (dependency vào crate mới).
2. `crates/protocol/src/lib.rs`: thêm variant vào `GameKind`, `GameSettings`, `GameAction`, `GameView`, `GameDelta`.
3. `crates/protocol/examples/gen_types.rs`: liệt kê kiểu TS của game (tên không trùng nhau, dùng `ts(rename = ...)`), rồi `pnpm gen:types`.
4. `apps/server/src/games/mod.rs`: thêm module và nhánh trong `module(kind)`.
5. `apps/web/src/games/registry.ts`: thêm `info` của game; `apps/web/src/games/<id>/` theo mẫu.
6. `assets/<id>/`, `specs/games/<id>/`, README của game.

## Quy tắc cách ly (CI chặn một phần)
- Game **không import** game khác; game không import `app/`, `features/`; shell chỉ trỏ tới `games/registry` và `games/types`. Script `scripts/check-game-boundaries.mjs` (trong `pnpm check`) bắt các vi phạm này.
- CSS của game dưới root `.game-<id>`; tên keyframe có tiền tố `<id>-`; portal (tooltip, kéo-thả) render vào root riêng mang class `.game-<id>`.
- Khóa `localStorage` có tiền tố `<id>-`.
- Art và âm thanh đặt ở `assets/<id>/`; URL phục vụ là `/<id>/...`. Chỉ đưa vào repo art mình tự làm hoặc có giấy phép (repo public).
- Không thêm thứ dùng chung vào `shared/` hay `features/` chỉ vì tiện; nếu thực sự dùng chung, bàn với người phụ trách nền tảng.

## Checklist test bắt buộc
- Test đơn vị cho từng luật; **fuzz**: bot chọn hành động hợp lệ ngẫu nhiên đến hết ván (không panic, ván luôn kết thúc, cùng seed cùng kết quả) với các bất biến riêng của game.
- Privacy: với từng người nhận (người chơi, khán giả, người bị loại), view và events không lộ thông tin ẩn.
- Lỗi (`apply` bị từ chối) không đổi state, RNG, `seq`.
- Server: oracle cùng seed qua WebSocket, setup `seq = 0`, rejoin giữa ván, ghế rời tự đánh mặc định đúng hạn, ván bỏ hoang không chạy vô hạn, game over giữ snapshot.
- Web: đồng bộ (gói trùng/lùi/nhảy), `Board` render được và gọi `leaveRoom`, `pnpm --filter web build` không kéo game vào entry tĩnh.
