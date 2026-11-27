# Kế hoạch port Exploding Kittens - Detonating Cats

> Tài liệu điều phối implementation. Không thay đổi code trong bước tạo tài liệu này.

## 0. Mục tiêu

Tích hợp `wwwcats` thành một game module đầy đủ trong `18h40-games`:

- Luật chủ đạo: toàn bộ luật của phiên bản mở rộng Exploding Kittens
- Sử dụng tài nguyên và tên cat an toàn cho môn học: tên game Tiếng Việt là `Mèo Nổ`
- Không chạy Go server như một process thứ hai.
- Không thay đổi hành vi, protocol, registry hoặc tài nguyên của các game hiện có trong giai đoạn port.
- Chỉ bật game sau khi engine, protocol, server, web và test đều xanh.

Từ khóa game ổn định:

- `GameKind::Cats`
- crate `crates/cats`
- adapter `apps/server/src/games/cats.rs`
- UI `apps/web/src/games/cats/`
- asset `assets/cats/`
- spec `specs/games/cats/`

Nếu tên `cats` gây trùng với tên nội bộ hoặc ảnh thương mại, đổi trước khi đăng ký nhưng giữ toàn bộ mapping trong tài liệu đồng nhất.

## 1. Nguyên tắc không cho phép sai

Tài liệu này áp dụng các nguyên tắc của project:

- `Server authoritative`: React không tự tính lượt, bộ bài, kết quả hoặc quyền chơi.
- Engine thuần: không I/O, không clock, không socket, không global RNG.
- `State != View`: bài trên tay, bộ rút, deck và raw event không được gửi qua wire.
- `seq`: setup = 0, action thành công tăng đúng 1 một lần trong adapter.
- Action lỗi: không đổi state, RNG, seq, event batch hoặc quyết định đang chờ.
- Error không ảnh hưởng dead state: người hết bài không bị xem tay người khác.
- Game không import Bang/UNO/Werewolf hoặc code web của shell.
- Game chỉ đăng ký ở các điểm tĩnh được quy định trong `ADDING_A_GAME.md`.
- CSS/portal/keyframe/localStorage của game phải nằm dưới namespace `game-cats`.

Nguồn thẩm quyền:

- Luật gameplay trong source `wwwcats`.
- Luật mở rộng chính thống của bộ Exploding Kittens.
- Source chỉ là quy mô implementation; không tự động được coi là nguồn luật nếu nó có TODO hoặc sai quyền.

Quy tắc ưu tiên:

1. Luật chính thống trong phần 3 của tài liệu này.
2. Bất biến privacy và protocol của project chính.
3. Hành vi source `wwwcats` khi không mâu thuẫn.
4. TODO/bug của source phải được sửa, không port nguyên trạng.

## 2. Mapping source sang target

| Source wwwcats | Target project | Quy tắc chuyển |
| --- | --- | --- |
| `game.go::Game` | `crates/cats/src/state.rs` | State thuần, không pointer `*Client` |
| `game.go::readFromClient` | `crates/cats/src/actions.rs` + `engine.rs` | WebSocket không còn parse chuỗi; action typed |
| `game.go::drawCard` | `engine::draw` | Trả raw events và đổi RNG theo seed |
| `game.go::playsCard` | `engine::play_card` | Xử lý từng card, không xử lý ở UI |
| `game.go::playsCombo` | `engine::play_combo` | 2 lá, 3 lá, 5 lá khác nhau |
| `game.go::answersQuestion` | `engine::answer` | Chuyển thành typed pending response |
| `cards.go::Deck` | `crates/cats/src/deck.rs` | CardId vật lý; không chỉ dùng tên card |
| `cards.go::Hand` | `crates/cats/src/model.rs` | Hand riêng từng player |
| `cards.go::GameState` | `crates/cats/src/state.rs` | Lưu state phục hồi cho Nope chain |
| `lobby.go` + `client.go` | `apps/server/src/rooms.rs` | Không port lobby Go |
| `public_html/game.js` | `apps/web/src/games/cats/Board.tsx` | Tái dựng React; không port jQuery |
| `public_html/strings.js` | i18n tiếng Việt trong `i18n.ts` | Keycard và thông báo tiếng Việt |
| `public_html/assets/*` | `assets/cats/*` | Chỉ art an toàn cho môn học |

Không port:

