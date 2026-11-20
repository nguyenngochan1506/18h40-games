# Nguyên tắc kỹ thuật

Các nguyên tắc giữ từ đầu (từ ý tưởng gốc). Vi phạm một điều nào thì phải nêu lý do trong spec.

1. **Server authoritative:** chỉ server giữ trạng thái thật và quyết định hành động nào hợp lệ. Client chỉ gửi ý định.
2. **Engine độc lập:** không có network, DB hay render trong logic game. Engine là hàm thuần.
3. **Game module độc lập:** game này không import logic của game khác.
4. **Chia sẻ có chọn lọc:** chỉ chia sẻ thứ thực sự dùng chung, không tạo `utils/` khổng lồ. Ranh giới nền tảng ↔ game là trait `GameModule`/`GameSession` ở `apps/server/src/games/` (xem [architech.md](architech.md) §7) và registry ở `apps/web/src/games/`; chưa tách crate `game-core`, chưa có plugin loader lúc chạy. Mỗi game có spec riêng trong `specs/games/<game>/` (mẫu: `specs/games/_template/`), và hướng dẫn thêm game ở [ADDING_A_GAME.md](../ADDING_A_GAME.md).
5. **`GameState` khác `PlayerView`:** không bao giờ gửi bài trên tay hay vai trò ẩn của người khác xuống client. Khán giả chỉ nhận thông tin công khai (`SpectatorView`). Quy tắc này áp dụng cả cho **event**, không chỉ snapshot. Ví dụ khi một người rút bài: người rút thấy lá gì, người khác chỉ thấy số lượng.
6. **Protocol có version:** mọi message có trường `v`, để cập nhật frontend và backend an toàn.
7. **Type TS sinh từ Rust:** type của protocol sinh tự động (`ts-rs` hoặc `specta`, chọn khi dựng khung), không viết tay hai bên.
8. **RNG có seed:** xáo bài nhận seed qua tham số, để tái hiện được ván chơi và test được.

## Kiểm thử

- Mỗi luật của game có test đơn vị riêng.
- Test ngẫu nhiên cho mỗi game: bot chọn hành động hợp lệ ngẫu nhiên đến hết ván, kiểm tra các bất biến (không panic, ván luôn kết thúc, cùng seed thì cùng kết quả). Bất biến cụ thể do từng game định nghĩa trong spec của game.
