# Tổng quan: nền tảng board game cho nhóm bạn

> Trạng thái: **bản nháp v0**. **[Chốt]** là người dùng đã quyết, **[Đề xuất]** là gợi ý cần xác nhận.
> Ý tưởng gốc: `~/Documents/daily-note/gameboard.md`.
>
> **Các file ở gốc `specs/` chỉ nói về nền tảng chung.** Luật, bài, giao diện bàn chơi, mốc và câu hỏi của từng game nằm trong `specs/games/<game>/`.
> Xem thêm: [architech.md](architech.md) (kiến trúc), [technical-rule.md](technical-rule.md) (nguyên tắc kỹ thuật).

## 1. Mục tiêu

Một web app để nhóm bạn vào cùng một phòng và chơi board game trên máy tính hoặc điện thoại, giao diện tiếng Việt. Nền tảng lo phòng, kết nối và phiên; mỗi game là một module độc lập cắm vào.

## 2. Danh sách game

| Game | Trạng thái | Spec |
|------|-----------|------|
| BANG! | Có thể chơi (4–7 người) | [games/bang/overview.md](games/bang/overview.md) |
| UNO | Khung đã dựng (`enabled=false`), chưa có luật | [games/_template/](games/_template/) |
| Ma Sói | Khung đã dựng (`enabled=false`), chưa có luật | [games/_template/](games/_template/) |

BANG! làm trước và đã chơi được. Nền tảng đã module hóa theo game; UNO và Ma Sói có khung sẵn để giao cho thành viên cài đặt (xem [../ADDING_A_GAME.md](../ADDING_A_GAME.md)).

**[Chốt] Màn chọn game:** sảnh hiển thị game khả dụng (BANG!) và game "Sắp có" (UNO, Ma Sói, không chọn được). Người tạo phòng nhập nickname, chọn game rồi tạo phòng; vào bằng mã nhận game từ phòng, không chọn lại. `create_room{nickname, game}` với `GameKind` là enum hữu hạn (`bang`, `uno`, `werewolf`); game chưa bật bị từ chối bằng `game_unavailable`. `RoomView.game` giữ game của phòng.

## 3. Ngoài phạm vi (nền tảng v1)

- Tài khoản, đăng nhập, DB, lịch sử ván, bảng xếp hạng.
- Bot/AI làm người chơi.
- Chat, voice (nhóm tự dùng kênh khác).
- Nhiều server, đa ngôn ngữ (i18n).

## 4. Quyết định của nền tảng

| # | Quyết định | Trạng thái |
|---|-----------|-----------|
| 1 | Định danh bằng nickname và mã phòng, không tài khoản | **[Chốt]** |
| 2 | Chạy một server duy nhất, triển khai trên một VPS | **[Chốt]** |
| 3 | Giao diện tiếng Việt | **[Chốt]** |
| 4 | Hỗ trợ cả máy tính và điện thoại | **[Chốt]** |
| 5 | Lưu trữ hoàn toàn trong bộ nhớ, không DB | **[Chốt]** |
| 6 | Cho vào lại ván khi mất kết nối (token) | **[Chốt]** |
| 7 | Có chế độ khán giả: người vào phòng khi ván đang chơi trở thành khán giả | **[Chốt]** |
| 8 | Mất kết nối: chờ 60 giây rồi áp dụng hành động mặc định do game định nghĩa; chủ phòng có nút bỏ qua thủ công | **[Chốt]** |
| 9 | Không cho chủ phòng thay ghế người offline ở v1 | **[Chốt]** |
| 10 | Dọn phòng trống sau 10 phút | **[Chốt]** |
| 11 | Khi có người thắng, server gửi `game_over` và **giữ ván** (phase vẫn `playing`) để mọi người xem kết quả và vào lại; chủ phòng bấm Kết thúc ván (`end_game`) thì phòng về trạng thái chờ và mọi người thành khán giả. Khán giả và người chơi đều bấm "tham gia" cho ván kế đến khi đủ số người tối đa. Phòng đã đủ người thì người vào sau là khán giả, ngồi vào được khi có ghế trống | **[Chốt]** |

Công nghệ: engine Rust thuần, backend axum + tokio, frontend React + TypeScript + Tailwind + motion, giao tiếp qua WebSocket.

## 5. Mốc của nền tảng

- **M0** Khung: workspace, server WebSocket đơn giản, web kết nối được, sinh type TS. **Xong**.
- **M1** (phòng) **xong**: tạo, vào, rời, bắt đầu, vào lại bằng token, kiểm tra Origin, giới hạn kích thước message.
- **M2** Module hóa đa game **xong**: protocol v7 (enum tag `game`), `GameModule`/`GameSession` ở server, `games/<id>/` + registry lazy ở web, khung UNO và Ma Sói. Kế hoạch: [multi-game-plan.md](multi-game-plan.md).

Mốc của từng game nằm trong spec của game đó và phụ thuộc vào M0, M1.

## 6. Câu hỏi còn mở (nền tảng)

Chưa có.
