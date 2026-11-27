# Mèo Nổ — luật đã chốt (Base + 3 bản mở rộng)

Tài liệu này là nguồn luật của game `cats` trong `18h40-games`. Mọi thay đổi hành vi phải cập nhật file này trước.

## 1. Người chơi & cài đặt mở rộng

- Số người: **2–8**.
- Người bị loại không còn lượt, không nhận action, chỉ xem `SpectatorView`.
- Ván kết thúc khi còn đúng **1** người chưa bị loại.
- Chủ phòng có thể bật/tắt 3 bản mở rộng trong `Settings` (mặc định bật cả 3):
  - `imploding`: **Imploding Kittens** (`Imploding`, `Reverse`, `DrawBottom`, `FeralCat`, `AlterFuture`, `TargetedAttack`).
  - `streaking`: **Streaking Kittens** (`Streaking`, `SuperSkip`, `SeeFuture5`, `SwapTopBottom`, `GarbageCollection`, `CatomicBomb`).
  - `barking`: **Barking Kittens** (`AlterFuture5`, `PersonalAttack`, `ShareFuture`, `Bury`, `Potluck`).

## 2. Bộ bài

- **Bản gốc (46 lá an toàn + Defuse + Exploding)**:
  - 5 loại Mèo thường (`CatTaco`, `CatRainbow`, `CatBeard`, `CatPotato`, `CatCattermelon`) × 4 lá.
  - `SeeFuture` × 5, `Nope` × 5, `Attack` × 4, `Skip` × 4, `Shuffle` × 4, `Favour` × 4.
- **Imploding Kittens**: +1 `Imploding` (úp ban đầu), `Reverse` × 4, `DrawBottom` × 4, `FeralCat` × 4, `AlterFuture` × 4, `TargetedAttack` × 3.
- **Streaking Kittens**: `Streaking` × 1, `SuperSkip` × 1, `SeeFuture5` × 1, `SwapTopBottom` × 1, `GarbageCollection` × 1, `CatomicBomb` × 1. Khi bật `streaking`, số `Exploding` trong bộ rút là `player_count` (thay vì `player_count - 1`) để ván không hòa khi một người giữ `Exploding` trên tay.
- **Barking Kittens**: `AlterFuture5` × 2, `PersonalAttack` × 4, `ShareFuture` × 2, `Bury` × 2, `Potluck` × 2.
- Mỗi người luôn được chia **1 Defuse + 7 lá an toàn**. Tổng `Defuse` là `max(7, player_count)`; nếu 6–8 người chơi không bật mở rộng mà thiếu lá an toàn thì bổ sung theo vòng lặp để bộ rút còn ít nhất `player_count` lá an toàn.
- Mọi `CardId` live nằm ở đúng một vùng: `deck | discard | hand[player] | pending | removed`.

## 3. Lượt, chiều chơi & các lá đặc biệt

- `TurnState` lưu `player`, `turns_left` và `direction` (`+1` xuôi chiều, `-1` ngược chiều).
- **Attack**: kết thúc lượt không rút; người kế tiếp theo chiều hiện tại nhận `(turns_left - 1) + 2` lượt.
- **Targeted Attack**: chọn 1 người còn sống khác nhận `(turns_left - 1) + 2` lượt; vòng chơi tiếp tục từ họ.
- **Personal Attack**: tự nhận thêm 2 lượt (`turns_left + 2`, tổng 3 lượt nếu đang có 1 lượt).
- **Skip**: trừ 1 lượt không rút. **Super Skip**: kết thúc toàn bộ `turns_left` không rút.
- **Reverse**: đảo chiều `direction` và kết thúc 1 lượt không rút.
- **Draw from the Bottom**: rút lá dưới cùng của bộ rút thay vì lá trên cùng để kết thúc lượt.
- **Swap Top & Bottom**: hoán đổi lá đỉnh và lá đáy bộ rút (không xem).
- **See the Future (3x / 5x)**: xem kín tối đa 3 hoặc 5 lá trên cùng.
- **Alter the Future (3x / 5x)**: xem kín và sắp xếp lại thứ tự 3 hoặc 5 lá trên cùng.
- **Share the Future (3x)**: xem, sắp xếp lại 3 lá trên cùng rồi cho người kế tiếp xem thứ tự mới.
- **Bury**: rút lá đỉnh xem kín rồi chèn lại vào bất kỳ vị trí nào `[0, deck_count]` của bộ rút (nếu rút phải `Imploding` đang ngửa vẫn bị loại ngay).
- **Garbage Collection**: lần lượt từng người còn sống (bắt đầu từ người đánh) chọn 1 lá trên tay bỏ vào bộ rút, sau đó xáo bộ rút.
- **Potluck**: lần lượt từng người còn sống (bắt đầu từ người đánh) đặt 1 lá trên tay lên đỉnh bộ rút.
- **Catomic Bomb**: rút toàn bộ `Exploding` khỏi bộ rút, xáo phần còn lại, đặt tất cả `Exploding` **ngửa** lên đỉnh bộ rút và kết thúc lượt không rút.
- **Imploding Kitten**:
  - Lần đầu rút (úp): không nổ, lật ngửa và chèn vào vị trí bất kỳ `[0, deck_count]` của bộ rút (không thể Nope).
  - Lần sau rút (ngửa): **loại ngay lập tức**, không thể `Defuse`, không được `Streaking` bảo vệ, không thể Nope.
- **Streaking Kitten**: lá thụ động; khi cầm trên tay cho phép giữ kín tối đa **1 lá `Exploding`** trên tay mà không nổ. Nếu mất `Streaking` hoặc cầm từ 2 `Exploding` trở lên (hoặc nhận `Exploding` mà không có `Streaking`), `Exploding` không được bảo vệ lập tức kích hoạt `Defuse` hoặc loại người đó.

## 4. Combo & Feral Cat

- `FeralCat` là lá mèo hoang đa năng, thay thế được cho bất kỳ loại mèo thường nào:
  - **Bộ 2**: 2 lá mèo cùng loại (hoặc có `FeralCat`) → cướp ngẫu nhiên 1 lá từ người chơi khác.
  - **Bộ 3**: 3 lá mèo cùng loại (hoặc có `FeralCat`) → gọi tên 1 `CardKind` từ người chơi khác.
  - **Bộ 5**: 5 lá mèo khác loại (mỗi `FeralCat` thay cho 1 loại còn thiếu) → chọn 1 lá bất kỳ từ chồng bỏ.

## 5. Nope

- Bất kỳ người còn sống nào có lá `Nope` đều có thể phản ứng với `last_action` khi cửa sổ Nope đang mở.
- Theo luật chính thống: lá hành động bị Nope và mọi lá `Nope` đã đánh **đều nằm lại chồng bỏ** (không trả về tay).
- Chuỗi Nope chẵn/lẻ đảo hoặc khôi phục hiệu ứng của hành động gốc thông qua cặp snapshot `undo_state`.
- Cửa sổ Nope tự đóng khi hành động hoàn tất bước chuyển bài hoặc khi có rút bài / Defuse / Imploding.
- Không bao giờ Nope `Exploding`, `Defuse`, `Imploding`, `Draw`, `DrawBottom`, `Bury`.
