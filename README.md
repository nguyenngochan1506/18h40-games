# 18h40 games

Khung M0: server Rust/Axum, web React/TypeScript/Tailwind, WebSocket JSON có version và type TypeScript sinh từ Rust. Chưa có phòng hoặc logic game; `crates/bang` chỉ giữ chỗ.

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

Mở URL Vite in ra (mặc định `http://localhost:5173`). Web proxy `/ws` và `/healthz` đến `127.0.0.1:3000`. Server đọc `BIND_ADDR`, mặc định `127.0.0.1:3000`; nếu đổi cổng server khi dev, cập nhật proxy tương ứng. Có thể đặt `RUST_LOG=debug` để xem log chi tiết.

```sh
curl http://127.0.0.1:3000/healthz # ok
pnpm check
```

`pnpm check` kiểm tra định dạng Rust, Clippy, toàn bộ test Rust, typecheck và build web. Build riêng:

```sh
cargo build --workspace
pnpm --filter web build
```

Web build ra `apps/web/dist/`; M0 chỉ phục vụ web qua Vite, chưa cấu hình phục vụ file tĩnh trên server. Protocol mẫu: gửi `{"v":1,"type":"ping","nonce":42}`, nhận `{"v":1,"type":"pong","nonce":42}`; lỗi cũng có `v` và `type`.

Sau khi đổi protocol Rust, chạy `pnpm gen:types` và đưa `apps/web/src/generated/protocol.ts` vào cùng thay đổi. Script dùng ts-rs, sinh cả hằng version và type; chạy lại không đổi nội dung nếu Rust không đổi.
