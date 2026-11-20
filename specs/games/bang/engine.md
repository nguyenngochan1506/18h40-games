# Engine BANG!

> Nguyên tắc chung ở [../../technical-rule.md](../../technical-rule.md). Luật ở [rules.md](rules.md).
> Phần lớn mục dưới đây học từ repo `be_game` (TypeScript, license **Apache-2.0**) qua báo cáo nghiên cứu gốc (chỉ lưu trên máy tác giả, không có trong repo). Repo `bang-server` (C++23, **không có giấy phép**) chỉ để tham khảo ý tưởng, không chép code; Claude chưa đọc code của nó.

## 1. Giao diện

Crate `crates/bang`, bố cục: `model/` (lá bài, người chơi, nhân vật, vai), `actions/`, `rules/` (khoảng cách, sát thương, thắng thua), `engine.rs`, `state.rs`, `events.rs`, `view.rs`.

```
apply(state, player, action, rng) -> Result<Vec<Event>, ActionError>
view(state, player)               -> PlayerView
spectator_view(state)             -> SpectatorView
```

- Hàm thuần, không I/O, không đọc đồng hồ hay socket. RNG nhận seed qua tham số, **không có đường nào rơi về RNG toàn cục**.
- Action lỗi thì **không đổi state, event hay trạng thái RNG**. Kiểm tra hợp lệ trước khi rút bài ngẫu nhiên hay chuyển bài.
- Event là enum có ngữ nghĩa và ID (mất máu, di chuyển lá, loại người, đổi người được chờ...). Chuỗi tiếng Việt chỉ dựng ở phần hiển thị, **không dùng tên hiển thị để điều khiển luật**.
- Mỗi event gắn mức hiển thị; server lọc theo từng người nhận. Không dùng một trường `last` thay cho cả chuỗi event.

## 2. Quyền sở hữu bài

Mỗi trong 80 `CardId` xuất hiện **đúng một lần** trong các vùng sau:

```
bộ rút + chồng bỏ + tay từng người + bài tại chỗ từng người + pool bài trong pending
```

- Pending như General Store, Kit Carlson, Lucky Duke giữ **bài thật** trong lúc chờ. Mỗi frame phải định nghĩa việc bài đi đâu khi bị hủy, hoặc khi ván kết thúc.
- Lỗi đã thấy ở `be_game` cần tránh: ván kết thúc giữa lúc General Store còn bài trong pool, `finish` xóa hàng chờ mà bỏ quên bài, làm hỏng bất biến 80 lá.
- Lá vật lý có `CardId` riêng (có hai lá Stagecoach giống hệt nhau). Loại lá là enum, `CardId` chỉ là danh tính.

## 3. Cơ chế chờ quyết định

`state.pending: Vec<Pending>`, đỉnh ở cuối. Hàm `advance_until_input` xử lý các bước tất định cho tới khi cần một lựa chọn hợp lệ hoặc ván kết thúc. Bước tất định (hồi máu, rút bài) là hàm thường; chỉ lưu frame ở chỗ có thể dừng hoặc phải quay lại sau hiệu ứng con.

| Frame | Nội dung tối thiểu |
|---|---|
| `AttackResponse` | Nạn nhân, nguồn, loại phát bắn (BANG!, Gatling, Duel), số phản ứng còn thiếu (`remaining`), sát thương |
| `Duel` | Hai đấu thủ và người cần đáp kế tiếp |
| `ResolveTargets` | Lá đang xử lý và con trỏ tới các mục tiêu còn lại (Gatling, Indians!) |
| `GeneralStore` | Pool bài thật đã xáo kín (chỉ ở engine), thứ tự người chọn còn lại; view chỉ có `store_slots: u8` |
| `DrawChoice` / `KeepCards` | Jesse/Pedro chọn nguồn rút; Kit giữ 2 trong 3 |
| `ChooseDrawResult` | Lucky Duke chọn 1 trong 2 lá, kèm việc sẽ tiếp tục thế nào (Barrel, Jail, Dynamite) |
| `Dying` | Người sắp chết, nguồn, lượng máu còn thiếu; được dùng Beer/Sid hoặc chấp nhận chết |

Lượt của người đang chơi là trạng thái nền (`TurnState`), không phải frame. Với Dynamite/Jail đầu lượt, lưu bước tiếp theo trước khi đẩy frame con để quay lại không kiểm tra lại từ đầu.

**Gatling và Indians!** dùng một frame cha `ResolveTargets` rồi đẩy `AttackResponse` của người đầu tiên. Xử lý xong phản ứng, sát thương, cứu mạng, cái chết, thắng thua của người đó mới sang người kế.

