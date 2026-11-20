# 18h40 games

Nền tảng phòng chơi board game cho nhóm bạn: server Rust/Axum, web React/TypeScript/Tailwind, WebSocket JSON có version (hiện là v7). Nền tảng lo phòng, ghế, kết nối và phiên; mỗi game là một module độc lập cắm vào. Type TypeScript sinh từ Rust.

| Game | Trạng thái | Tài liệu |
| --- | --- | --- |
| BANG! (4–7 người) | Chơi được | [apps/web/src/games/bang/README.md](apps/web/src/games/bang/README.md), [specs/games/bang/](specs/games/bang/) |
| UNO | Khung, chưa có luật | [crates/uno](crates/uno), [apps/web/src/games/uno](apps/web/src/games/uno) |
| Ma Sói | Khung, chưa có luật | [crates/werewolf](crates/werewolf), [apps/web/src/games/werewolf](apps/web/src/games/werewolf) |

## Cấu trúc

```
crates/
  bang/ uno/ werewolf/   engine luật của từng game (thuần, không biết mạng/phòng)
  protocol/              message, DTO, version; sinh type TS (ts-rs)
apps/
  server/src/
    rooms.rs             phòng, phiên, scheduler (không biết luật game)
    games/               GameModule + GameSession; một adapter mỗi game
  web/src/
    app/ features/ shared/   shell nền tảng: lobby, phòng, socket, đồng bộ seq
    games/<id>/              toàn bộ phần web của một game (lazy-load)
    games/registry.ts        danh mục game (metadata nhẹ + load())
assets/<id>/                 art, âm thanh của từng game; assets/platform/ dùng chung
specs/                       spec nền tảng và spec từng game
```

Thêm game mới: đọc [ADDING_A_GAME.md](ADDING_A_GAME.md). Quy trình cộng tác (nhánh, PR, review): [CONTRIBUTING.md](CONTRIBUTING.md). `pnpm check` chạy cả script chặn import chéo giữa các game (`scripts/check-game-boundaries.mjs`).

Cần Rust hỗ trợ edition 2024, Node.js 26 và pnpm 10.34.9.

```sh
pnpm install --frozen-lockfile
pnpm gen:types
```

Chạy ở hai terminal:

```sh
pnpm dev:server
pnpm dev:web
```

Mở URL Vite in ra (mặc định `http://localhost:5173`). Nhập tên và bấm **Tạo phòng**, rồi mở một trình duyệt hoặc cửa sổ ẩn danh khác, nhập tên khác cùng mã phòng và bấm **Vào phòng**. Dùng cửa sổ riêng để mỗi người có localStorage riêng. Tải lại trang sẽ vào lại bằng token; ngắt mạng rồi nối lại để thử backoff. Nếu cùng phiên được mở ở nơi khác, kết nối cũ dừng tự nối lại để hai tab không giành phiên qua lại.

Số ghế do từng game quy định (BANG!: 4–7). Người vào khi đủ ghế hoặc đang chơi là khán giả. Chủ phòng bắt đầu khi đủ người, kết thúc để mọi người trở về khán giả và tự bấm **Tham gia ván** cho ván kế tiếp. Bàn hiển thị view của người chơi/khán giả từ server; khi ván kết thúc, chủ phòng bấm Kết thúc ván để về phòng chờ.

## Cấu hình server

| Biến môi trường | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `BIND_ADDR` | `127.0.0.1:3000` | Địa chỉ bind |
| `ALLOWED_ORIGINS` | rỗng | Origin được phép thêm, phân cách bằng dấu phẩy; Origin cùng Host luôn được phép, không có Origin cũng được phép |
| `OFFLINE_TIMEOUT_SECS` | `60` | Xóa người offline khi đang chờ/khán giả; chuyển chủ phòng sau thời gian này |
| `EMPTY_ROOM_TIMEOUT_SECS` | `600` | Xóa phòng không có ai online |
| `MAX_ROOM_MEMBERS` | `32` | Tổng người chơi và khán giả, kể cả offline |
| `MAX_ROOMS` | `1000` | Tổng phòng, kể cả phòng đang chờ dọn |
| `MAX_MESSAGE_BYTES` | `16384` | Giới hạn message và từng frame WebSocket |
| `RUST_LOG` | `info` | Mức log tracing |

Hàng lệnh mỗi phòng và hàng gửi mỗi kết nối cố định 64 phần tử; client nhận quá chậm bị đóng. Các thời gian và giới hạn cấu hình phải lớn hơn 0. Web proxy `/ws` và `/healthz` đến `127.0.0.1:3000`; nếu đổi cổng server khi dev, cập nhật proxy tương ứng. Không ghi token vào log. Tất cả state ở RAM, khởi động lại server sẽ mất phòng và token.

```sh
curl http://127.0.0.1:3000/healthz # ok
pnpm check
```

`pnpm check` chạy fmt, Clippy không warning, test Rust, script ranh giới giữa các game, các test Node (phiên/backoff, đồng bộ seq, registry, từng game), typecheck và build web. Test thời hạn phòng dùng thời gian ảo Tokio và WebSocket thật, không đợi 60 giây/10 phút.

```sh
cargo build --workspace
pnpm --filter web build
```

Web build ra `apps/web/dist/`; web chạy qua Vite, server chưa phục vụ file tĩnh. Sau khi đổi protocol Rust, chạy `pnpm gen:types` và đưa `apps/web/src/generated/protocol.ts` vào cùng thay đổi. Script dùng ts-rs, sinh cả hằng version và type; chạy lại không đổi nội dung nếu Rust không đổi. `ping`/`pong` vẫn hỗ trợ, ví dụ `{"v":7,"type":"ping","nonce":42}`.

## Triển khai

Protocol đổi version thì server và web phải deploy cùng nhau; phòng đang chạy sẽ mất khi khởi động lại.
