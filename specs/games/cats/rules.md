# Mèo Nổ — luật đã chốt (Base + đủ 3 bản mở rộng)

Tài liệu này là nguồn luật của game `cats` trong `18h40-games`. Mọi thay đổi hành vi phải cập nhật file này trước.

## 1. Người chơi & cài đặt mở rộng

- Số người: **2–8**.
- Người bị loại không còn lượt, không nhận action, chỉ xem `SpectatorView`.
- Ván kết thúc khi còn đúng **1** người chưa bị loại.
- Chủ phòng có thể bật/tắt 3 bản mở rộng trong `Settings` (mặc định bật cả 3):
  - `imploding`: **Imploding Kittens (20 lá)** (`Imploding`, `Reverse`, `DrawBottom`, `FeralCat`, `AlterFuture`, `TargetedAttack`).
  - `streaking`: **Streaking Kittens (15 lá)** (`Streaking`, +1 `Exploding`, `Mark`, `CurseCatButt`, `SwapTopBottom`, `SeeFuture5`, `AlterFuture5`, `CatomicBomb`, `SuperSkip`, `GarbageCollection`).
  - `barking`: **Barking Kittens (20 lá)** (`BarkingKitten`, `IllTakeThat`, `TowerOfPower`, `AlterFutureNow`, `PersonalAttack`, `Bury`, `ShareFuture`, `Potluck`, `SuperSkip`).

## 2. Bộ bài (36 loại lá)

- **Bản gốc (46 lá an toàn + Defuse + Exploding)**:
  - 5 loại Mèo thường (`CatTaco`, `CatRainbow`, `CatBeard`, `CatPotato`, `CatCattermelon`) × 4 lá.
  - `SeeFuture` × 5, `Nope` × 5, `Attack` × 4, `Skip` × 4, `Shuffle` × 4, `Favour` × 4.
- **Imploding Kittens (20 lá)**: `Imploding` × 1 (úp ban đầu), `Reverse` × 4, `DrawBottom` × 4, `FeralCat` × 4, `AlterFuture` × 4, `TargetedAttack` × 3.
- **Streaking Kittens (15 lá)**: `Streaking` × 1, +1 `Exploding` (tổng `Exploding` = `player_count`), `Mark` × 3, `CurseCatButt` × 2, `SwapTopBottom` × 3, `SeeFuture5` × 1, `AlterFuture5` × 1, `CatomicBomb` × 1, `SuperSkip` × 1, `GarbageCollection` × 1.
- **Barking Kittens (20 lá)**: `BarkingKitten` × 2, `IllTakeThat` × 4, `TowerOfPower` × 1, `AlterFutureNow` × 2, `PersonalAttack` × 4, `Bury` × 2, `ShareFuture` × 2, `Potluck` × 2, `SuperSkip` × 1. Khi bật `barking`, trích sẵn **6 lá Stash** úp trên bàn cho Tháp Quyền Lực.
- Mỗi người luôn được chia **1 Defuse + 7 lá an toàn**. Tổng `Defuse` là `max(7, player_count)`; nếu thiếu lá an toàn cho số người chơi + Stash thì tự bổ sung theo vòng lặp chuẩn.
- Mọi `CardId` live nằm ở đúng một vùng: `deck | discard | tower_stash | hand[player] | barking_front[player] | ill_take_that[player] | pending | removed`.

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
- **Alter the Future (3x) NOW**: giống Đổi Tương Lai 3x nhưng được phép đánh **bất cứ lúc nào** khi đang ở pha lượt (kể cả ngoài lượt của mình); có thể bị Nope.
- **Share the Future (3x)**: xem, sắp xếp lại 3 lá trên cùng rồi cho người kế tiếp xem thứ tự mới.
- **Bury**: rút lá đỉnh xem kín rồi chèn kín lại vào bất kỳ vị trí nào `[0, deck_count]` của bộ rút mà không công khai vị trí cho cả bàn (giữ nguyên trạng thái úp/ngửa của `Imploding`, không lật và không kích nổ `Imploding`; nếu rút phải `Exploding` mà không có `Streaking` bảo vệ thì vẫn phải `Defuse` hoặc nổ).
- **Garbage Collection**: lần lượt từng người còn sống (bắt đầu từ người đánh) chọn 1 lá trên tay bỏ vào bộ rút, sau đó xáo bộ rút.
- **Potluck**: lần lượt từng người còn sống (bắt đầu từ người đánh) đặt 1 lá trên tay lên đỉnh bộ rút.
- **Catomic Bomb**: rút toàn bộ `Exploding` khỏi bộ rút, xáo phần còn lại, đặt tất cả `Exploding` **ngửa** lên đỉnh bộ rút và kết thúc lượt không rút.
- **Mark (Đánh Dấu)**: chọn 1 đối thủ; lật ngửa ngẫu nhiên 1 lá chưa đánh dấu trên tay họ cho tất cả mọi người cùng thấy cho đến khi lá đó rời tay.
- **Curse of the Cat Butt (Lời Nguyền Mông Mèo)**: chọn 1 đối thủ; tay bài của họ bị úp và xáo (mù hoàn toàn — server không gửi danh tính lá trên tay họ). Mọi lá bài họ nhận thêm trong lúc đang bị nguyền (ví dụ qua `Favour`, `TowerOfPower` Stash hoặc `IllTakeThat`) đều được xáo kín vào tay bài mà không lộ danh tính hay vị trí ô úp. Khi bị nguyền, họ chỉ có thể rút bài hoặc đánh mù 1 ô bài úp (`PlayBlind`): nếu là lá hành động đánh lẻ hợp lệ thì kích hoạt bình thường, ngược lại lá đó bị bỏ phí vào chồng bỏ. Lời nguyền tự giải sau khi rút bài thành công.
- **Imploding Kitten**:
  - Lần đầu rút (úp): không nổ, lật ngửa và chèn vào vị trí bất kỳ `[0, deck_count]` của bộ rút (không thể Nope).
  - Lần sau rút (ngửa): **loại ngay lập tức**, không thể `Defuse`, không được `Streaking` bảo vệ, không thể Nope.