```
[ResolveTargets(C,D), AttackResponse(B)]   B chịu đòn
[ResolveTargets(C,D), Dying(B)]            nếu cần quyết định cứu mạng
[ResolveTargets(C,D)]                      B xong, ván vẫn tiếp
=> đẩy AttackResponse(C)
```

## 4. Quyền hành động

- Mặc định chỉ nhận action của **người đang được chờ** (frame trên cùng) và đúng loại. Action đúng người nhưng sai loại bị từ chối.
- **Ngoại lệ: Sid Ketchum** hồi máu bất cứ lúc nào, kể cả khi đang chờ người khác. Validator riêng cho phép action này mà giữ nguyên frame bên dưới.
- Mỗi frame có `pending_id` (hoặc version); lệnh phản hồi mang theo id đó để từ chối gói trễ từ frame trước, nhất là khi Duel hỏi lại cùng một người.
- **`Dying`** cho người chơi chọn Beer hay Sid (và chọn 2 lá nào), hoặc chấp nhận chết. Không tự uống Beer thay họ. Cần nhiều Beer để sống sau Dynamite thì giữ cùng một cửa sổ.
- **Slab the Killer** cần `remaining` thay vì một action chứa đủ hai Missed!. Cho phép đáp từng lá để không loại trừ các ca như Suzy rút lại giữa chừng.
- Nếu một phản hồi hợp lệ nhưng người chơi không có lá nào để đáp thì **không** lộ thông tin bài trên tay qua việc có hay không có bước chờ. Cân nhắc kỹ khi tối ưu "tự nhận đòn khi không có bài".

## 5. Hết giờ chờ

Server (không phải engine) quản lý đồng hồ rồi gửi một action tất định theo chính sách. Đồng hồ của mỗi frame chỉ bắt đầu khi frame đó lên đỉnh, để người thứ ba không bị trừ giờ khi người thứ hai còn đang trả lời.

| Tình huống | Hành động mặc định |
|---|---|
| Phải phản ứng (ví dụ bị BANG!) | Bỏ qua phản ứng, nhận hậu quả **[Chốt]** |
| Đến lượt của người đó | Kết thúc lượt; nếu đang cầm thừa bài thì bỏ **lá cuối cùng trong tay** cho đủ **[Chốt]** |
| General Store | Chọn ô 0 trong danh sách ô còn lại **[Chốt]** |
| Kit Carlson | Giữ 2 lá đầu, úp lá còn lại **[Chốt]** |
| Lucky Duke | Chọn lá đầu **[Chốt]** |
| `Dying` | Chấp nhận chết **[Chốt]** |

Không học chính sách "tự đáp bằng Missed!" của `be_game`; chính sách của dự án là bỏ qua phản ứng.

## 6. View và thông tin ẩn

- `view(state, player)`: thông tin của chính người đó, cộng thông tin công khai; chỉ công khai người đang được chờ, không serialize cả stack.
- `spectator_view(state)` **[Chốt]**: chỉ thông tin công khai gồm máu, số lá trên tay (không lộ lá nào), bài tại chỗ, vũ khí, nhân vật, vai của Sheriff. Vai người khác lộ khi họ bị loại hoặc khi ván kết thúc.
- Người bị loại xem tiếp bằng `spectator_view` **[Chốt]**.
- Kênh dữ liệu cũng phải kiểm tra, không chỉ trường `hand`: log, event, metadata. Pool của Kit/Lucky chỉ gửi cho người được xem.
- Bất biến thông tin ẩn: mọi người và khán giả không thấy tay, vai kín, bộ rút, bài Kit/Lucky của người khác.

## 7. Kiểm thử

Chạy ngẫu nhiên và bất biến (theo [../../technical-rule.md](../../technical-rule.md)):
- Sau mỗi action (thành công hay thất bại) và sau khi ván kết thúc: đúng 80 `CardId` duy nhất, đúng một vùng.
- Pending chỉ nhắm người có thể quyết định hoặc được dọn hợp lệ; không có ván đang chơi mà thiếu lượt hay pending hợp lệ.
- Cùng state, action, seed thì cùng event; action lỗi giữ nguyên state và RNG; serialize rồi nạp lại ở mọi loại pending vẫn tiếp tục đúng.
- Có công cụ dựng ván: cố định bộ bài, đặt lá chất/hạng chỉ định lên đỉnh, seed RNG, rồi assert người ở đầu pending và bất biến bài.

