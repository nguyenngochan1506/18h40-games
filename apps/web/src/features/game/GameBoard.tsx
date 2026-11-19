import { Fragment, forwardRef, lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m, useIsPresent, useDragControls } from 'motion/react';
import { GameMotion, MotionCount, MotionPanel, tableSpring, useTableMotion } from './GameMotion';
import GameDeal from './GameDeal';
import GameTooltip from './GameTooltip';
import { tableShortcut } from './tablePolish';
import { turnBanner } from './turnBanner';
import { DecodedImage } from '../../shared/SaloonScene';
import { cardFlight, handPose } from './tableMotion';
import type { CSSProperties, ReactNode } from 'react';
import type { Action, CardId, CardKind, GameSnapshot, PublicPlayer, RoomView, SpectatorView } from '../../generated/protocol';
import { assetUrl, sceneFiles, landscapeScenes, seatActorFile, backFiles, cardFiles, characterFiles, roleFiles } from './assetMap';
import { cardFace } from './cardCatalog';
import { cards, characters, roles } from './i18n';
import { selectGameView } from './state';
import { actionMode, emptyDraft, needsTarget, playKind, responseCard, playTargets } from './actions';
import type { ActionDraft } from './actions';
import { dragDestination } from './cardDrag';
import { useCardDrag } from './useCardDrag';
import type { CardDrag } from './useCardDrag';
import GameControls from './GameControls';
import GameLog from './GameLog';
import GameFx from './GameFx';
import GameSound, { SoundControls } from './GameSound';
import type { FxBatch } from './fx';
import type { LogEntry } from './log';
import { Icon } from './TableIcons';
import { seatLayout } from './layout';
import { sceneStage } from './sceneStage';
import { sceneSeatLayout } from './sceneSeats';
import type { SeatView } from './assetMap';
import './game.css';
import './cinematic.css';
import './tableMotion.css';
import './cardDrag.css';
import './polish.css';

const StorePool = lazy(() => import('./StorePool'));
const GameResult = lazy(() => import('./GameResult'));

type Inspect = (kind: CardKind, scroll?: boolean, origin?: HTMLButtonElement) => void;

function Artwork({ file, label }: { file: string; label: string }) {
  const [missing, setMissing] = useState(false);
  return <span className="game-art">{missing
    ? <span className="game-art-fallback"><small>BANG!</small><strong>{label}</strong></span>
    : <DecodedImage src={assetUrl(file)} alt={label} onError={() => setMissing(true)} loading="lazy" />}</span>;
}

function CowboyPortrait({ player, view, flip = false }: { player: PublicPlayer; view?: SeatView; flip?: boolean }) {
  const animated = useTableMotion();
  return <span className="actor-portrait" style={{ transform: (view ? flip : player.id % 2) ? 'scaleX(-1)' : undefined }}><AnimatePresence initial={false}>
    <m.span key={player.alive ? 'cowboy' : 'ghost'} className={`cowboy${!player.alive ? ' ghost' : ''}`} data-ui-motion="actor"
      initial={{ opacity: 0 }} animate={{ opacity: player.alive ? 1 : .6 }} exit={{ opacity: 0 }} transition={{ duration: animated ? .2 : .1 }}><DecodedImage src={view ? seatActorFile(player.id, view, !player.alive) : player.alive ? sceneFiles.cowboy : sceneFiles.ghost} onError={(event) => { if (player.alive && event.currentTarget.getAttribute('src') !== sceneFiles.cowboy) event.currentTarget.src = sceneFiles.cowboy; }} /></m.span>
  </AnimatePresence></span>;
}

function RoomMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div id="room-menu" className="room-menu wood-panel ui-popover" popover="auto" onBeforeToggle={event => setOpen(event.newState === 'open')}><AnimatePresence>{open && <MotionPanel key="menu" className="ui-menu-content">{children}</MotionPanel>}</AnimatePresence></div>;
}

