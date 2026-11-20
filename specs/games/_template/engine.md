# Engine <TÊN GAME>

> Mẫu spec engine. Tham khảo `specs/games/bang/engine.md`. Nguyên tắc chung: [../../technical-rule.md](../../technical-rule.md).

## 1. API (crate `crates/<id>`)
Liệt kê: `setup`, `apply`, `view`, `spectator_view`, `filter_events`, `default_action`, `decision` (xem [ADDING_A_GAME.md](../../../ADDING_A_GAME.md) bước 2).

## 2. State, Action, Event
- State đầy đủ (không `Serialize`), quyền sở hữu bài/token.
- Action người chơi gửi; ID riêng cho từng vật thể vật lý (lá bài...).
- Event và mức hiển thị: công khai / riêng một người / riêng nhóm.

## 3. Cơ chế chờ quyết định
Ai được chờ, khi nào có nhiều người cùng được chờ, hết giờ chờ (`default_action`) làm gì, người rời ván thì sao, người bị loại xem gì.

## 4. View và lọc thông tin ẩn
Mỗi loại người nhận (người chơi, khán giả, người bị loại) thấy gì; event nào bị lọc/ẩn.

## 5. Bất biến để test
Liệt kê các bất biến fuzz (ví dụ: tổng số bài không đổi, ván luôn kết thúc, cùng seed cùng kết quả) và ca biên cần test riêng.

## 6. Settings phòng
Cài đặt do chủ phòng chỉnh ở phòng chờ; điều chỉnh thế nào khi số người đổi; khi nào từ chối lúc bắt đầu.
