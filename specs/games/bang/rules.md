# Luật BANG! bộ gốc (đã đối chiếu nguồn)

> Đây là luật mà engine phải cài. Các quyết định riêng của dự án cho chỗ luật không rõ nằm ở mục 8.

## Nguồn và mức tin cậy

- **Rulebook chính thức của DV Games** (bản 4, 12 trang, PDF liên kết từ Ludex). Trang 2 đến 9 (chia vai, lượt, khoảng cách, các lá bài, `draw!`, Dynamite/Jail/Barrel, điều kiện thắng) **Claude đã tự đọc và đối chiếu**. Trang 10 đến 12 (nhân vật) dựa vào báo cáo của hai agent đọc độc lập (Ludex và `be_game`), hai nguồn khớp nhau.
- **Danh sách lá bài, chất và hạng:** đối chiếu giữa danh sách của DV Games và `bang-server/src/config/sets/base.yml`; đã tự phân tích `base.yml` và khớp (80 lá, 22 loại).
- **FAQ trên Ludex:** dùng cho ca biên, đã đánh dấu rõ chỗ nào chỉ dựa vào FAQ. Mấy thread gốc trên BoardGameGeek không truy cập được (HTTP 403) nên chưa kiểm chứng độc lập.
- Báo cáo đầy đủ của các agent: chỉ lưu trên máy tác giả, không có trong repo.

## 1. Chuẩn bị

| Số người | Cảnh sát trưởng (Sheriff) | Phó (Deputy) | Tội phạm (Outlaw) | Kẻ phản bội (Renegade) |
|---:|---:|---:|---:|---:|
| 4 | 1 | 0 | 2 | 1 |
| 5 | 1 | 1 | 2 | 1 |
| 6 | 1 | 1 | 3 | 1 |
| 7 | 1 | 2 | 3 | 1 |

- Chia vai ngẫu nhiên, úp. Sheriff lật vai ngay, các vai khác bí mật.
- Mỗi người nhận **một** nhân vật ngẫu nhiên, ngửa. Máu khởi đầu bằng máu của nhân vật; **Sheriff được +1 máu** (cả khởi đầu và tối đa).
- Mỗi người nhận số lá bằng máu khởi đầu của mình. Sheriff đi trước, lượt đi theo chiều kim đồng hồ.
- Mỗi người có sẵn một khẩu **Colt .45** (tầm 1). Đây không phải lá bài.

## 2. Lượt chơi

Đầu lượt, **trước giai đoạn 1**: xử lý Dynamite (nếu có), rồi Jail (nếu có). Nếu người chơi còn sống và không bị Jail thì lượt có ba giai đoạn:

1. **Rút 2 lá** từ bộ rút. Khi bộ rút hết thì xáo chồng bỏ thành bộ rút mới.
2. **Đánh bài** tùy ý, không bắt buộc. Ba giới hạn: chỉ **1 lá BANG!** mỗi lượt; chỉ **1 lá cùng tên** trước mặt; chỉ **1 vũ khí** (đánh vũ khí mới thì bỏ vũ khí cũ).
3. **Bỏ bài thừa** cho đến khi số lá trên tay **≤ máu hiện tại** (không phải máu tối đa).

Bài **nâu**: đặt vào chồng bỏ rồi áp dụng hiệu ứng. Bài **xanh dương**: đặt ngửa trước mặt (riêng Jail đặt trước người khác); lá trước mặt không giới hạn số lượng ngoài các giới hạn trên.

## 3. Khoảng cách

- Khoảng cách giữa hai người = số bước ngắn nhất theo một trong hai chiều trên vòng **người còn sống** (người bị loại không còn được tính).
- Mustang/Paul Regret cộng 1 vào khoảng cách người khác nhìn tới mình. Scope/Rose Doolan trừ 1 vào khoảng cách mình nhìn tới người khác. Cộng dồn được. Khoảng cách tối thiểu là 1.
- Tầm vũ khí chỉ áp dụng cho BANG!. Vũ khí **không** đổi khoảng cách và không làm Panic! xa hơn.

