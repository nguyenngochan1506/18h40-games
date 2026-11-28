# Kiến trúc

> Xem nguyên tắc ở [technical-rule.md](technical-rule.md). Mục nào **[Đề xuất]** là cần xác nhận.

## 1. Cấu trúc repo **[Chốt]**

```
18h40-games/
├── specs/                         # spec nền tảng + specs/games/<game>/
├── ADDING_A_GAME.md               # hướng dẫn thêm game
├── apps/
│   ├── server/src/
│   │   ├── rooms.rs               # phòng, phiên, scheduler (không biết luật game)
│   │   └── games/                 # GameModule/GameSession + adapter mỗi game
│   └── web/src/
│       ├── app/ features/ shared/ # shell nền tảng
│       ├── games/<id>/            # toàn bộ phần web của một game
│       └── games/registry.ts      # danh mục game, load() lazy
├── crates/
│   ├── bang/ uno/ werewolf/       # engine luật từng game (thuần, có test)
│   └── protocol/                  # message, DTO, version, sinh type TS
├── assets/<game>/ , assets/platform/
├── scripts/                       # gen-types, check-web-build, check-game-boundaries
├── Cargo.toml                     # Rust workspace
└── package.json
```

Chưa có: crate `game-core`, plugin loader lúc chạy, `packages/ui`, `packages/game-client`. Hợp đồng nền tảng ↔ game ở §7.

Frontend: `app/` (routes, providers), `features/` (lobby, rooms), `shared/` (socket, session, đồng bộ `seq`), `games/<id>/` (Board, Settings, hiệu ứng, âm thanh, asset riêng).

## 2. Phòng và phiên

- **Mã phòng:** ngắn (4 đến 5 ký tự, dễ đọc). Người tạo phòng là chủ phòng.
- **Nickname** phải duy nhất trong phòng.
- **Số người:** do từng game quyết định. Chủ phòng bấm bắt đầu khi đủ người.
- **Token phiên:** khi vào phòng, server cấp token ngẫu nhiên, client giữ trong `localStorage`. Gửi lại token và mã phòng để lấy lại đúng ghế (hoặc chỗ khán giả).
- **Khán giả:** người vào phòng khi ván đang chơi, hoặc khi phòng đã đủ số người tối đa, trở thành khán giả. Khán giả chỉ nhận thông tin công khai (`SpectatorView`), không tác động được vào ván. Nickname duy nhất tính cả khán giả.
- **Mất kết nối:**
  - Ghế chuyển sang "offline", ván vẫn tiếp tục.
  - Nếu ván đang chờ người đó, chờ **60 giây** (cấu hình được), rồi áp dụng hành động mặc định **do từng game định nghĩa**. Chủ phòng có nút bỏ qua thủ công.
- **Dọn phòng:** phòng trống quá 10 phút thì xóa.
- **Lưu trữ:** mỗi phòng là một tác vụ tokio sở hữu `GameState`, nhận lệnh qua channel. Server khởi động lại thì mất ván đang chơi, chấp nhận được ở v1. Không DB.

### Quy tắc chi tiết cho M1 **[Đề xuất]**

Bổ sung cho các mục trên; chốt khi M1 xong.