Ca biên đáng có test riêng (mỗi dòng là một nhóm):
- **Quyền hành động:** người khác không đánh được khi B đang phản ứng; Sid ngoài lượt giữ nguyên frame; gói đáp trễ không đáp nhầm frame mới.
- **BANG!/Missed!:** đáp, hoặc tự nhận đòn dù có bài; Calamity Janet đổi nghĩa; phản ứng không tiêu giới hạn BANG!; hết pending trở về đúng người đang có lượt.
- **Slab:** hai Missed!; một Barrel thành công cộng một Missed!; Jourdonnais cộng Barrel; không rút lại cùng một cơ hội.
- **Indians!/Gatling:** thứ tự theo chiều ghế; người chết bị bỏ qua; Slab không tăng yêu cầu của Gatling; Barrel có tác dụng với Gatling nhưng không với Indians!.
- **Duel:** người bị thách đáp trước; đổi bên nhiều lần; chính chủ lượt cũng có thể mất máu; không dùng Barrel; không tính giới hạn BANG!.
- **General Store [Chốt]:** lật úp, chọn mù theo ô vì người dùng chủ đích đổi luật. Xáo pool bằng RNG seed của engine; người đánh chọn trước, rồi clockwise; `ChooseStoreSlot { pending_id, slot: u8 }` chọn chỉ số trong danh sách ô còn lại, xóa ô và giữ thứ tự các ô khác. View/rejoin chỉ có `store_slots`, `choices` không chứa pool. Công khai `StoreOpened { count }`, `StoreCardClaimed { player, slot }`; chỉ người nhận có `StoreCardReceived { card }`. Không gửi CardId pool chưa chọn cho bất kỳ người chơi/khán giả nào. Người chọn bị loại thì chuyển quyền; bài dư được trả/lộ qua `PoolDiscarded` như cũ, kể cả cuối ván; bảo toàn 80 lá.
- **Jail/Dynamite:** Dynamite trước Jail; nổ mà sống thì vẫn xử lý Jail; nổ chết thì không rút hay đánh; Jail không đặt lên Sheriff; Dynamite vừa đặt không kiểm tra ngay; ♠ A và ♠ 10 không nổ.
- **Cứu mạng:** Beer vô dụng khi còn hai người; nhiều Beer sau Dynamite; Sid tự chọn hai lá và có thể từ chối; Vulture Sam thu cả tay lẫn bài tại chỗ.
- **Khoảng cách:** vòng co lại khi có người chết; Mustang và Scope không đổi tầm vũ khí; Paul và Rose cộng dồn; súng mới thay súng cũ.
- **Thắng thua:** theo quyết định #1 ở [rules.md](rules.md) mục 8; Renegade phải là người duy nhất; Deputy chết vẫn thắng cùng Sheriff; hạ Outlaw thưởng 3; Sheriff hạ Deputy bỏ cả tay và bài tại chỗ.
- **Thông tin ẩn:** mỗi người và khán giả không thấy phần kín, cả trong log và event; không có tình huống "mặc định nhận đòn" lộ rằng người đó không có Missed!.

## 8. Việc phải nhớ khi làm mốc kế tiếp (từ review B1)

- **B2 (frame giữ bài):** `state.pending.clear()` ở `engine.rs` (khi ván kết thúc) chỉ an toàn vì hai frame B1 không giữ `CardId`. Khi thêm pool của General Store, Kit Carlson, Lucky Duke phải trả bài về đúng vùng trước khi clear, và mở rộng bất biến 80 lá trong `tests/support` để đếm cả pool trong pending.
- **Nối server:** `GameState` và `Event` thô đều `Serialize` và chứa phần kín. Wire DTO chỉ được nhận `PlayerView`/`SpectatorView` và event đã `filter_events` theo danh tính server xác thực; cần test tích hợp chống gửi nhầm state/event thô.
- **Fuzz:** chưa đếm độ phủ riêng cho `Dying`, Beer cứu mạng, thưởng/phạt, từng loại phe thắng; nên thêm counter và assert để bộ seed không thu hẹp âm thầm.

## 9. Việc phải nhớ cho B3 (từ review B2)

- **Cat Balou và chồng bỏ:** engine giữ `hidden_discard_top` để `discard_top=None` cho người ngoài tới khi có lá công khai phủ lên. Đây là **chính sách thông tin của sản phẩm**, không phải luật bài. Cân nhắc lại khi làm Pedro Ramirez (lấy lá đỉnh chồng bỏ).
- **Lucky Duke:** `draw_check` hiện trả kết quả ngay rồi Barrel/Dynamite/Jail chạy tiếp trong cùng lời gọi. Cần frame chọn kết quả kèm continuation; `TurnStep` đã lưu bước kế tiếp trước Dynamite/Jail nên là nền phù hợp.
- **Slab the Killer:** Barrel ♥ hiện hủy trọn phát bắn và `remaining` luôn 1. Phải tính `remaining` trước Barrel, trừ đúng một phản ứng, rồi vẫn hỏi Missed! còn thiếu; cần test Slab kết hợp Barrel.
- **Ba ca luật hoãn B3** (`rules.md` mục 8 dòng 7 đến 9) vẫn mở, trong đó Duel hiện tính nguồn sát thương là đối thủ còn lại.