- **Streaking Kitten**: lá thụ động; khi cầm trên tay cho phép giữ kín tối đa **1 lá `Exploding`** trên tay mà không nổ. Nếu mất `Streaking` hoặc cầm từ 2 `Exploding` trở lên, `Exploding` không được bảo vệ lập tức kích hoạt `Defuse` hoặc loại người đó. Khi người giữ `Streaking` bị loại, `Streaking` cũng rời khỏi ván (`removed`) và không vào chồng bỏ nên không thể lấy lại bằng combo 5 lá hay xáo lại vào bộ rút.
- **Barking Kitten (Mèo Sủa — luật chính thức mới)**: không thể Nope.
  - Nếu có người khác đang đặt `BarkingKitten` ngửa trước mặt hoặc đang cầm lá thứ hai trên tay: cả 2 lá vào chồng bỏ và người đó phải tự động bỏ 1 `Defuse` (nếu không có thì nổ và bị loại ngay).
  - Nếu bạn giữ cả 2 lá `BarkingKitten`: bỏ cả 2 lá và chọn bất kỳ đối thủ nào buộc phải `Defuse` hoặc nổ.
  - Ngược lại: đặt lá `BarkingKitten` ngửa trước mặt bạn; nếu ai đó đánh lá thứ hai sau này, bạn lập tức thành mục tiêu.
- **I'll Take That (Tớ Lấy Nhé)**: đặt ngửa trước mặt 1 đối thủ chưa bị đặt bẫy. Lần rút bài tiếp theo của họ, lá vừa rút bị chuyển thẳng cho bạn (nếu đó là `Exploding`/`Imploding`, chính bạn phải Gỡ Bom hoặc nổ!).
- **Tower of Power (Tháp Quyền Lực)**: nhận vương miện bảo vệ tay bài kèm kho Stash 6 lá úp; mọi hành động cướp bài (`Favour`, Combo 2/3, `IllTakeThat`) nhắm vào bạn đều buộc phải bốc mù 1 lá từ kho Stash thay vì cướp tay bạn chừng nào Stash còn bài.

## 4. Combo & Feral Cat

- `FeralCat` là lá mèo hoang đa năng, thay thế được cho bất kỳ loại mèo thường nào:
  - **Bộ 2**: 2 lá mèo cùng loại (hoặc có `FeralCat`) → cướp ngẫu nhiên 1 lá từ người chơi khác.
  - **Bộ 3**: 3 lá mèo cùng loại (hoặc có `FeralCat`) → gọi tên 1 `CardKind` từ người chơi khác.
  - **Bộ 5**: 5 lá mèo khác loại (mỗi `FeralCat` thay cho 1 loại còn thiếu) → chọn 1 lá bất kỳ từ chồng bỏ.

## 5. Nope

- Bất kỳ người còn sống nào có lá `Nope` (và không bị mù bài) đều có thể phản ứng với `last_action` khi cửa sổ Nope đang mở.
- Theo luật chính thống: lá hành động bị Nope và mọi lá `Nope` đã đánh **đều nằm lại chồng bỏ**.
- Không bao giờ Nope `Exploding`, `Defuse`, `Imploding`, `BarkingKitten`, `Draw`, `DrawBottom`, `Bury`.