- `rand.Seed(time.Now().UnixNano())`
- Global RNG
- Goroutine lobby
- `time.Sleep(5s)` để reset game
- Tên nickname làm key state
- Map `*Client` làm player identity
- Protocol chuỗi `draw`, `play`, `a`, `hand`, `q`
- `log.Fatal` do action người chơi
- `history *GameState` đơn luồng không bảo vệ Nope chain

## 3. Luật chính thống cần port

### 3.1 Bộ bài mở rộng

Dùng bộ bài chính thống của base game:

- Lá cat 5 loại, mỗi loại 4 lá: dùng cho combo 2/3/5.
- 5 lá `See the Future`.
- 4 lá `Attack`.
- 4 lá `Skip`.
- 4 lá `Shuffle`.
- 4 lá `Favour`.
- 5 lá `Nope`.
- 6 lá `Defuse`.
- 4 lá `Exploding`.

hiện đang có 56 lá, tích hợp thêm bài và luật chơi của bài mở rộng.

Ở implementation vật lý:

- `CardId` là danh tính duy nhất của từng lá.
- `CardKind` là loại luật của lá.
- Cat card giống hệt nhau về kind nhưng vẫn giữ CardId riêng.
- Năm loại Cat không đại diện cho năm loại cat độc lập ngoài luật combo.

### 3.2 Thiết lập

- Số người hợp lệ: 2-8.
- Tạo hand cho mỗi người: 1 Defuse + 7 lá không nổ.
- Sau khi deal:
  - Thêm `player_count - 1` Exploding.
  - Thêm `8 - player_count` Defuse còn lại.
- Xáo toàn bộ deck.
- Mỗi người bắt đầu với lượt bình thường.
- Lượt đầu tiên được chọn ngẫu nhiên bởi RNG có seed.


### 3.3 Hành động trong lượt

Người chơi đang có lượt có thể:

- Chơi các lá action hợp lệ.
- Chơi combo hợp lệ.
- Rút bài để kết thúc lượt.
- Không rút khi đang chờ Defuse.
- Không rút hoặc chơi ngoài lượt trừ các lá được phép như Nope.

Sau khi rút lá thường:

- Cộng lá vào hand.
- Kết thúc lượt, chuyển sang người tiếp theo.

### 3.4 Attack và Skip

Attack:

- Người chơi kết thúc lượt.
- Người kế tiếp không rút, mà phải thực hiện 2 lượt.
- Nếu người kế tiếp dùng Attack, hai lượt truyền tiếp theo luật stack chính thống.

Skip:

- Không rút bài.
- Kết thúc lượt hiện tại.
- Nếu đang bị Attack, Skip bù 1 trong số lượt được nợ.

Không được để Attack/Skip đổi `current_player` nhiều lần sai thứ tự khi Nope chain đang chạy.

### 3.5 Exploding và Defuse

Khi rút Exploding:

- Công khai rằng người đó rút Exploding.
- Không gửi lá nổ cho người khác qua private event.
- Nếu có Defuse: người rút phải chọn vị trí chèn Exploding vào bộ rút.
- Defuse bị bỏ và Exploding được chèn kín.
- Tiếp tục theo lượt/turn counter hiện có.
- Nếu không có Defuse: người đó bị loại khỏi lượt chơi.
- Khi còn đúng 1 người: người đó thắng.

Vị trí Defuse:

- `0` là top: lá Exploding được rút trước ở lượt kế tiếp.
- `position` được tính từ top hiện tại, không tính bottom/array index của source.
- Giá trị phải thuộc `[0, deck.cards_left]`.

Không cho người khác gửi Defuse response thay người rút.

### 3.6 Nope

Cần implementation chuẩn bằng pending stack thay vì logic Go đơn giản:

- Bất kỳ người chơi nào còn trong ván có thể đáp Nope trong cửa sổ action.
- Một Nope khác có thể đảo lại Nope trước đó.
- Nope không thể hủy Exploding hoặc Defuse.
- Khi action được Nope hoàn toàn, hoàn tác đúng một action và mọi side-effect liên quan.
- Không để Nope chain phá RNG state, turn counter hoặc ownership CardId.

Không port TODO source “NOPE here” thành từ chối mọi action.

Server phải có pending Nope frame/version để client gửi đúng gói; action trễ không được hủy frame mới.

### 3.7 See the Future

Xem đúng 3 lá trên top của bộ rút:

