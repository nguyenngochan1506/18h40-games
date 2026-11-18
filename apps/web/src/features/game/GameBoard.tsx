import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Action, CardId, CardKind, GameSnapshot, PublicPlayer, RoomView, SpectatorView } from '../../generated/protocol';
import { assetUrl, sceneFiles, backFiles, cardFiles, characterFiles, roleFiles } from './assetMap';
import { cardFace } from './cardCatalog';
import { cards, characters, roles } from './i18n';
import { selectGameView } from './state';
import { actionMode, emptyDraft, needsTarget, playKind, responseCard } from './actions';
import type { ActionDraft } from './actions';
import GameControls from './GameControls';
import GameLog from './GameLog';
import GameResult from './GameResult';
import type { LogEntry } from './log';
import { Icon } from './TableIcons';
import { seatLayout } from './layout';
import './game.css';

type Inspect = (kind: CardKind, scroll?: boolean, origin?: HTMLButtonElement) => void;

function Artwork({ file, label }: { file: string; label: string }) {
  const [missing, setMissing] = useState(false);
  return <span className="game-art">{missing
    ? <span className="game-art-fallback"><small>BANG!</small><strong>{label}</strong></span>
    : <img src={assetUrl(file)} alt={label} onError={() => setMissing(true)} loading="lazy" />}</span>;
}

function Card({ id, inspect, pick, picked = false, style }: { id: CardId; inspect: Inspect; pick?: () => void; picked?: boolean; style?: CSSProperties }) {
  const face = cardFace(id);
  if (!face) return <span className="unknown-card">Lá bài chưa xác định</span>;
  const card = cards[face.kind];
  return <button type="button" className={`game-card${picked ? ' is-picked' : ''}`} style={style} data-card-id={id} aria-pressed={pick ? picked : undefined} aria-label={`${pick ? 'Chọn' : 'Xem'} ${card.name}, ${face.rank}${face.suit}`} title={`${card.name}: ${card.effect}`}
    onMouseEnter={(event) => inspect(face.kind, false, event.currentTarget)} onFocus={(event) => inspect(face.kind, false, event.currentTarget)} onClick={(event) => { inspect(face.kind, !pick, event.currentTarget); pick?.(); }}>
    <Artwork file={cardFiles[face.kind]} label={card.name} />
    <span className={face.suit === '♥' || face.suit === '♦' ? 'card-face red-suit' : 'card-face'}>{face.rank}{face.suit}</span>
    <span className="card-name">{card.name}</span>
  </button>;
}

function waitText(table: SpectatorView, name: (id: number) => string): string {
  if (table.winner) {
    if (table.winner === 'sheriff_and_deputies') return 'Cảnh sát trưởng và Phó cảnh sát thắng';
    return table.winner === 'outlaws' ? 'Tội phạm thắng' : 'Kẻ phản bội thắng';
  }
  const decision = table.waiting;
  if (!decision) return 'Đang cập nhật bàn chơi';
  const who = `Đang chờ ${name(decision.player)}...`;
  switch (decision.kind.type) {
    case 'turn': return `${who} Lượt chơi.`;
    case 'attack_response': return `${who} ${decision.kind.kind === 'indians' ? 'Bỏ 1 BANG! hoặc mất 1 máu' : decision.kind.remaining > 1 ? `Cần thêm ${decision.kind.remaining} lá Missed! nữa` : 'Đỡ bằng Missed!, hoặc chịu đòn'}`;
    case 'duel': return `${who} Duel: bỏ 1 BANG! hoặc mất 1 máu.`;
    case 'dying': return `${who} Dùng Beer để sống, hoặc chấp nhận bị loại.${table.players.find((player) => player.id === decision.player)?.character === 'sid_ketchum' ? ' Hoặc bỏ 2 lá để hồi máu.' : ''}`;
    case 'general_store': return `${who} Chọn 1 lá.`;
    case 'draw_choice': return `${who} Chọn nơi rút lá đầu.`;
    case 'keep_cards': return `${who} Chọn ${decision.kind.keep} lá để giữ.`;
    case 'choose_draw_result': return `${who} Chọn 1 lá lật kiểm tra.`;
  }
}