type CardProps = { id: CardId; inspect: Inspect; pick?: () => void; picked?: boolean; style?: CSSProperties; handIndex?: number; handCount?: number; dragCard?: CardDrag; hidden?: boolean };
const Card = forwardRef<HTMLButtonElement, CardProps>(function Card({ id, inspect, pick, picked = false, style, handIndex, handCount = 0, dragCard, hidden = false }, ref) {
  const animated = useTableMotion();
  const present = useIsPresent();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const dragControls = useDragControls();
  const button = useRef<HTMLButtonElement | null>(null), home = useRef({ x: 0, y: 0, width: 0, height: 0 }), draggedAt = useRef(-Infinity);
  const [returning, setReturning] = useState(false), [dragging, setDragging] = useState(false), [rejected, setRejected] = useState(false);
  useEffect(() => { if (!dragCard) { dragControls.cancel(); setDragging(false); } }, [!!dragCard, dragControls]);
  useEffect(() => { if (dragging && !dragCard?.active) dragControls.stop(); }, [dragging, dragCard?.active, dragControls]);
  const face = cardFace(id);
  if (!face) return <span className="unknown-card">Lá bài chưa xác định</span>;
  const card = cards[face.kind];
  const hand = handIndex !== undefined;
  return <m.button ref={node => { button.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node; }} type="button" className={`game-card${animated ? ' ui-card' : ''}${picked ? ' is-picked' : ''}${dragCard ? ' can-drag' : ''}${dragging ? ' card-dragging' : ''}${returning ? ' card-returning' : ''}${hidden ? ' card-flight-source' : ''}`} style={{ ...style, visibility: hidden ? 'hidden' : undefined, touchAction: dragCard ? 'none' : undefined }} data-card-id={id} data-ui-motion="card" inert={!present} aria-hidden={!present || undefined} aria-pressed={pick ? picked : undefined} aria-label={`${pick ? 'Chọn' : 'Xem'} ${card.name}, ${face.rank}${face.suit}`} data-tip={`card:${face.kind}`}
    drag={!!dragCard} dragControls={dragControls} dragListener={false} dragMomentum={false} dragSnapToOrigin dragTransition={animated ? { bounceStiffness: 520, bounceDamping: 36 } : { timeConstant: 0, bounceStiffness: 100000, bounceDamping: 1000 }}
    onPointerDown={event => { if (dragCard && event.button === 0) { home.current = event.currentTarget.getBoundingClientRect(); dragControls.start(event, { distanceThreshold: 6 }); } }}
    onDragStart={() => { setDragging(true); dragCard?.start(home.current); }} onDrag={(_event, info) => dragCard?.move(info.point)} onDragEnd={(event, info) => { draggedAt.current = performance.now(); setDragging(false); setReturning(true); if (!dragCard?.end(event.type === 'pointercancel' ? { x: NaN, y: NaN } : info.point, button.current!.getBoundingClientRect()) && animated) setRejected(true); }}
    onDragTransitionEnd={() => setReturning(false)}
    layout={animated && hand && !dragging ? 'position' : false} initial={{ opacity: animated ? 0 : 1, ...cardFlight(hand, !animated) }} animate={{ opacity: 1, x: 0, y: 0, rotate: !animated && hand ? handPose(handIndex!, handCount, false, false, true).rotate : 0 }} exit={{ opacity: 0, x: 0, y: animated ? -32 : 0, rotate: animated ? 8 : 0 }} transition={animated ? { ...tableSpring, opacity: { duration: .15 } } : { duration: .1 }} whileTap={animated ? { scale: .97 } : undefined}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onClick={(event) => { if (event.detail > 0 && (dragging || performance.now() - draggedAt.current < 200)) return; if (pick) pick(); else inspect(face.kind, true, event.currentTarget); }}>
    <m.span className="card-visual" data-ui-motion="visual" onAnimationComplete={() => { if (rejected) setRejected(false); }} animate={{ x: animated && rejected ? [0, -4, 4, -2, 0] : 0, ...(animated ? dragging ? { y: 0, rotate: 0, scale: 1.04 } : hand ? handPose(handIndex!, handCount, picked, hovered || focused, false) : { y: hovered || focused || picked ? -3 : 0, rotate: 0, scale: 1 } : { y: 0, rotate: 0, scale: 1 }) }} transition={rejected ? { duration: .2 } : tableSpring}>
      {handIndex !== undefined && handIndex < 9 && <kbd className="hand-shortcut" aria-hidden="true">{handIndex + 1}</kbd>}<Artwork file={cardFiles[face.kind]} label={card.name} />
      <span className={face.suit === '♥' || face.suit === '♦' ? 'card-face red-suit' : 'card-face'}>{face.rank}{face.suit}</span>
      <span className="card-name">{card.name}</span>
    </m.span>
  </m.button>;
});

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
    case 'general_store': return `${who} Chọn 1 lá úp.`;
    case 'pick_hand_slot': return `${who} Chọn một lá úp trên tay ${name(decision.kind.target)}.`;
    case 'check': return `${who} Lật kiểm tra cho ${cards[decision.kind.reason].name}.`;
    case 'draw_choice': return `${who} Chọn nơi rút lá đầu.`;
    case 'keep_cards': return `${who} Chọn ${decision.kind.keep} lá để giữ.`;
    case 'choose_draw_result': return `${who} Chọn 1 lá lật kiểm tra.`;
  }
}