- Thứ tự hiển thị từ lá sắp rút đầu tiên đến lá thứ ba.
- Chỉ người chơi xem card.
- Không tiết lộ cho spectator hoặc player khác.
- Không thay đổi thứ tự deck.
- Nếu deck còn ít hơn 3 lá, chỉ hiển thị số lá còn lại.

### 3.8 Shuffle

- Xáo deck bằng RNG có seed.
- Không xáo hands.
- Không xáo chồng discard.
- Không thay đổi ownership của card đang trong hand/pending.
- Action này có thể bị Nope.

### 3.9 Favour

- Người chơi nêu tên Favour.
- Người bị nhắm chọn 1 lá trong hand của mình.
- Lá được chuyển sang tay người xin Favour.
- Favour không cho target chọn chính mình.
- Card target có thể được xem bởi chính họ; người khác không nhận tên lá.
- Nếu target không còn lá: transaction kết thúc không có transfer.
- Có thể bị Nope nếu action stack hỗ trợ.
- Không tự cấm Nope trừ khi luật phiên bản cụ thể được chốt rõ.

### 3.10 Combo

Hai lá Cat giống nhau:

- Người chơi chọn một người khác.
- Lấy ngẫu nhiên một lá từ hand target.
- Nếu target không có lá: không transfer.
- Target không biết trước lá nào; người lấy/target nhận event riêng.

Ba lá Cat giống nhau:

- Người chơi chọn một người khác.
- Nêu một `CardKind` muốn lấy.
- Nếu target có loại đó: chuyển một lá.
- Nếu không có: không transfer.
- Không cho target chọn chính mình.
- Nope có thể hủy combo.

Năm lá khác nhau:

- Được hỗ trợ theo luật chính thống.
- Người chơi bỏ 5 lá Cat khác loại.
- Người chơi chọn một lá từ discard pile? Trong bộ base thường lấy một lá ngẫu nhiên từ discard pile.
- Nếu chồng bỏ rỗng, không có gì xảy ra.
- Năm lá khác nhau có thể áp dụng Cat cards tương ứng.
- Test riêng bắt buộc.

Cat cards không thể bị chơi đơn để tạo effect ngoài combo.

### 3.11 Thắng thua

- Người còn lại duy nhất khi có tối thiểu 1 người rời/trớt là winner.
- Người bị nổ bằng Exploding không còn seat active.
- Người thua xem spectator view.
- Ván kết thúc không reset state ngay lập tức; chủ phòng bấm End Game để quay về waiting.
- Không cho người thua mới tiếp tục gửi action.

## 4. Cơ chế state và pending

State bắt buộc phải lưu:

- `turn: PlayerId` hoặc seat index.
- `turns_remaining: u32` cho Attack.
- `draw_count` hoặc lượt chưa hoàn thành.
- `phase`: Normal, PendingNope, Defusing, Favour, RandomGift, NamedSteal.
- `deck: Vec<CardId>`.
- `discard: Vec<CardId>`.
- `hands: BTreeMap<PlayerId, Vec<CardId>>`.
- `eliminated: BTreeSet<PlayerId>`.
- `winner: Option<PlayerId>`.
- `action_stack/history`: snapshot hoặc journal đủ để reverse action và chain Nope.
- `rng` không nằm trong raw state public.

Không được dùng `CardKind` làm biến ownership. `CardId` thực tế phải xuất hiện đúng một vùng:

```text
deck + discard + hand[player] + pending_gift/pending_choice
```

Không để card biến mất khi:

- Ván kết thúc.
- Người rời.
- Favour bị hủy.
- Nope hủy action.
- Tạo lại game.

## 5. API engine bắt buộc

Crate `crates/cats/src` tối thiểu có:

```rust
pub fn setup(
    player_count: usize,
    settings: Settings,
    rng: &mut impl Rng,
) -> Result<(State, Vec<Event>)>;

pub fn apply(
    state: &mut State,
    player: PlayerId,
    action: Action,
    rng: &mut impl Rng,
) -> Result<Vec<Event>, ActionError>;

pub fn view(state: &State, player: PlayerId) -> PlayerView;

pub fn spectator_view(state: &State) -> SpectatorView;

pub fn filter_events(events: &[Event], recipient: Option<PlayerId>) -> Vec<PublicEvent>;

pub fn default_action(state: &State) -> Option<(PlayerId, Action)>;

pub fn decision(state: &State) -> Option<Decision>;
```

Vị trí module gợi ý:

```text
crates/cats/src/
  lib.rs
  model.rs
  actions.rs
  engine.rs
  deck.rs
  events.rs
  view.rs
  state.rs
  tests/
```

Không derive `Serialize` cho `State`, `Deck`, `Hand`, `GameState`, `Event` thô nếu chúng chứa bí mật. Chỉ `PlayerView`, `SpectatorView` và `PublicEvent` được gửi qua protocol.

## 6. Action và response typed

Không tạo `Action::Json` hoặc `Action::Other(String)`.

Gợi ý discriminated enums:

```text
Draw
PlayCard { card_id }
PlayPair { card_kind, target }
PlayTriple { card_kind, target, wanted_kind }
PlayFiveDifferent { card_ids }
Nope { pending_id }
Defuse { pending_id, position }
FavourTarget { pending_id, target }
FavourCard { pending_id, card_id }
RandomTarget { pending_id, target }
StealTarget { pending_id, target }
StealCardKind { pending_id, target, wanted_kind }
SortHand
```

Action người chơi có thể chứa `CardId` vật lý. Server vẫn xác thực ownership từ state.

Tất cả pending response mang `pending_id`:

- Gói cũ không được apply vào pending mới.
- ID được tạo khi action/pending mới xuất hiện.
- Hành động sai loại hoặc sai người bị từ chối.

## 7. Cơ chế timeout và rời game

Dựa trên nền tảng hiện tại:

- Hành động bình thường chờ 60 giây offline.
- Khi người được chờ rời/hết thời gian, engine cung cấp `default_action`.
- Nếu pending là Defuse: default là Defuse ở vị trí hợp lệ determinist.
- Nếu pending là Favour/target: default là chọn target hợp lệ đầu tiên hoặc hủy nếu không còn target.
- Nếu pending là Steal/Random: default là chọn hợp lệ đầu tiên.
- Nếu pending là Nope: tiếp tục action bị hủy/chạy theo khả dụng.
- Không có default khi không có action hợp lệ.

`awaited_seat` chỉ trả seat nếu `default_action` thực sự tồn tại.

Người rời chủ động phải:

- Bỏ hand vào discard hoặc loại khỏi state theo policy game đã chốt.
- Không để card mất.
- Không để còn lượt pending nhắm tới người rời.
- Thắng ngay nếu còn 1 người active.

## 8. Protocol và UI contract

Thêm vào [crates/protocol/src/lib.rs](/D:/Game%2018h40/18h40-games/crates/protocol/src/lib.rs):

- `GameKind::Cats`
- `GameSettings::Cats(cats::Settings)`
- `GameAction::Cats(cats::Action)`
- `GameView::Cats(cats::PlayerView)`
- `GameDelta::Cats { events, view }`

Protocol shape:

```text
{ "game": "cats", "payload": { ... } }
```

Không dùng `serde_json::Value`.

Sau khi thêm public TS types:

```powershell
pnpm gen:types
```

Protocol version tăng nếu wire shape thay đổi.

UI bắt buộc xử lý:

- `sync.frames` theo thứ tự.
- `consume(frame.id)`.
- setup `seq = 0`.
- rejoin `reset: joined` không replay setup/effect.
- frame trùng/lùi/nhảy không làm queue cũ replay.
- queue 128 frame thì desync và rejoin.
- đúng `requestVersion` trước khi cập nhật interaction UI.

UI không được:

- Đếm/giữ state deck riêng làm source of truth.
- Tự xác định lượt từ hand.
- Tự tính legality.
- Chơi action ngoài seat của mình.
- Gửi event text tới server.

## 9. UI bắt buộc

Tạo các file:

- `apps/web/src/games/cats/info.ts`
- `apps/web/src/games/cats/index.ts`
- `apps/web/src/games/cats/client.ts`
- `apps/web/src/games/cats/Board.tsx`
- `apps/web/src/games/cats/Settings.tsx`
- `apps/web/src/games/cats/styles.css`
- `apps/web/src/games/cats/README.md`

Board cần:

- Danh sách player và trạng thái eliminated/offline.
- Người đang có lượt/lượt Attack còn lại.
- Số lá trong deck và discard.
- Hand cá nhân.
- Nút rút.
- Chơi 1 lá.
- Chơi 2 Cat giống nhau.
- Chơi 3 Cat giống nhau.
- Chơi 5 Cat khác nhau.
- Modal chọn player/card/position.
- Thông báo pending Nope.
- Thông báo người rút Exploding.
- Hand, view và event cập nhật sau frame.
- Animation được gọi bởi event, không tự suy ra action tiếp theo.
- Tiếng Việt cho mọi chuỗi visible.
- Hỗ trợ keyboard, focus rõ, touch và `prefers-reduced-motion`.