```
distance(A,B) = max(1, bước_ngắn_nhất(A,B) + B.mustang + B.paul − A.scope − A.rose)
```

## 4. Lá bài (80 lá, 22 loại)

### Bài nâu (63 lá)

| Lá | SL | Hiệu ứng |
|---|---:|---|
| BANG! | 25 | Bắn một người trong tầm. Họ phải hủy bằng Missed! (hoặc Barrel) nếu không sẽ mất 1 máu. Tối đa 1 lá mỗi lượt (trừ Volcanic, Willy the Kid). |
| Missed! | 12 | Hủy một phát bắn nhắm vào mình, dùng được ngoài lượt. Không dùng cho Duel hay Indians!. |
| Beer | 6 | Hồi 1 máu cho mình, không vượt máu tối đa. Ngoài lượt chỉ dùng khi vừa nhận sát thương **chí mạng**. **Không có tác dụng khi chỉ còn 2 người.** |
| Panic! | 4 | Lấy 1 lá từ người ở khoảng cách ≤ 1 (lá trên tay: ngẫu nhiên; lá tại chỗ: tự chọn). |
| Cat Balou | 4 | Buộc một người bất kỳ bỏ 1 lá (lá trên tay: ngẫu nhiên; lá tại chỗ: tự chọn), không giới hạn khoảng cách. |
| Duel | 3 | Thách một người bất kỳ. Họ bỏ BANG! trước, rồi hai bên luân phiên. Ai không bỏ (hoặc chọn không) thì mất 1 máu và Duel kết thúc. Không dùng Missed!/Barrel. BANG! bỏ trong Duel không tính vào giới hạn 1 lá mỗi lượt. |
| Indians! | 2 | Mỗi người khác bỏ 1 BANG! hoặc mất 1 máu. Không dùng Missed!/Barrel. |
| General Store | 2 | **[Chốt] General Store lật úp, chọn mù theo ô**: xáo kín số lá bằng số người đang sống; người đánh chọn trước rồi theo chiều kim đồng hồ. Chỉ người nhận biết mặt lá sau khi chọn. Đây là đổi luật có chủ đích theo yêu cầu người dùng. |
| Gatling | 1 | Bắn một "BANG!" vào mọi người khác, không giới hạn khoảng cách. **Không phải lá BANG!** nên không tính giới hạn 1 lá. Có thể phòng bằng Missed!/Barrel. |
| Saloon | 1 | Mọi người còn sống (gồm người đánh) hồi 1 máu. Không dùng ngoài lượt để cứu mạng. |
| Stagecoach | 2 | Rút 2 lá. |
| Wells Fargo | 1 | Rút 3 lá. |

### Bài xanh dương (17 lá)

| Lá | SL | Hiệu ứng |
|---|---:|---|
| Barrel | 2 | Khi bị BANG! nhắm tới có thể `draw!`: ♥ thì như dùng một Missed!. Không có tác dụng với Duel/Indians!. |
| Dynamite | 1 | Đầu lượt kế tiếp của người giữ (trước giai đoạn 1) `draw!`: ♠ từ 2 đến 9 thì nổ, bỏ lá và mất 3 máu; ngược lại chuyển cho người sống kế tiếp bên trái. Sát thương này không do ai gây ra. |
| Jail | 3 | Đặt trước người khác (không đặt lên Sheriff). Đầu lượt của họ, sau Dynamite, `draw!`: ♥ thì bỏ Jail và chơi bình thường; không thì bỏ Jail và **mất cả lượt**. Vẫn bị bắn và có thể phản ứng ngoài lượt. |
| Mustang | 2 | Người khác nhìn tới bạn xa thêm 1. |
| Scope | 1 | Bạn nhìn tới người khác gần hơn 1. |
| Volcanic | 2 | Tầm 1. Cho đánh BANG! không giới hạn số lá mỗi lượt. |
| Schofield | 3 | Tầm 2. |
| Remington | 1 | Tầm 3. |
| Rev. Carabine | 1 | Tầm 4. |
| Winchester | 1 | Tầm 5. |

