# 18h40 games

Nền tảng phòng chơi M1: server Rust/Axum, web React/TypeScript/Tailwind, WebSocket JSON có version và type TypeScript sinh từ Rust. Ván chỉ có trạng thái chờ/đang chơi; `crates/bang` chưa có engine.

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

BANG! tạm dùng 4–7 ghế. Người vào khi đủ ghế hoặc đang chơi là khán giả. Chủ phòng bắt đầu khi đủ người, kết thúc để mọi người trở về khán giả và tự bấm **Tham gia ván** cho ván kế tiếp. Chưa có luật chơi hoặc bài.

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

`pnpm check` chạy fmt, Clippy không warning, test Rust, hai test Node cho phiên/backoff, typecheck và build web. Test thời hạn phòng dùng thời gian ảo Tokio và WebSocket thật, không đợi 60 giây/10 phút.

```sh
cargo build --workspace
pnpm --filter web build
```

Web build ra `apps/web/dist/`; web chạy qua Vite, server chưa phục vụ file tĩnh. Sau khi đổi protocol Rust, chạy `pnpm gen:types` và đưa `apps/web/src/generated/protocol.ts` vào cùng thay đổi. Script dùng ts-rs, sinh cả hằng version và type; chạy lại không đổi nội dung nếu Rust không đổi. `ping`/`pong` vẫn hỗ trợ, ví dụ `{"v":1,"type":"ping","nonce":42}`.
