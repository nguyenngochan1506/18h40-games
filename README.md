# 18h40 games

Nền tảng phòng chơi board game cho nhóm bạn: server Rust/Axum, web React/TypeScript/Tailwind, WebSocket JSON có version (hiện là v8). Nền tảng lo phòng, ghế, kết nối và phiên; mỗi game là một module độc lập cắm vào. Type TypeScript sinh từ Rust.

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

Web build ra `apps/web/dist/`; web chạy qua Vite, server chưa phục vụ file tĩnh. Sau khi đổi protocol Rust, chạy `pnpm gen:types` và đưa `apps/web/src/generated/protocol.ts` vào cùng thay đổi. Script dùng ts-rs, sinh cả hằng version và type; chạy lại không đổi nội dung nếu Rust không đổi. `ping`/`pong` vẫn hỗ trợ, ví dụ `{"v":9,"type":"ping","nonce":42}`.

Ở phòng chờ, chủ phòng có thể dùng `change_game` với trường `game` để chọn một game đã bật. Phòng giữ mã, thành viên và token vào lại. Người muốn chơi bấm **Tham gia ván**, còn chủ phòng có thể chỉnh cài đặt của game mới trước khi bắt đầu.

## Thoại phòng

Khi bật LiveKit, người chơi, khán giả và người đã bị loại đều có thể bấm **Vào thoại**. Thoại tiếp tục qua phòng chờ, bàn chơi, kết quả và các ván tiếp theo. Mic mặc định tắt. Chọn **Bật/tắt** hoặc **Giữ để nói** bằng chuột, chạm, Enter hay Space khi nút có tiêu điểm. Có thể bật thêm phím V trong chế độ giữ. Khi trình duyệt chặn phát tiếng, bấm **Bật âm thanh thoại**. **Rời thoại** giữ nguyên phiên chơi.

### Chạy cục bộ

Khởi động LiveKit bằng `livekit-server --dev --config deploy/livekit.voice.yml`. Trên Linux có thể dùng Compose với mạng host. [Tài liệu chạy LiveKit cục bộ](https://docs.livekit.io/transport/self-hosting/local/)

```sh
docker compose -f deploy/compose.livekit.yml up
```

Trong terminal chạy game server, dùng cặp khóa dev của LiveKit.

```sh
VOICE_ENABLED=true \
LIVEKIT_PUBLIC_URL=ws://127.0.0.1:7880 \
LIVEKIT_INTERNAL_URL=http://127.0.0.1:7880 \
LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret \
LIVEKIT_ROOM_NAMESPACE=18h40-local pnpm dev:server
```

Chạy `pnpm dev:web`, mở `http://localhost:5173` trong hai phiên trình duyệt riêng, vào cùng một phòng rồi thử nói và nghe theo cả hai chiều. Chế độ giữ tắt hẳn track mic khi nhả hoặc hủy. Nếu lần đầu hộp xin quyền mở lâu hơn lượt giữ, hãy giữ lại sau khi cấp quyền.

### Cấu hình môi trường thật

- `VOICE_ENABLED` mặc định là `false`. Game và `/healthz` vẫn chạy khi cấu hình thoại thiếu hoặc sai định dạng.
- `LIVEKIT_PUBLIC_URL` là endpoint `wss://` trình duyệt truy cập qua TLS. Chỉ địa chỉ loopback được dùng `ws://`. `LIVEKIT_INTERNAL_URL` là endpoint gốc `http://` hoặc `https://` mà server game truy cập để gọi RoomService. Dùng HTTPS cho trang game khi thử trên điện thoại.
- Đưa `LIVEKIT_API_KEY` và `LIVEKIT_API_SECRET` vào môi trường server qua secret của môi trường triển khai. Ngoài loopback, secret phải dài ít nhất 32 byte. Dùng `LIVEKIT_ROOM_NAMESPACE` riêng cho mỗi môi trường (mặc định `18h40`, tối đa 24 ký tự ASCII chữ, số và dấu gạch ngang).
- Dùng một instance LiveKit riêng cho thoại game. Áp dụng `room.enabled_codecs` từ [deploy/livekit.voice.yml](deploy/livekit.voice.yml) để chỉ thương lượng `audio/opus` và `audio/red`. Nếu tạo room tường minh, giữ cùng danh sách codec cho room đó. [Cấu hình codec LiveKit v1.13.11](https://github.com/livekit/livekit/blob/v1.13.11/config-sample.yaml#L232-L249)
- Mở cổng WebRTC và cấu hình TURN theo mạng triển khai. Tránh ghi query string của signaling và header Authorization trong log proxy vì SDK dùng token để bắt tay. [Cổng và firewall LiveKit](https://docs.livekit.io/transport/self-hosting/ports-firewall/)

Server chỉ cấp JWT bắt tay 60 giây cho WebSocket đang giữ phiên thành viên. Khi rời thoại, rời phòng, mất kết nối hoặc bị thay tab, server dừng cấp token cho lượt cũ và dùng RoomService để ngắt participant. Với LiveKit tự host, token đã cấp vẫn có thể được dùng đến khi hết hạn. LiveKit cũng tự cấp token kết nối lại có thời hạn ít nhất 10 phút. Đây là giới hạn thu hồi của bản tự host với client cố tình giữ token. [Vòng đời và thu hồi token LiveKit](https://docs.livekit.io/frontends/reference/tokens-grants/#token-lifecycle)

## Triển khai

Protocol đổi version thì server và web phải deploy cùng nhau; phòng đang chạy sẽ mất khi khởi động lại.
