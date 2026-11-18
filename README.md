# 18h40 games

Nền tảng phòng chơi: server Rust/Axum, engine BANG! bộ gốc, web React/TypeScript/Tailwind và WebSocket JSON có version. Web hỗ trợ đánh bài, phản ứng, lựa chọn rút/giữ bài, hồi máu Sid và kết thúc lượt cho bộ gốc. Type TypeScript sinh từ Rust.

Cần Rust hỗ trợ edition 2024, Node.js 26 và pnpm 10.34.9.

```sh
pnpm install --frozen-lockfile
pnpm gen:types
pnpm assets # tải 44 ảnh và 12 âm tùy chọn theo commit ghim
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

`pnpm assets` tải 44 WebP bộ gốc từ commit `dc7c29abffc566629ab0fae3bb3386280a7ae52c` của bang-cards vào `assets/bang/` (gitignored). Script kiểm tra header/kích thước, bỏ qua file hợp lệ và tải lại file thiếu/hỏng. Vite dùng `assets/` làm publicDir: ảnh phục vụ tại `/bang/` khi dev và được chép vào `dist/bang/` khi build. Chạy `pnpm assets` trước build nếu muốn bản dựng có ảnh; thiếu ảnh vẫn có khung chữ. Không đưa art vào git.

Khi chạy Vite dev, mở `/?demo=bang` để thử bàn mẫu với callback giả (action hiện trên màn hình). Mở **Thử tình huống** để chọn 4–7 người (hoặc `&players=7`) và chuyển tình huống lượt chơi/đỡ đòn/Duel/Beer, General Store, Jesse/Pedro, Kit (kể cả pool ít lá), Lucky, Sid trong/ngoài cứu mạng, nhật ký mẫu và kết quả ba phe; `/?demo=bang&view=spectator` xem góc khán giả. Demo không được bật trong production build. Bàn dùng bộ WebP có sẵn trong `assets/scene/` cho cảnh quán rượu, bàn và cao bồi/hồn ma (icon nhỏ là SVG), ghế xếp elip với bạn ở dưới; vai kín vẫn úp, người bị loại thành hồn ma theo view công khai. Tay bài xòe ở đáy; nhật ký mở bằng nút góc phải trên màn hẹp. Menu **Cài đặt phòng** giữ các lệnh về/rời phòng, kết thúc ván và bỏ qua lượt chờ của chủ phòng. Điện thoại dùng ghế gọn, dải tên một dòng và chip trang bị 44px; nút kết thúc lượt có hàng riêng. Điện thoại ngang đặt tay bài/hành động bên phải; khi có khung quyết định, cuộn dọc tối đa một viewport để tới tay bài. Không cuộn ngang trang. Chạm/hover/focus một lá bài để đọc hiệu ứng. Tên lá và nhân vật giữ nguyên tiếng Anh, các mô tả theo bảng dịch đã duyệt. Bộ mặt bài CardId được kiểm thử khớp với DECK trong Rust.

Trên laptop/PC rộng từ 900px, bàn dùng một ảnh cảnh liền đúng 4/5/6/7 ghế trong stage 16:9 vừa viewport (có khoảng tối nếu khác tỷ lệ). Người và bài có tọa độ riêng theo từng ảnh; có thể bấm người đang ngồi hoặc lá nhân vật để nhắm mục tiêu. Dưới 900px giữ bố cục trước đó. Demo có tình huống **Toàn cảnh · đang bị nhắm** để xem hồn ma, quầng lượt và crosshair.

Chạm lá trên tay để chọn, chọn người nhắm tới nếu cần rồi bấm **Chơi**; **Hủy** để chọn lại. Panic!/Cat Balou cho chọn tay ngẫu nhiên hoặc lá công khai trước mặt. Khi được chờ, chọn Missed!/BANG!/Beer để phản ứng hoặc chịu đòn; khi **Kết thúc lượt**, chọn đủ bài thừa so với máu. Server quyết định tính hợp lệ (tầm đánh, giới hạn BANG!, trang bị…), lỗi được hiển thị bằng tiếng Việt. Khán giả/người bị loại chỉ xem. General Store cho chọn một lá từ pool công khai; Kit chọn giữ đúng số lá được yêu cầu từ pool riêng; Lucky chọn một lá lật kiểm tra theo hiệu ứng đang chờ. Jesse/Pedro mặc định rút từ bộ rút, có thể đổi sang tay người khác/chồng bỏ. Sid có nút **Bỏ 2 lá để hồi máu** cả khi đang chờ người khác và khi cứu mạng. Chủ phòng giữ nút **Bỏ qua lượt chờ** để xử lý người đứt kết nối/hết giờ.

Client khóa gửi khi mất kết nối, đang vào lại phòng hoặc đang chờ phản hồi; mỗi yêu cầu gửi kèm ping, chỉ pong đúng nonce trên cùng kết nối mới mở lại thao tác. Update của người khác và lỗi không giải phóng yêu cầu. Sau 15 giây chưa nhận pong, client báo lỗi và đóng kết nối để vào lại lấy snapshot, không tự gửi lại action. Client chỉ nhận update có seq kế tiếp, bỏ gói cũ/trùng; khi seq nhảy mốc, khóa thao tác, báo mất đồng bộ và đóng kết nối để tự rejoin lấy snapshot. Snapshot joined khi vào lại là nguồn đồng bộ đầy đủ; batch setup seq0 không cần cập nhật lại view đã nhận trong game_started. Nhật ký dịch event đã được server lọc cho từng người nhận; người ngoài chỉ thấy số lượng khi lá được giữ kín. Batch setup seq0 được ghi đúng một lần, update cũ/trùng không ghi lại. Chỉ giữ 300 dòng trong phiên; khi vào lại bắt đầu nhật ký mới và báo rõ lịch sử trước đó không có. Nhật ký tự theo dòng mới trừ khi đang cuộn lên đọc; trên mobile có nút mở/thu gọn. Black Jack lộ lá thứ hai bằng tên và chất/hạng.

Khi winner xuất hiện, bàn hiện phe thắng, vai và kết quả của tất cả người chơi. Chủ phòng bấm **Kết thúc ván**, những người khác chờ; server về waiting sẽ trở lại phòng chờ, liên kết **Về phòng** trong menu cuộn tới thông tin phòng. Không lưu lịch sử ở server. Event hiện không cho biết thao tác là thủ công hay mặc định do hết giờ/host_skip, cũng không có cờ thành công của lật kiểm tra; nhật ký ghi diễn biến được gửi, không đoán các nguyên nhân/kết quả đó.

Trên cảnh PC, hiệu ứng đọc batch event mới nhất từ máy chủ, tối đa 6 cue đồng thời / 2,4 giây và bỏ phần cũ khi có batch mới. Mở cài đặt bàn để tắt/bật hiệu ứng; không khí nền lấy mẫu timeline 2Hz để hạn chế CPU, tab ẩn và `prefers-reduced-motion` tắt chuyển động, không phát bù khi quay lại. Demo dev có mục **Thử hiệu ứng** trong **Thử tình huống**. 8 ảnh FX đã cung cấp là bắt buộc trong test, được tiền tải/giải mã bất đồng bộ và dùng chung cache; cowboy bổ sung và ảnh thanh Dynamite vẫn optional. Tải ảnh lỗi dùng cao bồi gốc hoặc CSS/SVG; khi thêm ảnh vào `assets/scene/`, khởi động lại Vite để cập nhật danh sách ảnh có sẵn.


## Âm thanh BANG!

Không có nhạc nền. Menu **Cài đặt phòng → Âm thanh** dùng chung mọi bố cục: Bật/Tắt và thanh âm lượng có nhãn, mặc định bật ở 60%, lưu riêng vào localStorage. Đổi âm lượng phát tiếng thử ngắn. Trình duyệt chỉ mở AudioContext sau pointer/keyboard/touch đầu tiên; không phát bù tiếng trước khi được phép. Reduced motion chỉ tắt chuyển động, không tắt âm thanh. Tab ẩn, mất đồng bộ, joined/rejoin, seq cũ và batch bị thay đều không phát lại âm thanh. Mỗi batch tối đa 8 cue, đa âm tối đa 8 tiếng, có cooldown; tải/giải mã theo nhu cầu và cache cả kết quả lỗi. Giải mã quá 250 ms bỏ tiếng hiện tại, giữ buffer cho sự kiện sau.

Mười MP3 của người dùng nằm ở `assets/sfx/` và được quản lý trong git, khác với `assets/bang/`. Đã cắt im lặng ở ngưỡng −55 dB, chuyển mono 44,1 kHz, MP3 112 kbps; shuffle cắt 1,8 giây và fade-out 0,3 giây. Card/shuffle có compressor threshold 0,015, ratio 6, attack 0,1 ms, release 30 ms để nâng phần âm nhỏ. Chuẩn hóa peak trước encoder về −6 dB để chừa headroom cho MP3, đo lại sau mã hóa và giảm thêm khi cần: mọi file giải mã có peak ≤−3 dB. Gain cuối (dB): shot -2.8, gatling -6.5, missed -6.7, explosion -5.2, card 25.8, shuffle 24.1, clink -7.5, reload -5.0, neigh -5.4, tap -5.9. Không dùng sd-card-sounds. Gain phát riêng từng cue, thời lượng, offset, fade-out và biến thiên rate ±3% nằm trong `soundCatalog.ts`.

`pnpm assets` còn tải whitelist 12 MP3 từ `bangsalvoserver/bangweb` commit `b95d4b84f8182efd852629c1518e1de3c500b164` vào `assets/bang/sounds/` (gitignored; giấy phép chưa được xác định, chỉ dùng riêng trong nhóm). Script kiểm tra header/kích thước, ghi tạm rồi rename, tái sử dụng file hợp lệ. Thiếu hoặc tải lỗi âm tùy chọn không làm hỏng game/build: dùng tổng hợp click/thud/ding; hit và Jail được tổng hợp bằng Web Audio trong `soundSynth.ts`. Có thể thay âm tổng hợp bằng cách đặt URL file thật vào `soundCatalog.ts`. Fanfare bắt đầu lấy đoạn từ giây 2 trong 2,2 giây (phần đầu file rất nhỏ); death 1,7 giây và duel 1,6 giây, tất cả có fade khi phát, không phát toàn bộ file dài. Khởi động lại Vite sau khi tải/thêm MP3 để cập nhật danh sách âm có sẵn. Vite chép âm thanh vào dist như các tài nguyên công khai khác.

Demo dev **Thử tình huống → Thử âm thanh** có từng tiếng và nút **Phát chuỗi âm thanh**; thao tác **Thử hiệu ứng** phát âm cùng lịch cue. Fixture và điều khiển thử âm thanh bị guard loại khỏi production. Chất lượng nghe và mức âm lượng cảm nhận cần người dùng nghe thử trên loa/tai nghe thực tế.
