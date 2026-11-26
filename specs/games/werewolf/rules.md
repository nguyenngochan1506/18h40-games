# Luật Ma Sói (Ultimate Werewolf: Deluxe Edition)

> Tham khảo: **Ultimate Werewolf: Deluxe Edition** (Bézier Games / Ted Alspach).
> Trạng thái: **[Chốt]** đã chốt cho bản cài đặt v1.

## Nguồn và mức tin cậy
- Luật gốc: *Ultimate Werewolf: Deluxe Edition* (Bézier Games) — bộ 16 vai tiêu biểu (kèm điểm cân bằng Balance Value chính thức).
- Trong nền tảng này không có quản trò (Moderator) là người thật; server đóng vai trò quản trò tự động điều phối thứ tự gọi đêm, ghi nhận bỏ phiếu ban ngày và kiểm tra điều kiện thắng.
- Thảo luận ban ngày diễn ra qua voice/kênh ngoài (theo kiến trúc chung của nền tảng).

## 1. Phạm vi

| # | Quyết định | Trạng thái |
|---|---|---|
| 1 | Số người chơi: **5–16 người** | **[Chốt]** |
| 2 | Bộ vai: **16 vai** của *Ultimate Werewolf: Deluxe Edition* (Dân Làng, Ma Sói, Sói Trùm, Tay Sai, Pháp Sư Hắc Ám, Tiên Tri, Bảo Vệ, Phù Thủy, Thợ Săn, Thần Tình Yêu, Người Hóa Sói, Kẻ Bị Nguyền, Người Bệnh, Hoàng Tử, Thị Trưởng, Kẻ Chán Đời) | **[Chốt]** |
| 3 | Giao diện hiển thị tiếng Việt, giữ tên gốc tiếng Anh làm phụ đề trên lá bài nếu cần | **[Chốt]** |
| 4 | Tùy chọn phòng: tùy chỉnh số lượng từng vai (có bộ chuẩn mặc định theo số người chơi) và bật/tắt lộ vai khi chết (mặc định: bật) | **[Chốt]** |

## 2. Danh sách 16 vai và điểm cân bằng

| Vai | Tiếng Anh | Phe | Điểm cân bằng | Kỹ năng |
|---|---|---|---:|---|
| Dân Làng | Villager | Dân Làng | +1 | Không có kỹ năng đêm; tham gia thảo luận và bỏ phiếu ban ngày. |
| Ma Sói | Werewolf | Ma Sói | -6 | Mỗi đêm cùng bầy Sói chọn 1 người ngoài bầy để cắn. |
| Sói Trùm | Alpha Wolf | Ma Sói | -9 | Đi cắn cùng bầy Sói. Một lần cả ván có thể biến nạn nhân đêm đó thành Ma Sói thay vì giết. |
| Tay Sai | Minion | Ma Sói | -6 | Biết ai là Ma Sói (Sói không biết Tay Sai). Không đi cắn đêm. Tiên Tri soi ra không phải Sói. |
| Pháp Sư Hắc Ám | Sorcerer | Ma Sói | -3 | Mỗi đêm soi 1 người để tìm Tiên Tri. Không đi cắn đêm. Tiên Tri soi ra không phải Sói. |
| Tiên Tri | Seer | Dân Làng | +7 | Mỗi đêm soi 1 người để biết người đó có thuộc bầy Sói hay không (Người Hóa Sói bị soi nhầm là Sói). |
| Bảo Vệ | Bodyguard | Dân Làng | +3 | Mỗi đêm bảo vệ 1 người khỏi nanh Sói. Không được bảo vệ cùng 1 người 2 đêm liên tiếp. |
| Phù Thủy | Witch | Dân Làng | +4 | Có 1 bình Cứu (biết nạn nhân bị Sói cắn đêm đó và có thể cứu) và 1 bình Độc (giết 1 người bất kỳ). Mỗi bình dùng tối đa 1 lần cả ván. |
| Thợ Săn | Hunter | Dân Làng | +3 | Khi bị loại (bất kỳ nguyên nhân nào), được chọn kéo theo 1 người còn sống chết cùng. |
| Thần Tình Yêu | Cupid | Dân Làng | -3 | Đêm đầu tiên ghép đôi 2 người thành Tình Nhân. Hai người biết nhau; một người chết thì người kia chết theo. Nếu 1 Sói + 1 Dân yêu nhau, cả hai lập phe thứ ba. |
| Người Hóa Sói | Lycan | Dân Làng | -1 | Phe Dân Làng, nhưng bị Tiên Tri soi nhầm là Ma Sói. |
| Kẻ Bị Nguyền | Cursed | Dân Làng | -3 | Ban đầu thuộc phe Dân Làng; nếu bị Ma Sói cắn (không được cứu) thì không chết mà gia nhập bầy Sói từ đêm sau. |
| Người Bệnh | Diseased | Dân Làng | +3 | Nếu bị Ma Sói cắn chết, bầy Sói bị nhiễm bệnh và mất lượt cắn vào đêm kế tiếp. |
| Hoàng Tử | Prince | Dân Làng | +3 | Nếu bị làng treo cổ ban ngày, lật bài miễn chết (1 lần duy nhất) và ngày kết thúc ngay lập tức. |
| Thị Trưởng | Mayor | Dân Làng | +2 | Phiếu treo cổ ban ngày của Thị Trưởng được tính là 2 phiếu. |
| Kẻ Chán Đời | Tanner | Độc lập | -2 | Thắng ngay lập tức (thắng một mình) nếu bị làng bỏ phiếu treo cổ ban ngày. |

