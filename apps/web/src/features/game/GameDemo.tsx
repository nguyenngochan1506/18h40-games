import { PROTOCOL_VERSION } from '../../generated/protocol.ts';
import { useEffect, useState } from 'react';
import type { Action, ClientMessage, EventKind, GameSnapshot } from '../../generated/protocol';
import GameBoard from './GameBoard';
import { demoGame, demoRoom as baseDemoRoom } from './demo';
import { demoFx } from './demoFx';
import type { FxBatch } from './fx';
import { demoEvents } from './demoEvents';
import { eventsToLog } from './log';
import { sound } from './sound';
import { soundCues } from './soundCatalog';
import type { SoundKind } from './soundCatalog';
import { errorMessages } from '../../shared/lib/errors';
import { selectGameView } from './state';
import { cardCatalog } from './cardCatalog';

const demoEquipment = (['volcanic', 'schofield', 'winchester', 'barrel', 'scope', 'mustang', 'dynamite', 'jail'] as const).map(kind => cardCatalog.findIndex(card => card.kind === kind));

export default function GameDemo() {
  const soundLabels: Record<SoundKind, string> = { shot: 'BANG!', gatling: 'Súng liên thanh', missed: 'Đạn bật', explosion: 'Vụ nổ', card: 'Lật bài', draw: 'Rút bài', shuffle: 'Xáo bài', clink: 'Chạm chai', reload: 'Nạp đạn', neigh: 'Ngựa hí', turn: 'Chuông lượt', tap: 'Gõ bàn', hit: 'Trúng đạn', jail: 'Cửa Jail', gamestart: 'Bắt đầu ván', victory: 'Chiến thắng', death: 'Bị loại', duel: 'Đấu súng', indians: 'Thổ dân', generalstore: 'Cửa hàng', invalid: 'Hành động bị từ chối', dynamite: 'Ngòi Dynamite' };
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).get('mode') ?? 'turn');
  const [count, setCount] = useState(() => { const n = Number(new URLSearchParams(window.location.search).get('players')); return [4, 5, 6, 7].includes(n) ? n : 5; });
  const [ambientEnabled, setAmbientEnabled] = useState(true);
  const [fxBatch, setFxBatch] = useState<FxBatch | null>(null);
  const [soundSequence, setSoundSequence] = useState<number[]>([]);
  const [ui, setUi] = useState(() => { const requested = Number(new URLSearchParams(window.location.search).get('hand') ?? 5); return { hand: Number.isInteger(requested) ? Math.max(-5, Math.min(8, requested - 5)) : 0, equipment: false, health: false, stock: false }; });
  const [trial, setTrial] = useState<{ id: number; action: Action } | null>(null);
  const [pending, setPending] = useState(false), [reject, setReject] = useState(false), [actionError, setActionError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [played, setPlayed] = useState<number[]>([]);
  const [handPicked, setHandPicked] = useState(false);
  const [storePicked, setStorePicked] = useState<number[]>([]);
  useEffect(() => {
    if (!trial) return;
    const timer = window.setTimeout(() => {
      setPending(false); setRequestVersion(value => value + 1);
      if (reject) setActionError(errorMessages.illegal_action);
      else if (trial.action.type === 'choose_store_slot') {
        const { slot } = trial.action;
        const card = [5, 33, 60, 71].filter(id => !storePicked.includes(id))[slot];
        setStorePicked(current => [...current, card]);
        setFxBatch(current => ({ id: (current?.id ?? 0) + 1, events: [{ type: 'store_card_claimed', player: 0, slot }, { type: 'store_card_received', card }], waiting: null }));
      }
      else if (trial.action.type === 'choose_hand_slot') {
        const kind = mode === 'hand_cat' ? 'cat_balou' : 'panic', slot = trial.action.slot;
        setHandPicked(true);
        setFxBatch(current => ({ id: (current?.id ?? 0) + 1, events: [{ type: 'hand_slot_claimed', actor: 0, target: 1, slot }, { type: 'hand_affected', source: 0, target: 1, kind, count: 1 }, { type: 'hand_card_affected', source: 0, target: 1, kind, card: 26 }], waiting: null }));
      }
      else if ('card' in trial.action && trial.action.card !== null) { const card = trial.action.card; setPlayed(current => [...current, card]); }
    }, 650);
    return () => clearTimeout(timer);
  }, [trial]);
  const [sent, setSent] = useState<ClientMessage | null>(null);
  useEffect(() => {
    const clear = () => { soundSequence.forEach(clearTimeout); sound.stop(); };
    const hidden = () => { if (document.hidden) clear(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); clear(); };
  }, [soundSequence]);
  const spectator = new URLSearchParams(window.location.search).get('view') === 'spectator';
  const game: GameSnapshot = structuredClone(demoGame);
  if (game.view.perspective === 'player') {
    const table = game.view.view.table;
    if (count === 4) { game.seats = game.seats.slice(0, 4); table.players = table.players.slice(0, 4); }
    if (count >= 6) {
      game.seats.push({ player_id: 5, member_id: '6', nickname: 'Vy' });
      table.players.push({ id: 5, character: 'willy_the_kid', health: 4, max_health: 4, alive: true, hand_count: 3, in_play: [66], weapon_range: 1, role: null });
    }
    if (count === 7) {
      game.seats.push({ player_id: 6, member_id: '7', nickname: 'Khang' });
      table.players.push({ id: 6, character: 'paul_regret', health: 2, max_health: 3, alive: true, hand_count: 2, in_play: [79], weapon_range: 5, role: null });
    }
    if (['turn', 'store', 'jesse', 'pedro', 'kit', 'kit_short', 'lucky_jail', 'lucky_dynamite'].includes(mode)) table.turn.player = 0;
    if (mode === 'sid') table.turn.player = 2;
    if (mode === 'scene') { table.turn.player = 0; table.waiting = { player: 0, pending_id: null, kind: { type: 'turn' } }; }
    if (mode === 'turn') { table.turn.player = 0; table.waiting = { player: 0, pending_id: null, kind: { type: 'turn' } }; }
    if (mode === 'duel') table.waiting = { player: 0, pending_id: 14, kind: { type: 'duel' } };
    if (mode === 'dying') { table.players[0].health = 0; table.waiting = { player: 0, pending_id: 15, kind: { type: 'dying', needed: 1 } }; }
    if (mode === 'hand_panic' || mode === 'hand_cat') {
      table.turn.player = 0; table.players[1].hand_count = handPicked ? 3 : 4;
      table.waiting = handPicked ? { player: 0, pending_id: null, kind: { type: 'turn' } } : { player: 0, pending_id: 22, kind: { type: 'pick_hand_slot', target: 1, kind: mode === 'hand_cat' ? 'cat_balou' : 'panic', count: 4 } };
      if (handPicked && mode === 'hand_panic') game.view.view.hand.push(26);
      if (handPicked && mode === 'hand_cat') { table.discard_count += 1; table.discard_top = null; }
      game.seq += Number(handPicked);
    }
    if (mode === 'store') { game.view.view.hand.push(...storePicked); game.seq += storePicked.length; table.store_slots = 4 - storePicked.length; table.waiting = table.store_slots ? { player: 0, pending_id: 16 + storePicked.length, kind: { type: 'general_store' } } : { player: 0, pending_id: null, kind: { type: 'turn' } }; }
    if (mode === 'jesse' || mode === 'pedro') { table.players[0].character = mode === 'jesse' ? 'jesse_jones' : 'pedro_ramirez'; table.waiting = { player: 0, pending_id: 17, kind: { type: 'draw_choice' } }; }
    if (mode === 'kit' || mode === 'kit_short') { table.players[0].character = 'kit_carlson'; game.view.view.choices = mode === 'kit_short' ? [5] : [5, 33, 60]; table.waiting = { player: 0, pending_id: 18, kind: { type: 'keep_cards', keep: Math.min(2, game.view.view.choices.length) } }; }
    if (mode.startsWith('lucky')) { table.players[0].character = 'lucky_duke'; game.view.view.choices = [5, 33]; table.waiting = { player: 0, pending_id: 19, kind: { type: 'choose_draw_result', reason: mode === 'lucky_jail' ? 'jail' : mode === 'lucky_dynamite' ? 'dynamite' : 'barrel' } }; }
    if (mode === 'sid' || mode === 'sid_dying') { table.players[0].character = 'sid_ketchum'; table.players[0].health = mode === 'sid_dying' ? 0 : 2; table.waiting = mode === 'sid_dying' ? { player: 0, pending_id: 20, kind: { type: 'dying', needed: 1 } } : { player: 1, pending_id: 21, kind: { type: 'attack_response', kind: 'bang', remaining: 1, checks_left: 0 } }; }
  }
  if (game.view.perspective === 'player' && fxBatch) {
    const table = game.view.view.table;
    for (const event of fxBatch.events) {
      if (event.type === 'game_ended') { table.winner = event.winner; table.waiting = null; for (const player of table.players) player.role = event.roles[player.id] ?? 'outlaw'; }
      if (event.type === 'health_changed') table.players.find(p => p.id === event.player)!.health = event.health;
      if (event.type === 'card_discarded') for (const player of table.players) player.in_play = player.in_play.filter(card => card !== event.card);
      if (event.type === 'player_eliminated') { const p = table.players.find(p => p.id === event.player)!; p.alive = false; p.health = 0; p.role = event.role; }
      if (event.type === 'card_equipped') { const p = table.players.find(p => p.id === event.player)!; if (!p.in_play.includes(event.card)) p.in_play.push(event.card); }
      if (event.type === 'turn_started') table.turn.player = event.player;
    }
  }
  if (game.view.perspective === 'player') {
    const { table } = game.view.view;
    const extra = [2, 3, 4, 5, 6, 7, 8, 9];
    game.view.view.hand = ui.hand < 0 ? game.view.view.hand.slice(0, Math.max(0, game.view.view.hand.length + ui.hand)) : [...game.view.view.hand, ...extra.slice(0, ui.hand)];
    game.view.view.hand = game.view.view.hand.filter(card => !played.includes(card));
    game.seq += played.length;
    table.players[0].hand_count = game.view.view.hand.length;
    if (ui.equipment) table.players[1].in_play = [67];
    if (ui.health) { table.players[1].health = 1; table.players[0].health = 2; }
    if (ui.stock) { table.draw_count = 31; table.discard_count = 30; table.discard_top = 37; }
  }
  const gearQuery = new URLSearchParams(window.location.search).get('gear');
  const gear = gearQuery === null ? null : Number(gearQuery);
  if (gear !== null && Number.isInteger(gear) && game.view.perspective === 'player') {
    for (const player of game.view.view.table.players) {
      player.in_play = demoEquipment.slice(0, Math.max(0, Math.min(8, gear)));
      player.alive = true; player.health = 3; player.weapon_range = gear >= 3 ? 5 : gear === 2 ? 2 : 1;
      player.jail_turns_left = gear >= 8 ? 2 : undefined;
    }
  }
  const final = mode.startsWith('end_');
  if (final && game.view.perspective === 'player') {
    const table = game.view.view.table;
    table.winner = mode === 'end_sheriff' ? 'sheriff_and_deputies' : mode === 'end_outlaw' ? 'outlaws' : { renegade: { player: 2 } };
    table.waiting = null;
    for (const player of table.players) {
      player.role = demoEvents.game_ended.roles[player.id] ?? 'outlaw';
      player.alive = mode === 'end_sheriff' ? player.id < 2 : mode === 'end_outlaw' ? player.id === 2 || player.id === 4 : player.id === 2;
      player.health = player.alive ? Math.max(1, player.health) : 0;
    }
  }
  const events: EventKind[] = mode === 'log' || final ? Object.values(demoEvents).filter((event) => event.type !== 'game_ended' && (!spectator || !['choice_offered', 'cards_received', 'stolen_cards', 'hand_card_affected', 'store_card_received'].includes(event.type))) : [demoEvents.game_started, demoEvents.turn_started, demoEvents.cards_drawn];
  if (final && game.view.perspective === 'player') events.push({ ...demoEvents.game_ended, winner: game.view.view.table.winner! });
  const log = eventsToLog(events, { seats: game.seats, you: spectator ? null : 0 }).map((text, id) => ({ id, text }));
  if (spectator) game.view = { perspective: 'spectator', view: selectGameView(game.view).table };
  const room = { ...baseDemoRoom, members: game.seats.map(seat => baseDemoRoom.members.find(member => member.id === seat.member_id) ?? { id: seat.member_id, nickname: seat.nickname, role: 'player' as const, online: true }) };
  return <main className="demo-shell"><details className="demo-tools"><summary>Thử tình huống</summary><nav className="demo-nav"><span>18h40 games · Bàn mẫu</span><a href="/">Về phòng</a></nav>
    <div className="demo-toolbar"><label htmlFor="demo-count">Số người</label><select id="demo-count" value={count} onChange={(event) => { setCount(Number(event.target.value)); setStorePicked([]); setHandPicked(false); setPlayed([]); setTrial(null); setPending(false); setActionError(null); setFxBatch(null); }}><option value="4">4 người</option><option value="5">5 người</option><option value="6">6 người</option><option value="7">7 người</option></select><label htmlFor="demo-mode">Tình huống demo</label><select id="demo-mode" value={mode} onChange={(event) => { setMode(event.target.value); setStorePicked([]); setHandPicked(false); setPlayed([]); setTrial(null); setPending(false); setActionError(null); setSent(null); setFxBatch(null); }}><option value="turn">Lượt chơi / bỏ bài thừa</option><option value="scene">Toàn cảnh · đang bị nhắm</option><option value="attack">BANG! cần hai Missed!</option><option value="duel">Đáp Duel</option><option value="dying">Cứu mạng bằng Beer</option><option value="store">General Store</option><option value="hand_panic">Panic! · chọn mù tay</option><option value="hand_cat">Cat Balou · chọn mù tay</option><option value="jesse">Jesse Jones · nguồn rút</option><option value="pedro">Pedro Ramirez · nguồn rút</option><option value="kit">Kit Carlson · giữ bài</option><option value="kit_short">Kit Carlson · chỉ còn 1 lá</option><option value="lucky">Lucky Duke · Barrel</option><option value="lucky_jail">Lucky Duke · Jail</option><option value="lucky_dynamite">Lucky Duke · Dynamite</option><option value="sid">Sid Ketchum · ngoài lượt</option><option value="sid_dying">Sid Ketchum · cứu mạng</option><option value="log">Nhật ký mẫu</option><option value="end_sheriff">Cảnh sát trưởng và Phó cảnh sát thắng</option><option value="end_outlaw">Tội phạm thắng</option><option value="end_renegade">Kẻ phản bội thắng</option></select></div><fieldset className="demo-fx-controls demo-drag-controls"><legend>Thử kéo thả</legend><label><input type="checkbox" data-demo-drag="reject" checked={reject} onChange={event => setReject(event.target.checked)} /> Giả lập máy chủ từ chối</label><p>Toàn cảnh cho phép kéo bài; chờ phản hồi mẫu 650 ms.</p></fieldset><fieldset className="demo-fx-controls"><legend>Thử hiệu ứng</legend>{Object.entries(demoFx).map(([key, fixture]) => <button type="button" className="action secondary" data-demo-fx={key} key={key} onClick={(event) => { setFxBatch(current => ({ id: (current?.id ?? 0) + 1, events: fixture.events, waiting: null })); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{fixture.label}</button>)}</fieldset><fieldset className="demo-fx-controls demo-particle-controls"><legend>Thử lớp hạt</legend>{(['shot', 'damage', 'explosion', 'gatling', 'heal', 'missed', 'jail', 'eliminate', 'win'] as const).map(kind => <button type="button" className="action secondary" data-demo-particles={kind} key={kind} onClick={event => { setFxBatch(current => ({ id: (current?.id ?? 0) + 1, events: demoFx[kind].events, waiting: null })); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Thử {demoFx[kind].label}</button>)}<button type="button" className="action secondary" data-demo-particles="ambient" aria-pressed={ambientEnabled} onClick={event => { setAmbientEnabled(!ambientEnabled); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{ambientEnabled ? 'Tắt bụi / than hồng' : 'Bật bụi / than hồng'}</button></fieldset><fieldset className="demo-fx-controls demo-motion-controls" onClick={event => event.currentTarget.closest('details')?.removeAttribute('open')}><legend>Thử chuyển động giao diện</legend>
      <button type="button" className="action secondary" data-demo-motion="deal" onClick={(event) => { setFxBatch(current => ({ id: (current?.id ?? 0) + 1, events: [demoEvents.game_started], waiting: null })); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Chia bài</button>
      <button type="button" className="action secondary" data-demo-motion="add" onClick={() => setUi(current => ({ ...current, hand: Math.min(8, current.hand + 1) }))}>Thêm lá trên tay</button>
      <button type="button" className="action secondary" data-demo-motion="remove" onClick={() => setUi(current => ({ ...current, hand: Math.max(-5, current.hand - 1) }))}>Bớt lá trên tay</button>
      <button type="button" className="action secondary" data-demo-motion="equipment" onClick={() => setUi(current => ({ ...current, equipment: !current.equipment }))}>Đổi trang bị</button>
      <button type="button" className="action secondary" data-demo-motion="health" onClick={() => setUi(current => ({ ...current, health: !current.health }))}>Đổi máu</button>
      <button type="button" className="action secondary" data-demo-motion="stock" onClick={() => setUi(current => ({ ...current, stock: !current.stock }))}>Đổi bộ rút / chồng bỏ</button>
      <button type="button" className="action secondary" data-demo-motion="journal" onClick={() => document.querySelector<HTMLButtonElement>('.table-tools button[aria-label="Mở nhật ký"]')?.click()}>Mở / đóng nhật ký</button>
      <button type="button" className="action secondary" data-demo-motion="menu" onClick={() => document.querySelector<HTMLButtonElement>('.table-tools button[aria-label="Cài đặt phòng"]')?.click()}>Mở / đóng cài đặt</button>
      <button type="button" className="action secondary" data-demo-motion="detail" onClick={() => document.querySelector<HTMLButtonElement>('.detail-close, .own-hand .game-card')?.click()}>Mở / đóng chi tiết lá</button>
      <button type="button" className="action secondary" data-demo-motion="eliminate" onClick={() => setFxBatch(current => ({ id: (current?.id ?? 0) + 1, events: demoFx.eliminate.events, waiting: null }))}>Bị loại</button>
    </fieldset><fieldset className="demo-fx-controls demo-sound-controls"><legend>Thử âm thanh</legend>{(Object.keys(soundCues) as SoundKind[]).map(kind => <button type="button" className="action secondary" data-demo-sound={kind} key={kind} onClick={() => { soundSequence.forEach(clearTimeout); sound.stop(); void sound.play(kind); }}>{soundLabels[kind]}</button>)}<button type="button" className="action" data-demo-sound="sequence" onClick={() => { soundSequence.forEach(clearTimeout); sound.stop(); setSoundSequence((['card', 'shot', 'missed', 'hit', 'clink', 'jail'] as SoundKind[]).map((kind, i) => window.setTimeout(() => { void sound.play(kind); }, i * 1000))); }}>Phát chuỗi âm thanh</button></fieldset></details>
    {actionError && <p className="demo-drag-error" role="alert">{actionError}</p>}
    <GameBoard ambientEnabled={ambientEnabled} requestVersion={requestVersion} pending={pending} disabled={pending} actionError={actionError} key={`${mode}:${count}`} game={game} room={room} log={log} fxBatch={fxBatch} viewer={spectator ? null : 0} sendAction={(action) => { setSent({ v: PROTOCOL_VERSION, type: 'game_action', action }); setActionError(null); setPending(true); setTrial(current => ({ id: (current?.id ?? 0) + 1, action })); }} endGame={() => setSent({ v: PROTOCOL_VERSION, type: 'end_game' })} />
    {sent && <output className="demo-action-log" aria-label="Hành động thử">{JSON.stringify(sent, null, 2)}</output>}
  </main>;
}
