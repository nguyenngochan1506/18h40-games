# Engine Ma Sói

> Nguyên tắc chung: [../../technical-rule.md](../../technical-rule.md). Luật chơi: [rules.md](rules.md).

## 1. API (`crates/werewolf`)
- `PLAYER_LIMITS: (u32, u32) = (5, 16)`
- `setup(player_count: usize, settings: Settings, rng: &mut impl Rng) -> Result<(GameState, Vec<Event>), SetupError>`
  - Kiểm tra `player_count` trong `5..=16` và `settings.validate_for(player_count)` **trước khi** tiêu thụ RNG.
- `apply(state: &mut GameState, actor: PlayerId, action: Action, rng: &mut impl Rng) -> Result<Vec<Event>, ActionError>`
  - Xác thực toàn bộ điều kiện trước khi thay đổi `state` hoặc `rng`. Lỗi không làm biến đổi state/RNG.
- `view(state: &GameState, player: PlayerId) -> Option<PlayerView>`
- `spectator_view(state: &GameState) -> SpectatorView`
- `filter_events(events: &[Event], recipient: Option<PlayerId>) -> Vec<EventKind>`
- `default_action(state: &GameState) -> Option<(PlayerId, Action)>`
- `decision(state: &GameState) -> Option<Decision>`

## 2. State, Action, Event
- `GameState` **không** derive `Serialize`. Giữ toàn bộ trạng thái bí mật: vai thật, phe, tình nhân, lịch sử soi Tiên Tri/Pháp Sư, bình thuốc Phù Thủy, quyền biến đổi Sói Trùm, mục tiêu Bảo Vệ đêm trước, phiếu bầu đang chờ.
- `Action` (tagged `type` snake_case):
  - `CupidLink { first: PlayerId, second: PlayerId }`
  - `BodyguardProtect { target: PlayerId }`
  - `WolfVote { target: PlayerId, infect: bool }`
  - `SeerInspect { target: PlayerId }`
  - `SorcererInspect { target: PlayerId }`
  - `WitchAct { heal: bool, poison: Option<PlayerId> }`
  - `HunterShoot { target: PlayerId }`
  - `DayVote { target: Option<PlayerId> }`
- `Event` gồm `visibility: Visibility` (`Public`, `Player(PlayerId)`, `Players(Vec<PlayerId>)`) và `kind: EventKind`.
- Trên wire (`crates/protocol/src/werewolf.rs`), `WerewolfView` (enum `Player`/`Spectator`) và `WerewolfEvents` (wrapper private chỉ tạo qua `WerewolfEvents::for_recipient`) kèm doctest `compile_fail` chặn gửi `GameState` hoặc `Vec<Event>` thô.

## 3. Cơ chế chờ quyết định
- `Decision` định danh pha hiện tại và danh sách ghế còn cần hành động.
- Khi nhiều người cùng được chờ (bầy Sói bỏ phiếu đêm, hoặc cả làng bỏ phiếu ngày), bất kỳ người nào trong danh sách đều có thể gửi `Action` trước; `default_action` và `awaited_seat` bám theo người đầu tiên chưa hành động.
- Hành động mặc định (`default_action`):
  - `Cupid`: ghép 2 người sống đầu tiên.
  - `Bodyguard`: bảo vệ người sống hợp lệ đầu tiên (khác `last_protected`).
  - `Werewolves`: bỏ phiếu người sống ngoài bầy đầu tiên (`infect: false`).
  - `Seer` / `Sorcerer`: soi người sống khác mình đầu tiên.
  - `Witch`: không dùng thuốc (`heal: false, poison: None`).
  - `Hunter`: bắn người sống đầu tiên.
  - `DayVote`: bỏ phiếu trắng (`target: None`).
- Người bị loại nhận `SpectatorView` và chỉ nhận event công khai, **ngoại lệ duy nhất**: Thợ Săn vừa chết trong pha `HunterShot` vẫn giữ `PlayerView` (`can_act = true`) cho đến khi bắn xong mục tiêu kéo theo, sau đó chuyển ngay về `SpectatorView`.
- `may_continue_abandoned`: chỉ tự động tiếp tục nếu vẫn còn ít nhất 1 người chơi sống (hoặc đang được chờ hành động như Thợ Săn trong `HunterShot`) hiện diện trong phòng (tránh ván bỏ hoang quay vòng vô hạn).

## 4. View và lọc thông tin ẩn
- `SpectatorView` không bao giờ chứa vai ẩn của người còn sống, danh sách Sói, tình nhân, lịch sử soi, bình thuốc, nạn nhân đêm của Sói hay bước đêm chi tiết (`PublicPhase::Night { night }` không lộ `NightStep`, `awaited_count = 0` trong pha Đêm, và `NightStepStarted` chỉ gửi riêng cho người cần hành động) — nhờ đó tắt lộ vai khi chết không để lộ vai trò qua lịch bước đêm. Khi `winner.is_some()`, vai thật của mọi người chơi mới được công khai.
- `PlayerView` chỉ mở thêm thông tin đúng vai của `you` (kèm `active_night_step` chỉ có giá trị khi `can_act = true` trong pha Đêm):
  - Sói & Tay Sai thấy `known_wolves` (Tay Sai không nằm trong `known_wolves`).
  - Tình Nhân thấy `lover`; Thần Tình Yêu thấy `cupid_lovers`.
  - Tiên Tri thấy `seer_history`; Pháp Sư Hắc Ám thấy `sorcerer_history`.
  - Phù Thủy thấy `witch_victim` (chỉ trong bước `Witch`) và trạng thái 2 bình thuốc.
  - Bảo Vệ thấy `bodyguard_last_protected`.
  - Sói Trùm thấy `alpha_infect_available`.

## 5. Bất biến để test
- Fuzz 200+ ván ngẫu nhiên cho mọi số người từ 5 đến 16: không panic, ván luôn kết thúc, cùng seed cho cùng lịch sử và kết quả.
- Privacy: kiểm tra từng ghế sống, ghế chết và khán giả ở mọi bước; không có thông tin bí mật của người khác lọt vào `View` hoặc `Events`.
- Immutability on error: mọi `apply` bị từ chối giữ nguyên `state` và `rng`.

## 6. Settings phòng
- `Settings { roles: RoleDeck, reveal_role_on_death: bool }`.
- Khi số người chơi ở phòng chờ đổi, `adjust_settings` tự điều chỉnh `roles` về `RoleDeck::standard(players)` và giữ nguyên `reveal_role_on_death`.
- Khi bắt đầu ván, `validate_settings` từ chối nếu tổng vai ≠ số người, không có Sói cắn đêm (`werewolf + alpha_wolf == 0`), hoặc số người ngoài bầy Sói < 2.