function Bullets({ player }: { player: PublicPlayer }) {
  return <div className="bullets" aria-label={`${player.health} trên ${player.max_health} máu`}>
    <span className="bullet-icons" aria-hidden="true">{Array.from({ length: player.max_health }, (_, i) => <i key={i} className={i < player.health ? '' : 'spent'} />)}</span><span className="life-count">{Math.max(0, player.health)}/{player.max_health}</span>
  </div>;
}

function Seat({ player, nickname, own, turn, waiting, presence, inspect, inspectPlayer, chooseTarget, targetSelected, disabled }: {
  player: PublicPlayer; nickname: string; own: boolean; turn: boolean; waiting: boolean; presence: string; inspect: Inspect; inspectPlayer: (player: PublicPlayer, origin: HTMLButtonElement) => void; chooseTarget?: () => void; targetSelected: boolean; disabled: boolean;
}) {
  return <article className={`game-seat${!player.alive ? ' eliminated' : ''}${own ? ' own-seat' : ''}${turn ? ' has-turn' : ''}${waiting ? ' is-waiting' : ''}${targetSelected ? ' is-targeted' : ''}`} aria-label={`${nickname}${own ? ', bạn' : ''}${!player.alive ? ', đã bị loại' : ''}${turn ? ', đang có lượt' : ''}${waiting ? ', đang chờ' : ''}`}>
    {!own && <div className="seat-actor" aria-hidden="true"><img className={`cowboy${!player.alive ? ' ghost' : ''}`} src={player.alive ? sceneFiles.cowboy : sceneFiles.ghost} alt="" decoding="async" style={{ transform: player.id % 2 ? 'scaleX(-1)' : undefined, filter: player.alive ? `brightness(${.88 + player.id % 3 * .06}) hue-rotate(${player.id % 3 * 3}deg)` : undefined }} /></div>}{(waiting || targetSelected) && <span className="crosshair" aria-hidden="true" />}
    <span className="seat-anchor" data-animation-anchor={player.id} aria-hidden="true" />
    <button type="button" className={`seat-person${chooseTarget ? ' seat-target' : ''}`} aria-label={chooseTarget ? `Nhắm tới ${nickname}` : `Xem nhân vật ${nickname}`} aria-pressed={chooseTarget ? targetSelected : undefined} disabled={!!chooseTarget && disabled} onClick={(event) => chooseTarget ? chooseTarget() : inspectPlayer(player, event.currentTarget)}>
      <span className="seat-card-row"><span className="character-tile"><Artwork file={characterFiles[player.character]} label={characters[player.character].name} /></span>
        <span className={`role-tile${player.role ? ' revealed' : ' concealed'}`}><Artwork key={player.role ?? 'hidden'} file={player.role ? roleFiles[player.role] : backFiles.role} label={player.role ? roles[player.role].name : 'Vai chưa lộ'} />{!player.role && <span className="role-question" aria-hidden="true"><Icon name="star" /><b>?</b></span>}{player.role === 'sheriff' && <span className="sheriff-stamp">SHERIFF</span>}</span>
        <span className="hand-count" aria-label={`${player.hand_count} lá trên tay`}><i aria-hidden="true" />{player.hand_count}</span>
      </span>
      <span className="name-ribbon" title={`${characters[player.character].name} · ${nickname}`}><strong>{characters[player.character].name}</strong><small>{nickname}{own ? ' (bạn)' : ''}</small></span>
      <Bullets player={player} />
      <span className="seat-presence">{!player.alive ? 'Hồn ma' : turn ? 'Đang có lượt' : presence}</span>
      <span className="range-hint" title={`Tầm vũ khí của ${nickname}`}>Tầm bắn: {player.weapon_range}</span>
    </button>
    <div className="in-play" aria-label={`Bài trước mặt ${nickname}`}>{player.in_play.map((card) => <Card key={card} id={card} inspect={inspect} />)}</div>
  </article>;
}

