# 18h40 games

Nền tảng phòng chơi: server Rust/Axum, engine BANG! bộ gốc, web React/TypeScript/Tailwind và WebSocket JSON có version. Bàn BANG! hiện chỉ để xem; chưa có thao tác đánh bài trên web. Type TypeScript sinh từ Rust.

Cần Rust hỗ trợ edition 2024, Node.js 26 và pnpm 10.34.9.

```sh
pnpm install --frozen-lockfile
pnpm gen:types
pnpm assets # tải 44 ảnh bộ gốc theo commit ghim; có thể bỏ qua để dùng khung chữ
```

Chạy ở hai terminal:

```sh
pnpm dev:server
pnpm dev:web
```

Mở URL Vite in ra (mặc định `http://localhost:5173`). Nhập tên và bấm **Tạo phòng**, rồi mở một trình duyệt hoặc cửa sổ ẩn danh khác, nhập tên khác cùng mã phòng và bấm **Vào phòng**. Dùng cửa sổ riêng để mỗi người có localStorage riêng. Tải lại trang sẽ vào lại bằng token; ngắt mạng rồi nối lại để thử backoff. Nếu cùng phiên được mở ở nơi khác, kết nối cũ dừng tự nối lại để hai tab không giành phiên qua lại.

BANG! tạm dùng 4–7 ghế. Người vào khi đủ ghế hoặc đang chơi là khán giả. Chủ phòng bắt đầu khi đủ người, kết thúc để mọi người trở về khán giả và tự bấm **Tham gia ván** cho ván kế tiếp. Bàn hiển thị view của người chơi/khán giả từ server; khi ván kết thúc, chủ phòng bấm Kết thúc ván để về phòng chờ.

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

`pnpm check` chạy fmt, Clippy không warning, test Rust, các test Node cho phiên/backoff, dữ liệu bài và trạng thái bàn chơi, typecheck và build web. Test thời hạn phòng dùng thời gian ảo Tokio và WebSocket thật, không đợi 60 giây/10 phút.

```sh
cargo build --workspace
pnpm --filter web build
```

Web build ra `apps/web/dist/`; web chạy qua Vite, server chưa phục vụ file tĩnh. Sau khi đổi protocol Rust, chạy `pnpm gen:types` và đưa `apps/web/src/generated/protocol.ts` vào cùng thay đổi. Script dùng ts-rs, sinh cả hằng version và type; chạy lại không đổi nội dung nếu Rust không đổi. `ping`/`pong` vẫn hỗ trợ, ví dụ `{"v":1,"type":"ping","nonce":42}`.

## Media và bàn mẫu BANG!

`pnpm assets` chỉ tải 44 WebP bộ gốc từ commit `dc7c29abffc566629ab0fae3bb3386280a7ae52c` của bang-cards vào `assets/bang/` (gitignored). Script kiểm tra header/kích thước, bỏ qua file hợp lệ và tải lại file thiếu/hỏng. Vite dùng `assets/` làm publicDir: ảnh phục vụ tại `/bang/` khi dev và được chép vào `dist/bang/` khi build. Chạy `pnpm assets` trước build nếu muốn bản dựng có ảnh; thiếu ảnh vẫn có khung chữ. Không đưa art vào git.

Khi chạy Vite dev, mở `/?demo=bang` để xem bàn mẫu 5 người mà không cần server; `/?demo=bang&view=spectator` xem góc khán giả. Demo không được bật trong production build. Chạm/hover/focus một lá bài để đọc hiệu ứng. Tên lá và nhân vật giữ nguyên tiếng Anh, các mô tả theo bảng dịch đã duyệt. Bộ mặt bài CardId được kiểm thử khớp với DECK trong Rust.

Client chỉ nhận update có seq kế tiếp; bỏ gói cũ, trùng hoặc nhảy mốc. Snapshot joined khi vào lại là nguồn đồng bộ đầy đủ; batch setup seq0 không cần cập nhật lại view đã nhận trong game_started. Bước này chưa dựng animation hay nhật ký event.