- **Mã phòng:** 5 ký tự, bảng chữ cái không gây nhầm lẫn (bỏ `0 O 1 I L`), sinh bằng RNG của hệ điều hành, kiểm tra trùng. Người dùng nhập không phân biệt hoa thường.
- **Nickname:** cắt khoảng trắng hai đầu; 1 đến 20 ký tự Unicode; không chứa ký tự điều khiển; duy nhất trong phòng **không phân biệt hoa thường**, tính cả khán giả.
- **Vai trong phòng:** người chơi hoặc khán giả. Người tạo phòng là chủ phòng và là người chơi. Người vào sau là người chơi nếu phòng đang chờ và còn ghế, ngược lại là khán giả.
- **Tham gia ván:** trong lúc phòng đang chờ, khán giả bấm "Tham gia" để thành người chơi nếu còn ghế.
- **Bắt đầu:** chỉ chủ phòng, phòng đang chờ, số người chơi từ mức tối thiểu của game. phòng chuyển sang `playing` và dựng ván qua `GameModule::start`; ván kết thúc thì chủ phòng bấm "Kết thúc ván" để về `waiting`. Số người chơi lấy từ `GameModule::limits()` của game (BANG!: 4 đến 7).
- **Rời phòng:** thành viên rời chủ động thì bị xóa hẳn và token hết hiệu lực.
- **Mất kết nối:** thành viên chuyển sang "offline". Nếu là khán giả, hoặc phòng đang chờ: bị xóa sau **60 giây** nếu chưa vào lại. Nếu là người chơi và phòng đang chơi: giữ ghế (game quyết định hành động mặc định ở các mốc sau).
- **Chủ phòng:** khi chủ phòng rời, hoặc offline quá 60 giây, quyền chủ phòng chuyển cho thành viên **online** vào phòng sớm nhất (ưu tiên người chơi).
- **Dọn phòng:** phòng không còn thành viên online quá **10 phút** thì xóa.
- **Token:** 128 bit ngẫu nhiên từ RNG của hệ điều hành, chỉ gửi cho chính thành viên đó. Vào lại cần mã phòng và token. Một token chỉ có một kết nối: vào lại khi kết nối cũ còn sống thì kết nối cũ bị đóng.
- **Mỗi kết nối chỉ ở trong một phòng.**
- **Giới hạn tài nguyên:** tối đa 32 thành viên mỗi phòng, 1000 phòng; message tối đa 16 KiB.
- **Origin của `/ws`:** nếu có header `Origin` thì phải trùng với host của header `Host` (cùng nguồn) hoặc nằm trong biến môi trường `ALLOWED_ORIGINS` (danh sách phân cách bằng dấu phẩy); ngược lại trả 403. Không có `Origin` (client không phải trình duyệt, test) thì cho qua.
- **Mỗi phòng là một tác vụ tokio** sở hữu state và nhận lệnh qua channel; mỗi kết nối có một hàng đợi gửi ra riêng. Thời gian chờ (60 giây, 10 phút) phải cấu hình được để test không phải chờ thật.

## 3. Protocol **[Chốt]**

- JSON qua WebSocket, mỗi message có trường `v` (version).
- Client gửi: tạo phòng, vào phòng, vào lại (token), bắt đầu, hành động trong ván.
- Server gửi: trạng thái phòng, **chuỗi event** của ván (đã lọc theo người nhận; khán giả nhận bản công khai) cùng số thứ tự, lỗi.
- Khi vào lại: server gửi **snapshot** (`GameSnapshot{seq, seats, view}` với `view` là `GameView` đã lọc theo người nhận: người chơi, khán giả hoặc người bị loại), sau đó tiếp tục bằng event.
- Frontend dùng chuỗi event để diễn animation (`motion`) thay vì chỉ so sánh hai snapshot.

### Message (protocol v11) **[Chốt]**

Mọi message có `v` và `type` (snake_case). Hiện `v = 11`. Client và server phải cập nhật cùng nhau mỗi khi đổi giao thức.

- **Client gửi:** `create_room{nickname, game}`, `join_room{room_code, nickname}`, `rejoin_room{room_code, token}`, `leave_room`, `take_seat`, `change_game{game}`, `start_game`, `update_settings{settings}`, `game_action{action}`, `host_skip`, `transfer_host{member}` (chỉ chủ phòng; người nhận phải đang online), `end_game`, `ping{nonce}`.
- **Đổi game:** Chủ phòng dùng `change_game` khi phòng đang chờ và game đích đã bật. Khi chọn game khác, server dùng cài đặt mặc định và giới hạn ghế của game mới, đưa mọi người về khán giả rồi gửi `room_state`. Mã phòng, thành viên và token vào lại được giữ. Chọn lại game hiện tại giữ ghế và cài đặt đang dùng.
- **Server gửi:** `joined{room_code, token, room, game, voice_enabled}` (trả lời create/join/rejoin; `game` là snapshot ván nếu đang chơi), `room_state{room}`, `game_started{seq, seats, view}`, `game_update{seq, update}`, `game_over{seq, update}`, `left`, `pong{nonce}`, `error{code, message}`. Với `unsupported_version`, `v` của khung lỗi lặp lại `v` client đã gửi để client cũ đọc được mã lỗi thay vì loại khung vì lệch phiên bản.
- **Thoại phòng** dùng `voice_token{nonce}` và `voice_leave{nonce}` trên WebSocket của thành viên hiện hành. Phản hồi riêng cho người yêu cầu gồm `voice_token_result{nonce,result}` (ok với URL, JWT và hạn Unix giây, hoặc error với mã lỗi thoại) và `voice_leave_result{nonce,error}` (null nếu đã bỏ quyền cấp JWT cho lượt cũ). Thoại giữ nguyên khi ghế, pha, ván hoặc game thay đổi. Gói thoại dùng nonce riêng và không đổi `seq`.
- **Payload theo game** là enum có tag `game` + payload có type, **không dùng JSON tự do**: `GameSettings`, `GameAction`, `GameView` (`{game, payload}`), `GameDelta` (`{game, events, view}`). Mỗi game có kiểu riêng; event đi qua wrapper chỉ tạo được bằng hàm lọc theo người nhận (doctest `compile_fail` chặn đưa state/event thô vào wire).
- **`room`** (`RoomView`): `code`, `game` (`bang`|`uno`|`werewolf`|`cats`), `settings` (`GameSettings`), `phase` (`waiting`|`playing`), `host`, `you`, `min_players`, `max_players`, `members[]` gồm `id`, `nickname`, `role` (`player`|`spectator`), `online`.
- **`seq`:** `u32` riêng mỗi ván; `game_started` = 0 và batch setup cũng mang 0; mỗi bước thành công tăng đúng 1 tại một chỗ trong adapter; gói bị từ chối không tăng; `joined.game.seq` là mốc hiện tại.
- **Mã lỗi:** `unsupported_version`, `invalid_message`, `room_not_found`, `nickname_taken`, `invalid_nickname`, `invalid_token`, `already_in_room`, `not_in_room`, `not_host`, `wrong_phase`, `not_enough_players`, `no_free_seat`, `server_busy`, `illegal_action`, `invalid_settings`, `game_unavailable` (game chưa bật).