Lá giảm khoảng cách tên là **Scope** (không phải Appaloosa).

### Chất và hạng từng bản sao (cần cho `draw!`)

Thứ tự hạng: 2 3 4 5 6 7 8 9 10 J Q K A.

| Lá | Bản sao |
|---|---|
| BANG! | A♠; 2♦ đến A♦; 2♣ đến 9♣; Q♥ K♥ A♥ |
| Missed! | 2♠ đến 8♠; 10♣ J♣ Q♣ K♣ A♣ |
| Beer | 6♥ đến J♥ |
| Panic! | J♥ Q♥ A♥ 8♦ |
| Cat Balou | K♥ 9♦ 10♦ J♦ |
| Duel | Q♦ J♠ 8♣ |
| Indians! | K♦ A♦ |
| General Store | 9♣ Q♠ |
| Gatling | 10♥ |
| Saloon | 5♥ |
| Stagecoach | 9♠ và 9♠ (**hai lá giống hệt**) |
| Wells Fargo | 3♥ |
| Barrel | Q♠ K♠ |
| Dynamite | 2♥ |
| Jail | J♠ 4♥ 10♠ |
| Mustang | 8♥ 9♥ |
| Scope | A♠ |
| Volcanic | 10♠ 10♣ |
| Schofield | J♣ Q♣ K♠ |
| Remington | K♣ |
| Rev. Carabine | A♣ |
| Winchester | 8♠ |

Vì có hai lá giống hệt, **chất cộng hạng không phải ID duy nhất**. Engine cần `CardId` riêng cho từng lá vật lý.

## 5. `draw!`

Lật lá trên cùng bộ rút, bỏ lá đó, rồi so chất (và hạng nếu lá yêu cầu). Khớp thì `draw!` thành công, không khớp thì không có gì xảy ra. Lá lật không kích hoạt hiệu ứng của chính nó. Barrel/Jail cần ♥; Dynamite cần ♠ và hạng 2 đến 9.

## 6. Nhân vật (16)

| Nhân vật | Máu | Kỹ năng |
|---|---:|---|
| Bart Cassidy | 4 | Mỗi 1 máu bị mất: rút ngay 1 lá. |
| Black Jack | 4 | Giai đoạn rút: lộ lá thứ hai; nếu ♥ hoặc ♦ thì rút thêm 1 lá. |
| Calamity Janet | 4 | Dùng BANG! như Missed! và ngược lại. |
| El Gringo | 3 | Mỗi 1 máu mất do lá của người khác: lấy ngẫu nhiên 1 lá trên tay người đó. Dynamite không tính. |
| Jesse Jones | 4 | Giai đoạn rút: lá đầu có thể lấy ngẫu nhiên từ tay người khác; lá hai lấy từ bộ rút. |
| Jourdonnais | 4 | Luôn có tác dụng như Barrel. Nếu có thêm Barrel thật thì được thêm một lần `draw!`. |
| Kit Carlson | 4 | Giai đoạn rút: xem 3 lá trên cùng, giữ 2, úp lá còn lại lên đỉnh bộ rút. |
| Lucky Duke | 4 | Mỗi lần `draw!`: lật 2 lá, chọn kết quả mình muốn, bỏ cả hai. |
| Paul Regret | 3 | Luôn có tác dụng như Mustang. |
| Pedro Ramirez | 4 | Giai đoạn rút: lá đầu có thể lấy từ đỉnh chồng bỏ; lá hai lấy từ bộ rút. |
| Rose Doolan | 4 | Luôn có tác dụng như Scope. |
| Sid Ketchum | 4 | Bất cứ lúc nào: bỏ 2 lá trên tay để hồi 1 máu. |
| Slab the Killer | 4 | BANG! của mình cần 2 Missed! mới hủy được (không áp dụng cho Gatling). |
| Suzy Lafayette | 4 | Ngay khi tay hết bài: rút 1 lá. |
| Vulture Sam | 4 | Khi một người khác bị loại: nhận toàn bộ bài trên tay và tại chỗ của họ vào tay mình. |
| Willy the Kid | 4 | Đánh BANG! không giới hạn số lá mỗi lượt. |

