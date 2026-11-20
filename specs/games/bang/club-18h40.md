# Chế độ "18h40" và tùy chỉnh phòng (feedback sau lần chơi thử đầu, 2026-11-20)

> Trạng thái: **[Chốt]** (người dùng đã trả lời). Phòng có `mode`: `classic` (luật gốc, mặc định) hoặc `club` (18h40).

## Áp dụng cho cả hai chế độ
| # | Yêu cầu | Chi tiết |
|---|---|---|
| 1 | Lá bài to hơn | Chỉ UI: tăng kích thước lá trên tay, trước mặt, panel xem |
| 4 | Panic!/Cat Balou vào **bài trên tay**: người đánh tự chọn | Hiện N ô úp (N = số lá trên tay mục tiêu), người đánh chọn 1 ô. Chọn mù: server không gửi mặt lá trước khi chọn (giống General Store). Lá trước mặt vẫn chọn theo mặt như cũ. Thay cho "ngẫu nhiên" |
| 5 | Bỏ tự động `draw!` của Barrel, Dynamite, Jail | Người chơi **tự bấm lật** mỗi lần `draw!` (Barrel khi bị bắn, Dynamite và Jail đầu lượt, Lucky Duke đã hỏi chọn). Hết giờ thì áp dụng hành động mặc định (lật hộ) như timer hiện có |
| 7 | Tùy chỉnh số vai khi tạo phòng | Chủ phòng chỉnh số Phó cảnh sát, Tội phạm, Kẻ phản bội. Sheriff luôn 1. Tổng = số người chơi. Mặc định theo bảng gốc theo số người. Ràng buộc tối thiểu: có ít nhất 1 người ngoài Sheriff; không cho cấu hình ván không thể kết thúc hợp lệ (ví dụ 0 Tội phạm và 0 Kẻ phản bội mà vẫn có Phó). Số người đổi sau khi chỉnh thì cấu hình reset về mặc định |

## Chỉ chế độ 18h40 (`club`)
| # | Yêu cầu | Chi tiết |
|---|---|---|
| 2 | **Dynamite đi đúng 1 vòng** | Người đánh Dynamite đặt trước mặt mình. Vòng đó chưa tính. Từ đầu lượt kế tiếp của chủ, mỗi người sống kiểm tra đúng 1 lần theo thứ tự lượt, bắt đầu từ chủ: nổ thì mất 3 máu, không nổ thì chuyền tiếp. Khi vòng quay lại chủ (mọi người sống đã kiểm tra) mà chưa nổ thì bỏ Dynamite, không đi vòng nữa |
| 3 | **Jail: tối đa 3 lượt** | Đầu lượt người bị Jail `draw!`: ♥ thì thoát (bỏ Jail, chơi bình thường). Không thì mất lượt đó và Jail ở lại. Sau khi mất đủ 3 lượt thì Jail tự bỏ (lượt thứ 4 chơi bình thường). Vẫn bị bắn và phản ứng ngoài lượt |
| 6 | **Nhiều súng cùng lúc** | Được đặt nhiều lá vũ khí trước mặt (đánh súng mới không bỏ súng cũ). Tầm bắn = **tầm lớn nhất** trong các súng (kèm Colt .45 mặc định). Volcanic + Winchester: bắn BANG! không giới hạn số lá với tầm 5 |

## Luật gốc đã kiểm tra
Rulebook gốc: chỉ 1 vũ khí (đánh vũ khí mới thì bỏ vũ khí cũ) -> nên mục 6 vào chế độ 18h40 (đúng như yêu cầu).

## Ghi chú thiết kế
- Mode và số vai là cài đặt phòng, chỉ chủ phòng sửa được ở phòng chờ; hiện cho mọi người thấy. Ván mới sau "Về phòng" giữ cài đặt.
- Protocol: thêm `mode` và `roles` vào cài đặt phòng; đổi action/event cho `draw!` thủ công và chọn ô trên tay -> tăng `PROTOCOL_VERSION` lên 3.
- Không để lộ thông tin ẩn: chọn mù trên tay dùng ô mờ (opaque slot), mặt lá chỉ gửi riêng cho người nhận.