function Bullets({ player, focusable = true }: { player: PublicPlayer; focusable?: boolean }) {
  const animated = useTableMotion();
  return <div className="bullets" role="img" data-tip={`health:${Math.max(0, player.health)}:${player.max_health}`} tabIndex={focusable ? 0 : undefined} data-animation-region={`health-${player.id}`} aria-label={`${player.health} trên ${player.max_health} máu`}>
    <span className="bullet-icons" aria-hidden="true">{Array.from({ length: player.max_health }, (_, i) => <m.i key={i} className={i < player.health ? '' : 'spent'} initial={false} animate={{ opacity: i < player.health ? 1 : .25, scaleY: animated ? i < player.health ? 1 : .55 : 1 }} transition={animated ? tableSpring : { duration: .1 }} style={{ originY: 1 }} data-ui-motion="bullet" />)}</span><span className="life-count"><MotionCount value={Math.max(0, player.health)} />/{player.max_health}</span>
  </div>;
}

function Seat({ player, nickname, own, turn, waiting, presence, inspect, inspectPlayer, chooseTarget, targetSelected, disabled, scene = false }: {
  player: PublicPlayer; nickname: string; own: boolean; turn: boolean; waiting: boolean; presence: string; inspect: Inspect; inspectPlayer: (player: PublicPlayer, origin: HTMLButtonElement) => void; chooseTarget?: () => void; targetSelected: boolean; disabled: boolean; scene?: boolean;
}) {
  const animated = useTableMotion();
  return <article className={`game-seat${!player.alive ? ' eliminated' : ''}${own ? ' own-seat' : ''}${turn ? ' has-turn' : ''}${waiting ? ' is-waiting' : ''}${targetSelected ? ' is-targeted' : ''}`} aria-label={`${nickname}${own ? ', bạn' : ''}${!player.alive ? ', đã bị loại' : ''}${turn ? ', đang có lượt' : ''}${waiting ? ', đang chờ' : ''}`}>
    {!own && !scene && <div className="seat-actor" aria-hidden="true"><CowboyPortrait player={player} /></div>}<AnimatePresence>{(waiting || targetSelected) && (!scene || own) && <m.span key="crosshair" className="crosshair" data-ui-motion="crosshair" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }} />}</AnimatePresence>
    <span className="seat-anchor" data-animation-anchor={!scene || own ? player.id : undefined} aria-hidden="true" />
    <button type="button" data-tip={`character:${player.character}`} className={`seat-person${chooseTarget ? ' seat-target' : ''}`} aria-label={chooseTarget ? `Nhắm tới ${nickname}` : `Xem nhân vật ${nickname}`} aria-pressed={chooseTarget ? targetSelected : undefined} disabled={!!chooseTarget && disabled} onClick={(event) => chooseTarget ? chooseTarget() : inspectPlayer(player, event.currentTarget)}>
      <AnimatePresence>{turn && <m.span className="ui-turn-badge" data-ui-motion="badge" layoutId={animated ? "turn-badge" : undefined} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={tableSpring} aria-hidden="true">✦</m.span>}</AnimatePresence><span className="seat-card-row"><span className="character-tile"><Artwork file={characterFiles[player.character]} label={characters[player.character].name} /></span>
        <span data-tip={`role:${player.role ?? 'hidden'}`} className={`role-tile${player.role ? ' revealed' : ' concealed'}`}><Artwork key={player.role ?? 'hidden'} file={player.role ? roleFiles[player.role] : backFiles.role} label={player.role ? roles[player.role].name : 'Vai chưa lộ'} />{!player.role && <span className="role-question" aria-hidden="true"><Icon name="star" /><b>?</b></span>}{player.role === 'sheriff' && <span className="sheriff-stamp">CẢNH SÁT</span>}</span>
        <span className="hand-count" aria-label={`${player.hand_count} lá trên tay`}><i aria-hidden="true" /><MotionCount value={player.hand_count} /></span>
      </span>
      <span className="name-ribbon" title={`${characters[player.character].name} · ${nickname}`}><strong>{characters[player.character].name}</strong><small>{nickname}{own ? ' (bạn)' : ''}</small></span>
      <Bullets player={player} focusable={false} />
      <span className="seat-presence">{!player.alive ? 'Hồn ma' : turn ? 'Đang có lượt' : presence}</span>
      <span className="range-hint" title={`Tầm vũ khí của ${nickname}`}>Tầm bắn: {player.weapon_range}</span>
    </button>
    <div className="in-play" data-animation-region={`equipment-${player.id}`} aria-label={`Bài trước mặt ${nickname}`}><AnimatePresence initial={false} mode="popLayout">{player.in_play.map((card) => <Card key={card} id={card} inspect={inspect} />)}</AnimatePresence></div>
  </article>;
}

