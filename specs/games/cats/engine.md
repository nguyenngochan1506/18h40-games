# Mèo Nổ — kiến trúc engine

## 1. Ranh giới

`crates/cats` là engine thuần:

- Không I/O, socket, clock, DB, global RNG.
- Mọi ngẫu nhiên đi qua `rng: &mut impl Rng`.
- Không import `bang`, `uno`, `werewolf`, `protocol`, server hay web.
- `State`, `Event` thô, `Pending`, snapshot không derive `Serialize`/`Deserialize`.
- Chỉ `Settings`, `Action`, `PlayerView`, `SpectatorView`, `EventKind` được đưa vào protocol wrapper.

## 2. Module

```text
crates/cats/src/
  lib.rs      re-export contract
  model.rs    PlayerId, CardId, CardKind, CardView, Settings
  deck.rs     composition, deal, draw, insert, reshuffle helpers
  state.rs    State, Player, TurnState, Pending, Decision, History
  actions.rs  Action, ActionError, validate + apply
  events.rs   Event, EventKind, Visibility, filter_events
  view.rs     PlayerView, SpectatorView, PublicAction
  engine.rs   setup, apply, default_action, decision
```

## 3. API

```rust
pub fn setup(count: usize, settings: Settings, rng: &mut impl Rng)
    -> Result<(State, Vec<Event>), ActionError>;

pub fn apply(state: &mut State, player: PlayerId, action: Action, rng: &mut impl Rng)
    -> Result<Vec<Event>, ActionError>;

pub fn view(state: &State, player: PlayerId) -> PlayerView;
pub fn spectator_view(state: &State) -> SpectatorView;
pub fn filter_events(events: &[Event], recipient: Option<PlayerId>) -> Vec<Event>;
pub fn default_action(state: &State) -> Option<(PlayerId, Action)>;
pub fn decision(state: &State) -> Option<Decision>;
```

`view` trả `PlayerView` kể cả người đã bị loại, nhưng server dùng spectator view cho người bị loại để không lộ tay người khác.

## 4. State

```text
State
  settings: Settings
  players: Vec<Player { hand, eliminated }>
  deck: Vec<CardId>        // top = cuối vec
  discard: Vec<CardId>
  removed: Vec<CardId>     // Exploding đã nổ
  turn: TurnState { player, turns_left }
  pending: Vec<Pending>
  winner: Option<PlayerId>
  last_action: Option<LastAction>
  next_id: u64
```

`LastAction` chứa `id`, `actor`, `played`, `nopeable`, và `History` snapshot trước action.
`History` sao chép players/deck/discard/removed/turn/pending/winner nhưng **không** sao chép `next_id` hay `last_action`. `next_id` chỉ tăng, không bao giờ lùi, nên id cũ không thể trùng frame mới.

## 5. Pending

```text
Pending { id, kind }

PendingKind
  Defuse { player, exploding }
  FavourTarget { actor }
  FavourCard { actor, target }
  RandomTarget { actor }
  StealTarget { actor }
  StealKind { actor, target }
  TakeDiscard { actor }
```

`pending.last()` quyết định `Decision`. `Defuse.exploding` là vùng live duy nhất ngoài deck/discard/hand/removed.

`decision` trả:

- Pending: đúng người + `pending_id` + loại.
- Không pending, chưa có winner: người đang có lượt, kind `Turn`, `pending_id = None`.
- Có winner: `None`.

## 6. Action

```text
Draw
PlayCard { card }
PlayPair { kind }
PlayTriple { kind }
PlayFive { cards }
Nope { pending_id }
Defuse { pending_id, position }
FavourTarget { pending_id, target }
FavourCard { pending_id, card }
RandomTarget { pending_id, target }
StealTarget { pending_id, target }
StealKind { pending_id, kind }
TakeDiscard { pending_id, card }
```

- `Nope` không cần đúng `Decision.player`; chỉ cần `pending_id == last_action.id`, action còn `nopeable`, người chơi còn sống và có Nope.
- Response pending phải đúng người, đúng loại, đúng `pending_id`.
- `PlayCard` chỉ nhận Attack/Skip/Shuffle/See the Future/Favour. Cat, Nope, Defuse, Exploding bị từ chối.
- `PlayPair` mở `RandomTarget`; `PlayTriple` mở `StealTarget` → `StealKind`; `PlayFive` mở `TakeDiscard`.

## 7. Nope

Mỗi action có thể bị Nope làm như sau:

1. Trước khi mutate, lưu `History` vào `last_action` với id mới.
2. Apply action.
3. Nope hợp lệ:
   - Lấy `target = last_action`.
   - Chụp `after = History` của state hiện tại.
   - `state.restore(target.history)` — đảo action, pending liên quan biến mất.
   - Bỏ 1 lá Nope khỏi tay người Nope, đưa vào discard.
   - `last_action = LastAction { id: next_id(), history: after, actor: noper, played: Nope, nopeable: true }`.
4. Nope tiếp theo lặp lại bước trên, nên chuỗi lẻ đảo action gốc, chuỗi chẵn khôi phục action gốc.

Vì `History` chứa pending cũ, Nope trong lúc Favour/Combo đang chờ sẽ hủy đúng giao dịch. Vì `next_id` không nằm trong snapshot, gói trễ không thể khớp frame mới.

Draw thường/Exploding/Defuse đặt `last_action = None`. Mọi action mới ghi đè `last_action`, đóng cửa sổ Nope cũ.

## 8. Turn

`finish_turn`:

- `turns_left > 1` → `turns_left -= 1`, giữ nguyên người, phát `TurnStarted`.
- Ngược lại → người còn sống kế tiếp, `turns_left = 1`, phát `TurnStarted`.
- Người bị loại bị bỏ qua.
- Nếu còn 1 người sống → set winner, không phát lượt mới.

`Attack` không gọi `finish_turn`; nó tính `(turns_left - 1) + 2` cho người kế tiếp.

`Skip` gọi `finish_turn` không rút. `Draw`/Defuse xong gọi `finish_turn` sau khi xử lý lá.

## 9. Bất biến

- `setup` chỉ nhận `2..=8`.
- Mọi action lỗi trả `Err` trước khi mutate state/RNG/id/pending.
- `next_id` tăng đơn điệu; mỗi pending/last_action dùng id mới.
- `seq` do adapter tăng đúng 1 lần sau `apply` thành công; engine không biết `seq`.
- Live `CardId` không trùng giữa deck/discard/hand/pending/removed. History được loại trừ.
- Public event không chứa lá trên tay, top deck, lá random, hay lá Favour cụ thể.
- Spectator view chỉ có số lá, discard public, turn, decision, last action công khai.
- Cùng seed + cùng chuỗi action → cùng state/event.

## 10. Test bắt buộc

- Setup 2–8: số Exploding/Defuse/deck đúng bảng rules.
- Cùng seed → cùng deck; seed khác → deck khác.
- Draw thường, draw Exploding có/không Defuse, vị trí 0/cuối/ngoài phạm vi.
- Skip/Attack/Attack stack; lượt bị Attack.
- Nope đảo Skip/Favour/Combo/Shuffle; Nope chain 1/2/3; Nope trễ bị từ chối; Nope không đảo Exploding/Defuse.
- See Future chỉ trả top 3 cho requester.
- Favour chuyển đúng lá, target rỗng không crash.
- Pair random, Triple named, Five different, Five trùng bị từ chối.
- Privacy: view người khác/spectator không có hand, top deck, lá random/Favour.
- Fuzz bot: không panic, mọi CardId còn đúng một vùng live, ván kết thúc hữu hạn.
