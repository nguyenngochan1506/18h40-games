# Game BANG! (bộ gốc)

> Trạng thái: **v1, đã chốt đủ để bắt đầu B1**. **[Chốt]** là người dùng đã quyết, **[Đề xuất]** là gợi ý cần xác nhận.
> Nền tảng và nguyên tắc chung: [../../overview.md](../../overview.md), [../../architech.md](../../architech.md), [../../technical-rule.md](../../technical-rule.md).

## 1. Phạm vi

| # | Quyết định | Trạng thái |
|---|-----------|-----------|
| 1 | Chỉ bộ gốc (80 lá, 16 nhân vật). Bản mở rộng ngoài phạm vi | **[Chốt]** |
| 2 | Số người chơi theo luật gốc: 4 đến 7 | **[Chốt]** |
| 3 | Giao diện tiếng Việt: Việt hóa thông tin hiển thị khi chơi; chữ Ý in sẵn trong ảnh lá bài giữ nguyên | **[Chốt]** |
| 4 | Dùng được trên cả máy tính và điện thoại | **[Chốt]** |
| 5 | Người bị loại xem tiếp ván như khán giả, vai của họ lộ theo luật gốc | **[Chốt]** |
| 6 | Luật theo bản chính thức của nhà phát hành | **[Chốt]** |
| 7 | Hết giờ chờ: bỏ qua phản ứng; đến lượt thì kết thúc lượt và bỏ lá cuối tay nếu thừa bài | **[Chốt]** |
| 8 | Media (hình, icon, âm thanh) lấy từ `bangweb` và `bang-cards` | **[Chốt]** |

## 2. Các file spec của game

| File | Nội dung |
|---|---|
| [rules.md](rules.md) | Luật đã đối chiếu nguồn: chia vai, lượt, khoảng cách, 22 loại lá (kèm chất và hạng), 16 nhân vật, thắng thua, và các quyết định của dự án cho chỗ luật không rõ |
| [engine.md](engine.md) | Thiết kế engine Rust: giao diện, quyền sở hữu bài, cơ chế chờ quyết định, hết giờ, view, kiểm thử |
| [assets.md](assets.md) | Media lấy từ `bangweb`/`bang-cards`: nguồn, cách quản lý file, phạm vi Việt hóa |
| `research/` (không có trong repo) | Báo cáo gốc của ba agent Codex (Ludex, `bangweb`, `be_game`), chỉ lưu trên máy tác giả |

## 3. Giao diện

- Bàn chơi và bài trên tay dùng được trên điện thoại (chạm để chọn bài, chạm để chọn mục tiêu) và máy tính.
- Animation bám theo chuỗi event từ server.
- Khán giả có màn hình riêng chỉ xem (dùng `SpectatorView`).
- Việt hóa thông tin hiển thị khi chơi (tên lá, mô tả hiệu ứng, kỹ năng nhân vật, vai, thông báo); chữ Ý trong ảnh giữ nguyên, xem [assets.md](assets.md) mục 3.
- Bảng dịch: Claude soạn bản nháp, người dùng duyệt **[Chốt]**. Cần xong trước B4.

## 4. Mốc (phụ thuộc M0, M1 của nền tảng)

- **B1** Engine lõi: chia vai, lượt chơi, BANG!/Missed!/Beer, cơ chế chờ quyết định, `Dying`, điều kiện thắng, `view` và `spectator_view`.
- **B2** Các lá bài còn lại của bộ gốc.
- **B3** 16 nhân vật, và chốt các mục "Chưa chốt" ở [rules.md](rules.md) mục 8.
- **B4** Giao diện hoàn chỉnh, animation, hiển thị lá bài (ảnh gốc cộng thông tin tiếng Việt, xem [assets.md](assets.md)).
- **B5** Tối ưu cho điện thoại.

## 5. Tiến độ

Engine bộ gốc đầy đủ (B1–B3) **xong** và đã nối vào server (`apps/server/src/games/bang.rs`), protocol và web (`apps/web/src/games/bang/`); game chơi được 4–7 người, có chế độ Gốc và 18h40 ([club-18h40.md](club-18h40.md)). Ba ca luật hoãn đã có mặc định [Đề xuất] ở [rules.md](rules.md) mục 8 và đã được cài. Các mốc B1–B5 ở trên là lịch sử; hiện trạng xem README của game.

## 6. Còn mở

Không còn mục nào chờ xác nhận. Ba ca luật hoãn đến B3 (thứ tự xử lý Bart/El Gringo/Suzy/Vulture, hết cả bộ rút lẫn chồng bỏ, thưởng khi Outlaw tự đánh Duel rồi chết) nằm ở [rules.md](rules.md) mục 8, dòng 7 đến 9.