## 7. Bị loại, thưởng/phạt, điều kiện thắng

- Hết máu mà không cứu được (Beer, hoặc Sid) thì **bị loại**: lật vai, bỏ toàn bộ bài trên tay và tại chỗ (trừ khi có Vulture Sam). Người đó rời vòng khoảng cách.
- **Thưởng:** người hạ một Outlaw rút 3 lá (kể cả khi chính họ là Outlaw).
- **Phạt:** Sheriff hạ một Deputy phải bỏ toàn bộ bài trên tay và tại chỗ.
- **Sheriff và Deputy thắng** khi mọi Outlaw và Renegade đã bị loại.
- **Outlaw thắng** khi Sheriff bị loại, trừ khi Renegade là người duy nhất còn sống. Outlaw có thể thắng dù mọi Outlaw đã chết.
- **Renegade thắng** khi là người duy nhất còn sống sau khi Sheriff bị loại.

## 8. Quyết định của dự án cho chỗ luật không rõ

Rulebook và FAQ không nói rõ các chỗ sau. Đây là **quyết định của dự án**, không phải luật gốc.

| # | Vấn đề | Quyết định | Trạng thái |
|---|--------|-----------|-----------|
| 1 | Nhiều người bị loại cùng lúc: khi nào chốt thắng? Trang Ludex tự mâu thuẫn | Kiểm tra điều kiện thắng ngay sau khi một người bị loại và đã xử lý xong thưởng/phạt; dừng các mục tiêu còn lại | **[Chốt]** |
| 2 | Barrel và Jourdonnais là quyền "có thể dùng" | Tự động `draw!` khi bị BANG!, không hỏi. Lợi: bớt một bước chờ cho mọi ván | **[Chốt]** |
| 3 | Lucky Duke chọn lá | Hỏi người chơi chọn 1 trong 2 lá (theo luật), không tự chọn thay | **[Chốt]** |
| 4 | Thứ tự phản hồi Gatling/Indians! | Theo chiều kim đồng hồ, bắt đầu từ người kế người đánh | **[Chốt]** |
| 5 | Vai lộ khi ván kết thúc | Lộ hết vai khi kết thúc. Đây là chính sách sản phẩm, rulebook chỉ nói lộ khi bị loại | **[Chốt]** |
| 6 | Panic!/Cat Balou tự nhắm vào mình | Cho phép (theo FAQ Ludex) | **[Chốt]** |
| 7 | Thứ tự xử lý Bart Cassidy, El Gringo, Suzy, Vulture Sam khi có người chết | Bart Cassidy và El Gringo kích hoạt ngay sau khi sát thương được áp, **trước** cửa sổ `Dying` (nên Bart có thể rút được Beer để tự cứu). Suzy rút khi tay hết bài, sau khi hành động hiện tại giải xong. Vulture Sam: phạt của Sheriff (hạ Deputy) áp lên bài Sheriff đang có **trước**, rồi Vulture mới nhận bài của người bị loại | **[Đề xuất]** |
| 8 | Hết cả bộ rút lẫn chồng bỏ | Rút tối đa số lá còn có; `draw!` không có lá thì không thành công; Kit Carlson/Lucky Duke dùng số lá hiện có | **[Đề xuất]** |
| 9 | Outlaw tự đánh Duel rồi chết: có thưởng 3 lá không | Theo FAQ Ludex: không ai nhận thưởng khi Outlaw chết do chính Duel mình khởi xướng | **[Đề xuất]** |
| 10 | General Store công khai hay chọn mù | **General Store lật úp, chọn mù theo ô**; người đánh trước rồi clockwise; chỉ người nhận biết mặt lá. Người dùng chủ đích đổi luật gốc lật ngửa | **[Chốt]** |

