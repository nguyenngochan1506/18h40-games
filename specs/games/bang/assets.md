# Tài nguyên BANG! (hình, âm thanh)

> Chi tiết và đường dẫn từng file nằm trong báo cáo nghiên cứu gốc (chỉ lưu trên máy tác giả, không có trong repo). Claude đã tự kiểm tra hai điểm: không có LICENSE trong cả ba repo (`bangweb`, `bang-cards`, `bang-server`), và câu disclaimer về quyền thuộc dV Giochi có thật trong README của `bang-server`.

## 1. Quyết định

| # | Quyết định | Trạng thái |
|---|-----------|-----------|
| 1 | Lấy media (hình lá bài, nhân vật, vai, mặt sau, icon, âm thanh) từ `bangweb` và `bang-cards` | **[Chốt]** |
| 2 | **Giữ nguyên chữ tiếng Ý in sẵn trong ảnh lá bài.** Chỉ Việt hóa thông tin hiển thị khi chơi (xem mục 3) | **[Chốt]** |

Hệ quả cần nhớ: các repo này **không có giấy phép**, và art thuộc dV Giochi (theo disclaimer của `bang-server`). **[Chốt 2026-11-20]** Người dùng quyết đưa art (`assets/bang/`) vào git dù repo đang công khai và chấp nhận rủi ro khiếu nại bản quyền; không cần duyệt lại. Nếu bị khiếu nại hoặc muốn phân phối rộng thì phải thay art, âm thanh và xin phép.

## 2. Có gì và lấy thế nào

| Loại | Nguồn | Ghi chú |
|---|---|---|
| Hình lá bài, nhân vật, vai, mặt sau | `bang-cards` (submodule của `bangweb`), WebP 250×389 | Bộ gốc cần **44 file, khoảng 1,4 MB**: 22 mặt bài, 16 nhân vật, 4 vai, 2 mặt sau. Danh sách tên file nằm trong `apps/web/src/games/bang/scene/assetMap.ts`; báo cáo nghiên cứu gốc chỉ lưu trên máy tác giả |
| Icon | `bangweb/public/media/` | Chỉ lấy các icon dùng cho bộ gốc (máu, vai, lượt, mục tiêu, đã chết, thắng, khán giả, mất kết nối...). Bỏ sprite của bản mở rộng |
| Âm thanh | `bangweb/public/sounds/` | 12 âm thanh của bộ gốc: `gamestart`, `victory`, `draw`, `death`, `bang`, `gatling`, `indians`, `duel`, `dynamite`, `generalstore`, `shuffle`, `invalid`. Bỏ `bandidos`, `snake`, `train` |
| Hạng và chất | `bang-cards/misc/` hoặc tự dựng bằng text/SVG | |
| Danh mục bộ gốc (tên, ID, số bản, chất, hạng, tên file ảnh) | `bang-server/src/config/sets/base.yml` | Dùng để đối chiếu, tự viết lại; **không chép** vì không có giấy phép |

**[Chốt]** Cách quản lý file:
- Art nằm trong git tại `assets/bang/` (nguồn gốc: `bang-cards@dc7c29a`); không còn script tải (`pnpm assets` đã bỏ). Muốn đổi art thì thay file trực tiếp.
- Một bảng ánh xạ `loại bài → file ảnh` do dự án tự giữ (ví dụ `BANG → main_deck/01_bang.webp`, `SCOPE → main_deck/01_mirino.webp`). Đổi art sau này chỉ cần sửa bảng này, không đụng luật.
- Chỉ liệt kê file đã duyệt (whitelist), không gom cả `main_deck/` hay `character/`.
- Bản mở rộng Dodge City: 49 file (`main_deck/03_*.webp` 34 mặt lá, `character/03_*.webp` 15 nhân vật, khoảng 1,7 MB) lấy từ `bang-cards@dc7c29a` ngày 2026-11-27; người dùng đã duyệt đưa art bản mở rộng vào git, cùng rủi ro bản quyền như bộ gốc. Lá Dodge City (id từ 80) dùng ảnh `03_*` kể cả lá trùng loại bộ gốc (BANG!, Beer...); chữ tiếng Ý trên ảnh giữ nguyên.

**Ngoại lệ:** font. Hai file TTF trong `bangweb` (American Typewriter, Palatino Linotype) có hạn chế phân phối ghi ngay trong metadata, và có thể thiếu dấu tiếng Việt. Dùng font hệ thống hoặc font có giấy phép nhúng được và đủ dấu tiếng Việt.

## 3. Việt hóa: cái gì đổi, cái gì giữ

- **Giữ nguyên:** chữ tiếng Ý in sẵn trong ảnh (tên lá, tên nhân vật trên ảnh).
- **Việt hóa:** mọi thông tin hiển thị khi chơi: tên lá và mô tả hiệu ứng (panel xem chi tiết, tooltip), kỹ năng nhân vật, tên vai, thông báo và nhật ký ván, lời nhắc chờ quyết định, nút bấm.
- Nghĩa là một lá vẫn mang ảnh có chữ Ý, còn người chơi đọc tên và hiệu ứng bằng tiếng Việt ở panel đi kèm. Tên Việt của mỗi lá cần đủ gần với tên Ý/Anh trên ảnh để người chơi nhận ra.
- Theo báo cáo, vùng mô tả trên ảnh thường để trống để frontend chồng chữ lên. **Chưa kiểm tra bằng mắt**: khi dựng giao diện (B4) cần xem từng ảnh để biết có chồng chữ Việt lên mặt lá được không, hay chỉ dùng panel đi kèm.
- Bảng dịch: Claude soạn bản nháp, bạn duyệt (xem [overview.md](overview.md)).

## 4. Mobile

`bangweb` không tối ưu cho điện thoại: ảnh bài khoảng 32×50 px, tính năng xem trước ảnh lớn bị tắt trên mobile. Ảnh gốc 250×389 cũng có thể mờ khi phóng lớn. Thiết kế của dự án phải tự lo: chạm chọn bài rồi chạm mục tiêu, panel xem mô tả lớn riêng (vừa là chỗ hiện tiếng Việt), nút hủy rõ, vùng chạm đủ rộng.