Settings:

- Không nhất thiết có tùy chọn luật ngoài phạm vi.
- Có thể dùng `Settings {}` nếu không có cấu hình.
- Giữ khung `SettingsProps` để về sau có thêm setting mà không sửa shell.

## 10. Asset và nội dung

Tạo `assets/cats/` với:

- Card art tự vẽ hoặc có license phù hợp.
- Card back.
- Scene/table.
- SFX hoặc âm thanh được tạo/licensed.
- UI icons.

Có thể copy art thương hiệu Exploding Kittens vì project môn học không dùng thương mại

Tên card được làm enum/value. Value luôn là tiếng Anh type như `Exploding`, `Defuse`, `Nope`.

## 11. Đăng ký

Thêm dependency và module ở:

1. `Cargo.toml` workspace member `crates/cats`.
2. `crates/protocol/Cargo.toml` dependency `cats`.
3. `apps/server/Cargo.toml` dependency `cats`.
4. `crates/protocol/src/lib.rs`.
5. `crates/protocol/examples/gen_types.rs`.
6. `apps/server/src/games/mod.rs`.
7. `apps/server/src/games/cats.rs`.
8. `apps/web/src/games/registry.ts`.
9. `apps/web/src/games/cats/`.
10. `assets/cats/`.
11. `specs/games/cats/`.

Không đăng ký game ở 2 nơi có metadata lệch nhau.

Server giữ `enabled=false` cho tới khi hoàn thành toàn bộ test.

## 12. Test bắt buộc

### 12.1 Setup

- 2 người: đúng 1 Exploding, 5 Defuse.
- 3 người: 2 Exploding, 4 Defuse.
- 4 người: 3 Exploding, 3 Defuse.
- 5 người: 4 Exploding, 2 Defuse.
- Mỗi người nhận đúng 1 Defuse tại setup.
- Mỗi người nhận đúng 7 non-defuse cat/action.
- Không có Exploding trong hand sau setup.
- Cùng seed tạo cùng deck.
- Seed khác có thể tạo deck khác.
- Số người ngoài 2-5 bị từ chối.

### 12.2 Action legality

- Player không tới lượt không rút.
- Spectator không rút/chơi.
- Eliminated player không rút/chơi.
- Card không thuộc hand bị từ chối.
- Target tự chọn mình bị từ chối.
- Pending sai người hoặc sai loại bị từ chối.
- Action sau game over bị `WrongPhase`.

### 12.3 Card logic

- Exploding không Defuse loại người.
- Exploding có Defuse mở Defuse response.
- Defuse position 0 chèn top.
- Defuse position cuối chèn bottom.
- Position ngoài phạm vi bị từ chối.
- Defuse card không bị chơi ngoài pending.
- Skip kết thúc lượt.
- Skip trừ một turn từ Attack.
- Attack chuyển 2 lượt.
- Attack bị Skip/Attack stack theo luật chốt.
- Nope hủy action.
- Nope chain chẵn/lẻ.
- Nope không hủy Exploding.
- Nope không cản Defuse.
- See Future chỉ trả top 3 cho requester.
- Shuffle không đổi hands.
- Favour chuyển đúng lá.
- Favour target hết hand không crash.
- 2 Cat lấy random card.
- 3 Cat lấy đúng named card.
- 5 Cat khác nhau.
- 5 Cat trùng nhau bị reject.
- Không còn card nào biến mất.

### 12.4 Nope và RNG

- Action reject không đổi RNG.
- Nope reject không đổi seq.
- Action thành công rồi revert bởi Nope không để CardId duplicated.
- Frame Nope trễ không undo frame mới.
- Cùng seed và cùng action/result tạo cùng state/event.
- Không dùng global RNG.

### 12.5 Privacy

- Player view không chứa hand người khác.
- Spectator không chứa hand.
- Raw deck không gửi qua wire.
- Raw event không gửi qua wire.
- See Future không gửi top 3 cho người khác.
- Random card không gửi tên cho người không liên quan.
- Favour/Named Steal không gửi card bí mật cho spectator.
- Defuse position có thể công khai nhưng Exploding identity phải kín.