export default function GameBoard({ game, room, disabled = false, sendAction, log = [], viewer = game.view.perspective === 'player' ? game.view.view.you : null, endGame, roomMenu }: { game: GameSnapshot; room: RoomView; disabled?: boolean; sendAction?: (action: Action) => void; log?: LogEntry[]; viewer?: number | null; endGame?: () => void; roomMenu?: ReactNode }) {
  const { table, you, hand, choices } = selectGameView(game.view);
  const [selected, setSelected] = useState<CardKind | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const journalButton = useRef<HTMLButtonElement>(null);
  const inspectedOrigin = useRef<HTMLButtonElement | null>(null);
  const restoringFocus = useRef(false);
  const [choice, setChoice] = useState<{ seq: number; draft: ActionDraft }>({ seq: game.seq, draft: emptyDraft });
  const draft = choice.seq === game.seq ? choice.draft : emptyDraft;
  const setDraft = (value: ActionDraft) => setChoice({ seq: game.seq, draft: value });
  const mode = actionMode(game);
  const locked = disabled || !sendAction;
  const targetMode = !locked && mode === 'turn' && !draft.discarding && !draft.healing && draft.card !== null && needsTarget(game, draft.card);
  const targetSelf = draft.card !== null && ['panic', 'cat_balou'].includes(playKind(game, draft.card) ?? '');
  const chooseHand = (id: CardId) => {
    if (locked) return;
    if (draft.discarding || draft.healing) setDraft({ ...draft, discard: draft.discard.includes(id) ? draft.discard.filter((card) => card !== id) : [...draft.discard, id] });
    else setDraft({ ...emptyDraft, card: draft.card === id ? null : id });
  };
  const choosePool = (id: CardId) => {
    if (locked || draft.healing) return;
    if (mode === 'keep_cards') setDraft({ ...draft, kept: draft.kept.includes(id) ? draft.kept.filter((card) => card !== id) : [...draft.kept, id] });
    else setDraft({ ...draft, card: draft.card === id ? null : id });
  };
  const inspect: Inspect = (kind, _scroll, origin) => {
    if (restoringFocus.current) return;
    setSelected(kind); setSelectedPlayer(null);
    if (origin) inspectedOrigin.current = origin;
  };
  const closeDetail = () => { restoringFocus.current = true; setSelected(null); setSelectedPlayer(null); inspectedOrigin.current?.focus({ preventScroll: true }); restoringFocus.current = false; };
  const toggleJournal = () => { setJournalOpen(!journalOpen); if (journalOpen) journalButton.current?.focus({ preventScroll: true }); };
  const own = table.players.find((player) => player.id === viewer);
  const inspectingPlayer = table.players.find((player) => player.id === selectedPlayer);
  const viewerIndex = table.players.findIndex((player) => player.id === viewer);
  const positions = seatLayout(table.players.length, viewerIndex < 0 ? null : viewerIndex);
  const gun = own?.in_play.map(cardFace).find((face) => face && ['volcanic', 'schofield', 'remington', 'rev_carabine', 'winchester'].includes(face.kind));
  const distanceEffects = own ? [own.in_play.some((id) => cardFace(id)?.kind === 'mustang') && 'Mustang +1', own.in_play.some((id) => cardFace(id)?.kind === 'scope') && 'Scope −1', own.character === 'paul_regret' && 'Paul Regret +1', own.character === 'rose_doolan' && 'Rose Doolan −1'].filter(Boolean).join(' · ') : '';
  const name = (id: number) => `${game.seats.find((seat) => seat.player_id === id)?.nickname ?? `Ghế ${id + 1}`}${id === you ? ' (bạn)' : ''}`;
  const status = waitText(table, name);
  return <section className={`bang-board saloon-board seats-${table.players.length}${journalOpen ? ' journal-open' : ''}${you === null ? ' spectator-board' : ''}`} aria-label="Bàn chơi BANG!" onKeyDown={(event) => { if (event.key === 'Escape' && (selected || inspectingPlayer)) closeDetail(); }}>
    <div className="saloon-scene" aria-hidden="true"><img className="saloon-room" src={sceneFiles.background} alt="" decoding="async" /><div className="saloon-vignette" /></div>
    <header className="board-heading"><p className="game-eyebrow">Phòng {room.code} · {table.players.length} người</p><h2>BANG!</h2><span className="view-label">{you === null ? 'Góc nhìn khán giả' : 'Miền Tây chờ bạn'}</span></header>
    {own && <aside className="player-hud" aria-label="Thông tin của bạn"><div className="hud-gun"><Icon name="gun" /><span>{gun ? cards[gun.kind].name : 'Colt .45'}<strong>Tầm bắn: {own.weapon_range}</strong></span></div><div className="hud-health"><span>Máu</span><Bullets player={own} /></div><div className="hud-distance" title={distanceEffects || 'Không có hiệu chỉnh'}><Icon name="horse" /><span>{distanceEffects || 'Không có hiệu chỉnh'}</span></div></aside>}
    <nav className="table-tools" aria-label="Công cụ bàn chơi"><button type="button" className="round-control" title="Mở nhật ký" aria-label="Mở nhật ký" aria-expanded={journalOpen} aria-controls="table-journal" ref={journalButton} onClick={toggleJournal}><Icon name="log" /></button><button type="button" className="round-control" popoverTarget="room-menu" title="Cài đặt phòng" aria-label="Cài đặt phòng"><Icon name="gear" /></button></nav>
    <div id="room-menu" className="room-menu wood-panel" popover="auto">{roomMenu ?? <><h3>Phòng {room.code}</h3><a className="action secondary" href="/">Về phòng</a></>}</div>
    {!table.winner && <div className="game-wait" role="status" aria-live="polite"><span aria-hidden="true">✦</span><p>{status}</p></div>}
    <div className="table-stage">
      <img className="wooden-table" src={sceneFiles.table} alt="" aria-hidden="true" decoding="async" />
      <section className="table-center" aria-label="Bộ rút và chồng bỏ"><span className="map-compass" aria-hidden="true">✥</span><div className="pile-row"><div className="draw-pile"><Artwork file={backFiles.card} label="Bộ rút" /><strong>Bộ rút</strong><span>{table.draw_count} lá</span></div><div className="discard-pile">{table.discard_top !== null ? <Card id={table.discard_top} inspect={inspect} /> : <span className="empty-pile">{table.discard_count ? 'Lá đỉnh giữ kín' : 'Chưa có lá bỏ'}</span>}<strong>Chồng bỏ</strong><span>{table.discard_count} lá</span></div></div></section>
      <div className="game-arena">
        {table.players.map((player, i) => {
          const seat = game.seats.find((seat) => seat.player_id === player.id);
          const member = room.members.find((member) => member.id === seat?.member_id);
          const position = positions[i];
          const style = { '--seat-x': `${position.x}%`, '--seat-y': `${position.y}%`, '--portrait-x': `${position.portraitX}%`, '--portrait-y': `${position.portraitY}%`, '--landscape-y': `${position.landscapeY}%`, '--actor-x': `${position.outwardX * 44}px`, '--actor-y': `${position.outwardY * 56}px`, '--lean': `${-position.outwardX * 10}deg`, '--equipment-x': `${position.outwardX > .1 ? -92 : 92}px` } as CSSProperties;
          return <div className="seat-position" key={player.id} style={style} data-player-id={player.id}><Seat player={player} nickname={seat?.nickname ?? `Ghế ${player.id + 1}`} own={player.id === viewer} turn={!table.winner && table.turn.player === player.id} waiting={!table.winner && table.waiting?.player === player.id && table.waiting.kind.type !== 'turn'} presence={member ? member.online ? 'Đang kết nối' : 'Mất kết nối' : 'Đã rời phòng'} inspect={inspect} inspectPlayer={(player, origin) => { setSelected(null); setSelectedPlayer(player.id); inspectedOrigin.current = origin; }} disabled={locked} targetSelected={draft.target === player.id} chooseTarget={targetMode && player.alive && (player.id !== you || targetSelf) ? () => { setDraft({ ...draft, target: player.id, selection: null }); setSelected(null); } : undefined} /></div>;
        })}
      </div>
    </div>
    {own && <aside className="own-identity wood-panel" aria-label="Vai và nhân vật của bạn"><div className="role-medallion"><Icon name="star" /><strong>{own.role ? roles[own.role].name : 'Vai chưa lộ'}</strong></div><div className="identity-copy"><Artwork file={characterFiles[own.character]} label={characters[own.character].name} /><small>BẠN</small><h3>{characters[own.character].name}</h3><Bullets player={own} />{!own.alive && <span>Hồn ma</span>}</div></aside>}
    {you === null && !own && <p className="spectator-plaque wood-panel">Bạn đang xem ván chơi</p>}
    {you !== null && <section className="own-hand hand-tray wood-panel" aria-label="Bài trên tay của bạn"><div className="section-heading"><h3>Bài trên tay của bạn</h3><span>{hand.length} lá</span></div><div className="hand-cards">{hand.map((id, index) => <Card key={id} id={id} inspect={inspect} style={{ '--fan-angle': `${Math.max(-12, Math.min(12, (index - (hand.length - 1) / 2) * 4))}deg` } as CSSProperties} picked={draft.discarding || draft.healing ? draft.discard.includes(id) : draft.card === id} pick={!locked && (draft.healing || (mode === 'turn' && (draft.discarding || playKind(game, id))) || (mode === 'response' && responseCard(game, id))) ? () => chooseHand(id) : undefined} />)}{!hand.length && <p>Bạn chưa có bài trên tay.</p>}</div></section>}
    {(you !== null || table.store_pool.length > 0) && <div className={`decision-overlay${mode === 'turn' && draft.card === null && !draft.discarding && !draft.healing ? ' quiet-controls' : ''}${mode === 'waiting' && !draft.healing ? ' waiting-controls' : ''}`}>
      {!!table.store_pool.length && <section className="decision-pool" aria-label="General Store"><h3>General Store · Bài công khai</h3><div className="hand-cards">{table.store_pool.map((id) => <Card key={id} id={id} inspect={inspect} picked={mode === 'general_store' && draft.card === id} pick={!locked && !draft.healing && mode === 'general_store' ? () => choosePool(id) : undefined} />)}</div></section>}
      {!!choices.length && <section className="decision-pool" aria-label="Bài đang xem riêng"><h3>Bài đang xem riêng</h3><p>Chỉ bạn thấy các lá này. Chạm để chọn rồi xác nhận.</p><div className="hand-cards">{choices.map((id) => <Card key={id} id={id} inspect={inspect} picked={mode === 'keep_cards' ? draft.kept.includes(id) : draft.card === id} pick={!locked && !draft.healing && (mode === 'keep_cards' || mode === 'choose_draw_result') ? () => choosePool(id) : undefined} />)}</div></section>}
      {you !== null && <div className="game-input"><GameControls game={game} draft={draft} disabled={locked} setDraft={setDraft} sendAction={(action) => { setSelected(null); setSelectedPlayer(null); sendAction?.(action); }} /></div>}
    </div>}
    {(selected || inspectingPlayer) && <aside className="card-detail parchment" aria-label="Chi tiết lá bài"><button type="button" className="detail-close" aria-label="Đóng chi tiết lá" onClick={closeDetail}>×</button>{selected ? <><Artwork key={selected} file={cardFiles[selected]} label={cards[selected].name} /><h3>{cards[selected].name}</h3><p>{cards[selected].effect}</p></> : inspectingPlayer && <><Artwork key={inspectingPlayer.character} file={characterFiles[inspectingPlayer.character]} label={characters[inspectingPlayer.character].name} /><h3>{characters[inspectingPlayer.character].name}</h3><p>{characters[inspectingPlayer.character].ability}</p><p>Tầm bắn: {inspectingPlayer.weapon_range} · {inspectingPlayer.hand_count} lá trên tay</p></>}</aside>}
    <div id="table-journal"><GameLog entries={log} expanded={journalOpen} onToggle={toggleJournal} /></div>
    {table.winner && <div className="result-overlay"><GameResult game={game} room={room} viewer={viewer} disabled={disabled} endGame={endGame} /></div>}
  </section>;
}