export default function GameBoard({ game, room, disabled = false, sendAction, log = [], fxBatch = null, soundBatch = fxBatch, fxEnabled = true, ambientEnabled = true, viewer = game.view.perspective === 'player' ? game.view.view.you : null, endGame, roomMenu, pending = false, requestVersion = 0, actionError = null }: { game: GameSnapshot; room: RoomView; disabled?: boolean; pending?: boolean; requestVersion?: number; actionError?: string | null; sendAction?: (action: Action) => void; log?: LogEntry[]; fxBatch?: FxBatch | null; soundBatch?: FxBatch | null; fxEnabled?: boolean; ambientEnabled?: boolean; viewer?: number | null; endGame?: () => void; roomMenu?: ReactNode }) {
  const { table, you, hand, choices } = selectGameView(game.view);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const stage = sceneStage(viewport.width, viewport.height);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<CardKind | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [effectsEnabled, setEffectsEnabled] = useState(true);
  const [journalOpen, setJournalOpen] = useState(false);
  const journalButton = useRef<HTMLButtonElement>(null);
  const journalScroll = useRef({ following: true, top: 0 });
  const inspectedOrigin = useRef<HTMLButtonElement | null>(null);
  const restoringFocus = useRef(false);
  const [choice, setChoice] = useState<{ seq: number; draft: ActionDraft }>({ seq: game.seq, draft: emptyDraft });
  const draft = choice.seq === game.seq ? choice.draft : emptyDraft;
  const setDraft = (value: ActionDraft) => setChoice({ seq: game.seq, draft: value });
  const mode = actionMode(game);
  const locked = disabled || !sendAction;
  const targetMode = !locked && mode === 'turn' && !draft.discarding && !draft.healing && draft.card !== null && needsTarget(game, draft.card);
  const targetIds = draft.card === null ? [] : playTargets(game, draft.card).map(player => player.id);
  const drag = useCardDrag({ root: sceneRef, game, draft, locked, ready: fxEnabled, requestVersion, error: actionError, desktop: !!stage, setDraft, send: action => sendAction?.(action), clearDetail: () => { setSelected(null); setSelectedPlayer(null); } });
  const dropDestination = drag.dragging === null ? null : dragDestination(game, draft, drag.dragging, locked);
  const dropTargets = dropDestination === 'player' && drag.dragging !== null ? playTargets(game, drag.dragging).map(player => player.id) : [];
  const tableDrop = dropDestination === 'table';
  const chooseHand = (id: CardId) => {
    if (locked) return;
    setSelected(null); setSelectedPlayer(null);
    if (draft.discarding || draft.healing) setDraft({ ...draft, discard: draft.discard.includes(id) ? draft.discard.filter((card) => card !== id) : [...draft.discard, id] });
    else setDraft({ ...emptyDraft, card: draft.card === id ? null : id });
  };
  const choosePool = (id: CardId) => {
    if (locked || draft.healing) return;
    setSelected(null); setSelectedPlayer(null);
    if (mode === 'keep_cards') setDraft({ ...draft, kept: draft.kept.includes(id) ? draft.kept.filter((card) => card !== id) : [...draft.kept, id] });
    else setDraft({ ...draft, card: draft.card === id ? null : id });
  };
  const inspect: Inspect = (kind, _scroll, origin) => {
    if (restoringFocus.current || drag.dragging !== null) return;
    setSelected(kind); setSelectedPlayer(null);
    if (origin) inspectedOrigin.current = origin;
  };
  const closeDetail = () => { restoringFocus.current = true; setSelected(null); setSelectedPlayer(null); inspectedOrigin.current?.focus({ preventScroll: true }); restoringFocus.current = false; };
  const toggleJournal = () => { setJournalOpen(!journalOpen); if (journalOpen) journalButton.current?.focus({ preventScroll: true }); };
  const own = table.players.find((player) => player.id === viewer);
  const inspectingPlayer = table.players.find((player) => player.id === selectedPlayer);
  const viewerIndex = table.players.findIndex((player) => player.id === viewer);
  const positions = seatLayout(table.players.length, viewerIndex < 0 ? null : viewerIndex);
  const paintedSeats = stage ? sceneSeatLayout(table.players.length, viewerIndex < 0 ? null : viewerIndex) : null;
  const inspectPlayer = (player: PublicPlayer, origin: HTMLButtonElement) => { setSelected(null); setSelectedPlayer(player.id); inspectedOrigin.current = origin; };
  const guns = own?.in_play.map(cardFace).filter((face) => face && ['volcanic', 'schofield', 'remington', 'rev_carabine', 'winchester'].includes(face.kind));
  const distanceEffects = own ? [own.in_play.some((id) => cardFace(id)?.kind === 'mustang') && 'Mustang +1', own.in_play.some((id) => cardFace(id)?.kind === 'scope') && 'Scope −1', own.character === 'paul_regret' && 'Paul Regret +1', own.character === 'rose_doolan' && 'Rose Doolan −1'].filter(Boolean).join(' · ') : '';
  const name = (id: number) => `${game.seats.find((seat) => seat.player_id === id)?.nickname ?? `Ghế ${id + 1}`}${id === you ? ' (bạn)' : ''}`;
  const status = waitText(table, name);
  useEffect(() => { if (stage) sceneRef.current?.querySelector<HTMLElement>('[data-scene-title]')?.focus({ preventScroll: true }); }, []);

  return <GameMotion enabled={!!stage}><section className={`bang-board saloon-board seats-${table.players.length}${stage ? ' cinematic ui-motion' : ''}${journalOpen ? ' journal-open' : ''}${drag.dragging !== null ? ' is-dragging' : ''}${you === null ? ' spectator-board' : ''}`} tabIndex={-1} aria-label="Bàn chơi BANG!" data-drag-card={drag.dragging ?? undefined} aria-busy={pending} onKeyDown={event => {
      const target = event.target as HTMLElement;
      const overlay = !!document.querySelector(':popover-open,dialog[open],[aria-modal="true"]');
      const shortcut = tableShortcut(event.key, { desktop: !!stage, editing: target.isContentEditable || !!target.closest('input,textarea,select'), overlay: overlay || (event.key !== 'Escape' && !!(selected || inspectingPlayer)), nativeControl: !!target.closest('button,a,summary,[role="button"]') && !target.closest('.game-card[aria-pressed="true"],.scene-actor[aria-pressed="true"],.seat-target[aria-pressed="true"]'), modified: event.altKey || event.ctrlKey || event.metaKey, repeat: event.repeat, locked: locked || !fxEnabled || !!table.winner, dragging: drag.dragging !== null });
      if (shortcut === 'cancel') {
        event.preventDefault();
        if (selected || inspectingPlayer) closeDetail(); else if (journalOpen) toggleJournal(); else setDraft(emptyDraft);
      } else if (shortcut === 'confirm') {
        const primary = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.game-input [data-primary-action="true"]:not(:disabled)')].find(button => !button.closest('[inert]'));
        event.preventDefault();
        primary?.click();
      } else if (typeof shortcut === 'number') {
        const card = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(mode === 'general_store' ? '.store-pool button[data-store-slot]' : mode === 'pick_hand_slot' ? '.store-pool button[data-hand-slot]' : '.own-hand button[data-card-id]')].filter(button => !button.closest('[inert]'))[shortcut];
        if (card) { event.preventDefault(); card.click(); event.currentTarget.focus({ preventScroll: true }); }
      }
    }}>
    <div ref={sceneRef} className="board-scene" style={stage ? { left: stage.left, top: stage.top, width: stage.width, height: stage.height, '--scene-width': `${stage.width}px`, '--scene-height': `${stage.height}px`, '--scene-left': `${stage.left}px`, '--scene-top': `${stage.top}px` } as CSSProperties : undefined}>
    {stage ? <><DecodedImage className="scene-backdrop" src={landscapeScenes[table.players.length as keyof typeof landscapeScenes]} /><div className="scene-light" aria-hidden="true" /></> : <div className="saloon-scene" aria-hidden="true"><img className="saloon-room" src={sceneFiles.background} alt="" decoding="async" /><div className="saloon-vignette" /></div>}
    <header className="board-heading"><p className="game-eyebrow">Phòng {room.code} · {table.players.length} người</p><h2 data-scene-title tabIndex={-1}>BANG!</h2><span className="view-label">{you === null ? 'Góc nhìn khán giả' : 'Miền Tây chờ bạn'}</span></header>
    {(() => { const banner = turnBanner(table, new Map(game.seats.map(seat => [seat.player_id, seat.nickname])), viewer ?? null); return <div className="turn-banner-slot" role="status" aria-live="polite"><AnimatePresence mode="wait" initial={false}>{banner && <m.div key={banner.key} className={`turn-banner${banner.own ? ' is-own' : ''}`} data-ui-motion="turn-banner" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: .18 }}>{banner.text}</m.div>}</AnimatePresence></div>; })()}
    {own && <aside className="player-hud" aria-label="Thông tin của bạn"><div className="hud-gun"><Icon name="gun" /><span>{guns?.length ? guns.map(gun => cards[gun!.kind].name).join(' + ') : 'Colt .45'}<strong>Tầm bắn: {own.weapon_range}</strong></span></div><div className="hud-health"><span>Máu</span><Bullets player={own} /></div><div className="hud-distance" title={distanceEffects || 'Không có hiệu chỉnh'}><Icon name="horse" /><span>{distanceEffects || 'Không có hiệu chỉnh'}</span></div></aside>}
    <nav className="table-tools" aria-label="Công cụ bàn chơi"><button type="button" className="round-control" title="Mở nhật ký" aria-label="Mở nhật ký" aria-expanded={journalOpen} aria-controls="table-journal" ref={journalButton} onClick={toggleJournal}><Icon name="log" /></button><button type="button" className="round-control" popoverTarget="room-menu" title="Cài đặt phòng" aria-label="Cài đặt phòng"><Icon name="gear" /></button></nav>
    <RoomMenu><SoundControls />{stage && <section className="shortcut-help" aria-label="Phím tắt"><h3>Phím tắt</h3><p><kbd>1–9</kbd> Chọn hoặc xem lá tương ứng trên tay</p><p><kbd>Enter</kbd> Xác nhận hành động đang sẵn sàng</p><p><kbd>Esc</kbd> Hủy chọn hoặc đóng bảng đang xem</p><p><kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> Chuyển giữa các thao tác</p></section>}{stage && <button type="button" className="action secondary" aria-pressed={effectsEnabled} onClick={() => setEffectsEnabled(!effectsEnabled)}>{effectsEnabled ? 'Tắt hiệu ứng' : 'Bật hiệu ứng'}</button>}{roomMenu ?? <><h3>Phòng {room.code}</h3><a className="action secondary" href="/">Về phòng</a></>}</RoomMenu>
    <AnimatePresence initial={false}>{!table.winner && <MotionPanel key={status} className="game-wait" role="status"><span aria-hidden="true">✦</span><p>{status}</p></MotionPanel>}</AnimatePresence>
    <div className="table-stage">
      {!stage && <img className="wooden-table" src={sceneFiles.table} alt="" aria-hidden="true" decoding="async" />}
      <section data-animation-region="table" data-drop-zone="table" className={`table-center${(table.store_slots || table.waiting?.kind.type === 'pick_hand_slot') ? ' has-store' : ''}${table.waiting?.kind.type === 'pick_hand_slot' ? ' has-hand-pick' : ''}${tableDrop ? ' drop-ready' : ''}${drag.over === 'table' ? ' drop-over' : ''}`} aria-label={(table.store_slots || table.waiting?.kind.type === 'pick_hand_slot') ? table.waiting?.kind.type === 'pick_hand_slot' ? "Chọn mù bài trên tay" : "General Store" : "Bộ rút và chồng bỏ"}>{(table.store_slots || table.waiting?.kind.type === 'pick_hand_slot') ? <Suspense fallback={<p>{table.waiting?.kind.type === 'pick_hand_slot' ? `Chọn 1 lá úp · ${table.waiting.kind.count} lá` : `General Store · ${table.store_slots} lá úp`}</p>}><StorePool game={game} draft={draft} locked={locked} desktop={!!stage} setDraft={setDraft} send={action => sendAction?.(action)} /></Suspense> : <><span className="map-compass" aria-hidden="true">✥</span><div className="pile-row"><div className="draw-pile" data-animation-region="draw"><Artwork file={backFiles.card} label="Bộ rút" /><strong>Bộ rút</strong><span><MotionCount value={table.draw_count} /> lá</span></div><div className="discard-pile" data-animation-region="discard"><div className="pile-top"><AnimatePresence initial={false} mode="popLayout">{table.discard_top !== null ? <Card key={table.discard_top} id={table.discard_top} inspect={inspect} /> : <span key="empty" className="empty-pile">{table.discard_count ? 'Lá đỉnh giữ kín' : 'Chưa có lá bỏ'}</span>}</AnimatePresence></div><strong>Chồng bỏ</strong><span><MotionCount value={table.discard_count} /> lá</span></div></div></>}</section>
      <div className="game-arena">
        {table.players.map((player, i) => {
          const seat = game.seats.find((seat) => seat.player_id === player.id);
          const member = room.members.find((member) => member.id === seat?.member_id);
          const position = positions[i];
          const style = { '--seat-x': `${position.x}%`, '--seat-y': `${position.y}%`, '--portrait-x': `${position.portraitX}%`, '--portrait-y': `${position.portraitY}%`, '--landscape-y': `${position.landscapeY}%`, '--actor-x': `${position.outwardX * 44}px`, '--actor-y': `${position.outwardY * 56}px`, '--lean': `${-position.outwardX * 10}deg`, '--equipment-x': `${position.outwardX > .1 ? -92 : 92}px` } as CSSProperties;
          const painted = paintedSeats?.[i];
          if (painted && stage) {
            const inward = painted.cardsX <= 50 ? 1 : -1;
            const equipmentDirection = painted.cardsY > 60 && painted.cardsX !== 50 ? -inward : inward;
            const middleRow = painted.cardsY > 40 && painted.cardsY < 60;
            const equipmentOffset = player.id === viewer ? Math.max(50, stage.width * .05) : equipmentDirection * stage.width / 1280 * (middleRow ? 90 : painted.cardsY > 60 ? 126 : 112) * painted.depth;
            Object.assign(style, { '--scene-card-x': `${painted.cardsX}%`, '--scene-card-y': `${painted.cardsY}%`, '--depth': painted.depth, '--scene-lean': `${painted.angle}deg`, '--scene-equipment-y': middleRow ? '18px' : painted.cardsY > 60 ? '-8px' : '8px', '--scene-equipment-x': `${equipmentOffset}px` });
          }
          const ownSeat = player.id === viewer;
          const turn = !table.winner && table.turn.player === player.id;
          const waiting = !table.winner && table.waiting?.player === player.id && table.waiting.kind.type !== 'turn';
          const chooseTarget = targetMode && targetIds.includes(player.id) ? () => { setDraft({ ...draft, target: player.id, selection: null }); setSelected(null); } : undefined;
          const nickname = seat?.nickname ?? `Ghế ${player.id + 1}`;
          return <Fragment key={player.id}>
            {stage && painted && !ownSeat && <button type="button" className={`scene-actor${dropTargets.includes(player.id) ? ' drop-ready' : ''}${drag.over === player.id ? ' drop-over' : ''}${turn ? ' has-turn' : ''}${!player.alive ? ' eliminated' : ''}`} data-tip={`character:${player.character}`} aria-pressed={chooseTarget ? draft.target === player.id : undefined} data-scene-player={player.id} data-scene-slot={painted.slot} data-seat-view={painted.view} data-seat-flip={painted.flip} data-hand-x={painted.handX} data-hand-y={painted.handY} style={{ '--face-x': `${painted.faceX * 100}%`, '--face-y': `${painted.faceY * 100}%`, left: `${painted.x}%`, top: `${painted.y}%`, height: `${painted.actorHeight * 100}%`, width: stage.height * painted.actorHeight * .75 } as CSSProperties} aria-label={chooseTarget ? `Nhắm tới ${nickname} trên ghế` : `Xem nhân vật ${nickname} trên ghế`} disabled={!!chooseTarget && locked} onClick={(event) => chooseTarget ? chooseTarget() : inspectPlayer(player, event.currentTarget)}><CowboyPortrait player={player} view={painted.view} flip={painted.flip} /><span className="actor-anchor" data-animation-anchor={player.id} aria-hidden="true" /><AnimatePresence>{turn && <m.span key="turn" className="ui-turn-glow" data-ui-motion="turn" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }} />}{(waiting || draft.target === player.id) && <m.span key="crosshair" className="crosshair" data-ui-motion="crosshair" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .15 }} />}</AnimatePresence></button>}
            <div className={`seat-position${dropTargets.includes(player.id) ? ' drop-ready' : ''}${drag.over === player.id ? ' drop-over' : ''}`} style={style} data-player-id={player.id} data-scene-slot={painted?.slot}><Seat player={player} nickname={nickname} own={ownSeat} turn={turn} waiting={waiting} presence={member ? member.online ? 'Đang kết nối' : 'Mất kết nối' : 'Đã rời phòng'} inspect={inspect} inspectPlayer={inspectPlayer} disabled={locked} targetSelected={draft.target === player.id} chooseTarget={chooseTarget} scene={!!stage} /></div>
          </Fragment>;

        })}
      </div>
    </div>
    {own && <aside className="own-identity wood-panel" aria-label="Vai và nhân vật của bạn"><div className="role-medallion" role="img" aria-label={own.role ? roles[own.role].name : 'Vai chưa lộ'} tabIndex={0} data-tip={`role:${own.role ?? 'hidden'}`}><Icon name="star" /><strong>{own.role ? roles[own.role].name : 'Vai chưa lộ'}</strong></div><div className="identity-copy"><span className="own-character-tip" role="img" tabIndex={0} data-tip={`character:${own.character}`} aria-label={`Kỹ năng ${characters[own.character].name}`}><Artwork file={characterFiles[own.character]} label={characters[own.character].name} /></span><small>BẠN</small><h3>{characters[own.character].name}</h3><Bullets player={own} />{!own.alive && <span>Hồn ma</span>}</div></aside>}
    {you === null && !own && <p className="spectator-plaque wood-panel">Bạn đang xem ván chơi</p>}
    {you !== null && <section className={`own-hand hand-tray wood-panel${!table.winner && table.turn.player === viewer ? ' is-my-turn' : ''}`} data-animation-region="hand" aria-label="Bài trên tay của bạn"><div className="section-heading"><h3>Bài trên tay của bạn</h3><span><MotionCount value={hand.length} /> lá</span></div><m.div className="hand-cards" data-ui-motion="hand-layout" layoutScroll><AnimatePresence initial={false} mode="popLayout">{hand.map((id, index) => <Card key={id} id={id} inspect={inspect} handIndex={index} handCount={hand.length} hidden={drag.flight?.card === id} dragCard={stage && dragDestination(game, draft, id, locked) ? drag.props(id) : undefined} style={{ '--fan-angle': `${Math.max(-12, Math.min(12, (index - (hand.length - 1) / 2) * 4))}deg` } as CSSProperties} picked={draft.discarding || draft.healing ? draft.discard.includes(id) : draft.card === id} pick={!locked && (draft.healing || (mode === 'turn' && (draft.discarding || playKind(game, id))) || (mode === 'response' && responseCard(game, id))) ? () => chooseHand(id) : undefined} />)}</AnimatePresence>{!hand.length && <p>Bạn chưa có bài trên tay.</p>}</m.div></section>}
    <AnimatePresence initial={false}>{you !== null && <MotionPanel key={`${mode}:${draft.discarding}:${draft.healing}:${mode === 'turn' && draft.card === null}`} className={`decision-overlay${mode === 'turn' && draft.card === null && !draft.discarding && !draft.healing ? ' quiet-controls' : ''}${mode === 'waiting' && !draft.healing ? ' waiting-controls' : ''}`}>
      {!!choices.length && <section className="decision-pool" aria-label="Bài đang xem riêng"><h3>Bài đang xem riêng</h3><p>Chỉ bạn thấy các lá này. Chạm để chọn rồi xác nhận.</p><div className="hand-cards">{choices.map((id) => <Card key={id} id={id} inspect={inspect} picked={mode === 'keep_cards' ? draft.kept.includes(id) : draft.card === id} pick={!locked && !draft.healing && (mode === 'keep_cards' || mode === 'choose_draw_result') ? () => choosePool(id) : undefined} />)}</div></section>}
      {you !== null && <div className="game-input"><GameControls game={game} draft={draft} disabled={locked} setDraft={setDraft} sendAction={(action) => { setSelected(null); setSelectedPlayer(null); sendAction?.(action); }} /></div>}
    </MotionPanel>}</AnimatePresence>
    <AnimatePresence>{(selected || inspectingPlayer) && <MotionPanel key={selected ?? `player-${selectedPlayer}`} className="card-detail parchment" role="complementary" label="Chi tiết lá bài"><button type="button" className="detail-close" aria-label="Đóng chi tiết lá" onClick={closeDetail}>×</button>{selected ? <><Artwork key={selected} file={cardFiles[selected]} label={cards[selected].name} /><h3>{cards[selected].name}</h3><p>{cards[selected].effect}</p></> : inspectingPlayer && <><Artwork key={inspectingPlayer.character} file={characterFiles[inspectingPlayer.character]} label={characters[inspectingPlayer.character].name} /><h3>{characters[inspectingPlayer.character].name}</h3><p>{characters[inspectingPlayer.character].ability}</p><p>Tầm bắn: {inspectingPlayer.weapon_range} · {inspectingPlayer.hand_count} lá trên tay</p></>}</MotionPanel>}</AnimatePresence>
    {drag.dragging !== null && <span className="drag-hint" role="status">{tableDrop ? 'Thả vào giữa bàn để dùng lá bài' : 'Thả lên người chơi để chọn mục tiêu'}</span>}
    {drag.overlay}
    <GameTooltip key={game.seq} root={sceneRef} enabled={!!stage} dragging={drag.dragging !== null} />
    {pending && <m.span className="request-pending" data-ui-motion="pending" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .1, duration: .1 }}>Đang chờ máy chủ…</m.span>}
    <GameDeal root={sceneRef} batch={soundBatch} players={table.players} you={you} hand={hand} enabled={!!stage && fxEnabled} ownTurn={you !== null && table.waiting?.player === you} />
    <GameSound batch={soundBatch} ctx={{ players: table.players, seats: game.seats, you, waiting: table.waiting }} enabled={fxEnabled} />
    {stage && <GameFx batch={fxBatch} ctx={{ players: table.players, seats: game.seats, you, waiting: table.waiting }} enabled={fxEnabled && effectsEnabled} width={stage.width} height={stage.height} ambientEnabled={ambientEnabled && !table.winner} />}
    <m.div id="table-journal" data-ui-motion="journal-layout" layout={stage ? "position" : false} layoutDependency={journalOpen} transition={tableSpring}><AnimatePresence initial={false} mode="popLayout"><GameLog key={journalOpen ? 'expanded' : 'compact'} entries={log} scrollState={journalScroll} expanded={journalOpen} onToggle={toggleJournal} /></AnimatePresence></m.div>
    <AnimatePresence>{table.winner && <MotionPanel key="result" className="result-overlay"><Suspense fallback={<p role="status">Đang tải kết quả…</p>}><GameResult game={game} room={room} viewer={viewer} disabled={disabled} endGame={endGame} /></Suspense></MotionPanel>}</AnimatePresence>
    </div>
  </section></GameMotion>;
}