### 12.6 Server và replay

- Setup `seq=0`.
- Action thành công `seq + 1`.
- Rejected action không tăng seq.
- Rejoin nhận snapshot hiện tại.
- Rejoin không replay setup.
- Frame duplicate không tạo animation lặp.
- Frame out-of-order hoặc gap chuyển desync.
- Offline được giữ ghế trong 60 giây.
- Default action chạy đúng pending.
- Không có pending treo vô hạn.
- Game over giữ snapshot.
- Chủ phòng End Game về waiting.

### 12.7 Fuzz

Bot random:

- Không panic.
- Chỉ chọn action hợp lệ.
- Ván kết thúc hữu hạn.
- Cùng seed/cùng seed bot tạo cùng state.
- Tổng CardId không đổi sau setup, action, Nope và end game.
- Không có CardId ở 2 vùng cùng lúc.
- Không có hand ngoài 0..n.
- Không có two active players nếu không winner.

### 12.8 Web

- Board render tất cả pending response.
- Board gọi `consume` đúng frame.
- Action đúng typed payload.
- Settings dùng đúng `GameSettings::Cats`.
- Mobile chạm 1 tay.
- Keyboard điều hướng card/player/modal.
- Không import game khác.
- Build lazy không kéo Cats vào entry tĩnh.
- Boundary script pass.

## 13. Self-check trước khi bật

Trước khi đổi `enabled=true`, xác nhận tất cả:

- [ ] `rules.md` và `engine.md` đã chốt 2-8 players.
- [ ] Engine không import network/render/DB.
- [ ] State/Event thô không serialize hoặc gửi wire.
- [ ] CardId hợp lệ ở đúng một vùng.
- [ ] Nope có chain stack và pending_id.
- [ ] Exploding/Defuse không được Nope.
- [ ] Attack/Skip turn counter đúng.
- [ ] 2/3/5 Cat combo đúng.
- [ ] Favour không crash khi hand rỗng.
- [ ] Timeout/default action không treo pending.
- [ ] Rejoin và setup seq đúng.
- [ ] Privacy test xanh.
- [ ] Protocol TS sinh lại.
- [ ] Registry lazy load đúng.
- [ ] Asset license hợp lý.
- [ ] Game không import engine/game khác.
- [ ] `pnpm check` xanh.
- [ ] `Cargo test --workspace` xanh.

## 14. Thứ tự implement chống regression

### Phase A - Contract và spec

1. Tạo `rules.md`.
2. Tạo `engine.md`.
3. Chốt test case và bất biến.
4. Cấm code UI/engine trước khi hai spec này được duyệt.

### Phase B - Engine độc lập

1. Tạo `CardId`, `CardKind`, `Deck`, `Hand`, `State`.
2. Tạo setup.
3. Tạo draw.
4. Tạo Exploding/Defuse.
5. Tạo turn, Skip, Attack.
6. Tạo 1-card action.
7. Tạo combo.
8. Tạo Nope stack.
9. Tạo view/filter events.
10. Viết test theo thứ tự này.

### Phase C - Protocol

1. Thêm enum Rust.
2. Thêm public View/Events.
3. Chặn raw state/raft event vào wire bằng type.
4. Sinh TS.
5. Thêm protocol round-trip test.

### Phase D - Server adapter

1. Tạo `cats.rs`.
2. Tạo `Module`.
3. Tạo `Session`.
4. Tạo step và seq.
5. Tạo default action.
6. Chạy server test rejoin/timeout.

### Phase E - Web

1. Tạo metadata/info.
2. Tạo React client.
3. Tạo Board và state sync.
4. Tạo modal interaction.
5. Tạo card catalog tiếng Việt.
6. Tạo CSS và animation.
7. Viết DOM test.

### Phase F - Enable

1. Registry thêm game.
2. `enabled=false` trong server trở thành `true`.
3. UI `enabled=true`, `status=available`.
4. Chạy toàn bộ `pnpm check`.
5. Chơi smoke test thật 2, 3, 4, 5,6,7 và 8 người.

### Phase G - Hạ wwwcats

Chỉ sau khi:

- Hai server không còn song song.
- 2-8 player gameplay đã test đủ.
- Rejoin và timeout đã pass.
- Privacy đã pass.
- Asset được xác nhận.
- Hướng dẫn chạy/build có trong project chính.

Mới được xóa D:\Game 18h40\wwwcats.