## 3. Chuẩn bị ván
- Xáo bộ vai theo cài đặt phòng bằng RNG có seed và chia ngẫu nhiên cho từng ghế.
- Ván bắt đầu từ **Đêm 1**.

## 4. Pha chơi

### Pha Đêm (`Night`)
Server lần lượt gọi các bước đêm theo thứ tự chuẩn (tự động bỏ qua vai không còn sống hoặc không áp dụng):
1. **Thần Tình Yêu (`Cupid`)** — chỉ đêm 1: chọn 2 người khác nhau làm Tình Nhân.
2. **Bảo Vệ (`Bodyguard`)** — mỗi đêm: chọn 1 người để bảo vệ (khác người đã bảo vệ đêm trước).
3. **Bầy Sói (`Werewolves`)** — mỗi đêm (bỏ qua nếu bầy Sói đang nhiễm bệnh từ Người Bệnh): tất cả thành viên bầy Sói còn sống cùng bỏ phiếu chọn 1 nạn nhân ngoài bầy. Sói Trùm có thể chọn biến đổi thay vì giết (1 lần cả ván). Khi mọi Sói đã chọn, mục tiêu nhiều phiếu nhất được chọn (hòa phiếu chọn ngẫu nhiên theo RNG).
4. **Tiên Tri (`Seer`)** — mỗi đêm: soi 1 người khác còn sống, nhận kết quả Sói / Không phải Sói.
5. **Pháp Sư Hắc Ám (`Sorcerer`)** — mỗi đêm: soi 1 người khác còn sống, nhận kết quả Tiên Tri / Không phải Tiên Tri.
6. **Phù Thủy (`Witch`)** — mỗi đêm (khi còn ít nhất 1 bình): biết nạn nhân bị Sói cắn đêm đó (nếu chưa bị Bảo Vệ chặn) và quyết định dùng bình Cứu và/hoặc bình Độc, hoặc bỏ qua.

**Tổng kết đêm:**
- Nếu nạn nhân bị Sói cắn không được Bảo Vệ che chắn và không được Phù Thủy cứu:
  - Nếu là `Cursed` (chưa biến hình) hoặc Sói Trùm dùng quyền biến đổi: nạn nhân chuyển sang bầy Sói, không chết.
  - Ngược lại: nạn nhân chết. Nếu là `Diseased`, bầy Sói bị nhiễm bệnh vào đêm sau.
- Nếu Phù Thủy dùng bình Độc lên người còn sống: người đó chết.
- Nếu một Tình Nhân chết, người còn lại chết theo vì đau tim.
- Nếu Thợ Săn chết, chuyển sang pha **Phát bắn Thợ Săn (`HunterShot`)** trước khi sang ngày.
- Kiểm tra điều kiện thắng; nếu chưa kết thúc, sang **Ban Ngày (`DayVote`)**.

### Pha Ban Ngày (`DayVote`)
- Công bố kết quả đêm qua.
- Tất cả người chơi còn sống thảo luận (ngoài ứng dụng) và bỏ phiếu chọn 1 người để treo cổ hoặc chọn **Bỏ phiếu trắng** (`None`).
- Phiếu của Thị Trưởng tính là 2.
- Khi mọi người còn sống đã bỏ phiếu:
  - Nếu có duy nhất 1 người nhiều phiếu nhất:
    - Nếu là `Prince` chưa lộ bài: Hoàng Tử lật bài miễn chết, ngày kết thúc ngay.
    - Nếu là `Tanner`: Kẻ Chán Đời thắng ngay lập tức.
    - Ngược lại: người đó bị treo cổ; xử lý Tình Nhân chết theo và Phát bắn Thợ Săn nếu có.
  - Nếu hòa phiếu cao nhất hoặc mọi người đều bỏ phiếu trắng: không ai bị treo cổ.
- Kiểm tra điều kiện thắng; nếu chưa kết thúc, chuyển sang **Đêm tiếp theo**.

## 5. Thắng/thua và kết thúc ván
Kiểm tra theo thứ tự ưu tiên:
1. **Kẻ Chán Đời (`Tanner`)**: thắng một mình ngay khi bị làng treo cổ ban ngày.
2. **Tình Nhân (`Lovers`)**: thắng nếu 2 Tình Nhân thuộc hai phe khác nhau (1 thuộc bầy Sói, 1 ngoài bầy Sói) và là 2 người sống sót cuối cùng.
3. **Dân Làng (`Village`)**: thắng khi không còn thành viên nào của bầy Sói còn sống (và còn ít nhất 1 người sống).
4. **Ma Sói (`Werewolves`)**: thắng khi số thành viên bầy Sói còn sống ≥ số người ngoài bầy Sói còn sống (và còn ít nhất 1 Sói sống).
5. **Hòa (`Draw`)**: tất cả người chơi cùng chết.

## 6. Quyết định riêng của dự án
1. **Không cần quản trò người thật**: server tự động chuyển bước đêm và bỏ qua vai đã chết để nhịp chơi mượt.
2. **Người bị loại nhận góc nhìn khán giả**: tránh người chết thấy vai ẩn của người còn sống rồi lộ qua voice. Khi ván kết thúc (`winner.is_some()`), mọi vai trò đều được lật công khai.
3. **Mỗi vai đặc biệt tối đa 1 lá**: giống bộ bài vật lý *Ultimate Werewolf: Deluxe Edition* (nhiều Dân Làng và Ma Sói, mỗi vai đặc biệt 1 lá), giữ luật rõ ràng và dễ kiểm soát.