## 4. Giao diện chung

- Responsive: dùng được trên điện thoại (chạm để chọn bài, chạm để chọn mục tiêu) lẫn máy tính.
- Toàn bộ chữ hiển thị bằng tiếng Việt, không dùng i18n ở v1.

## 5. Triển khai

- **[Chốt]** Một VPS duy nhất.
- **[Chốt]** Server axum chỉ phục vụ `/healthz` và `/ws`; web build ra `apps/web/dist/` và được phục vụ riêng (Dockerfile có hai target: `server` và `web` dùng nginx với `deploy/nginx.conf`). Khi dev, Vite proxy `/ws` và `/healthz` đến server. Cần reverse proxy có HTTPS phía trước để dùng `wss://`. Việc để axum phục vụ luôn file tĩnh **chưa làm**.

## 6. Ranh giới giữa nền tảng và game

- **Nền tảng** lo phòng, ghế, kết nối, phiên, thoại theo phòng và chuyển action/event giữa client và engine.
- **Game** sở hữu mọi thứ còn lại: luật, bài, trạng thái, hành động mặc định khi hết giờ chờ, tài nguyên hình ảnh, giao diện bàn chơi, bất biến để test. Tất cả nằm trong `specs/games/<game>/`.

## 7. Hợp đồng module game **[Chốt]**

Hướng dẫn từng bước: [../ADDING_A_GAME.md](../ADDING_A_GAME.md). Tóm tắt:

- **`GameKind`** (enum hữu hạn) chọn game của phòng; tạo phòng cho game `enabled() == false` trả `game_unavailable`.
- **`GameModule`** (`apps/server/src/games/mod.rs`, một instance tĩnh mỗi game): `enabled`, `limits`, `default_settings`, `validate_settings`, `adjust_settings` (khi số người chơi đổi ở phòng chờ), `start` (dựng `GameSession`).
- **`GameSession`**: `seq`, `seats`, `waiting_since`, `is_over`, `view`, `snapshot`, `update` (render batch của bước gần nhất), `apply`, `apply_default`, `awaited_seat`, `may_continue_abandoned`. Event thô nằm kín trong adapter.
- **Nền tảng giữ:** ánh xạ thành viên → ghế (bất biến), `seq`, scheduler timeout offline, host, token, khán giả. **Game giữ:** luật, RNG của ván, quyền xem (ai nhận view/event nào), hành động mặc định, art, âm thanh, giao diện bàn.
- **Web:** `games/registry.ts` có metadata nhẹ cho mọi `GameKind` và `load()` lazy trả `GameClient { Board, Settings, Root? }`; shell không import implementation game. Script `scripts/check-game-boundaries.mjs` chặn import chéo giữa `games/*` và shell → implementation.
- **Cách ly:** CSS dưới `.game-<id>`, keyframe/localStorage có tiền tố, asset ở `assets/<id>/`.
