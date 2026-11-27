import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CatsAction,
  CatsCardKind,
  CatsCardView,
  CatsDecision,
  CatsSpectatorView,
  GameSeat,
} from '../../generated/protocol.ts';
import MemberList from '../../shared/MemberList.tsx';
import { DecodedImage } from '../../shared/SaloonScene.tsx';
import { waitingBackdrop } from '../../shared/waitingScene.ts';
import type { GameBoardProps } from '../types.ts';
import {
  activeExpansionNames,
  canPlayComboFive,
  canPlayComboPair,
  canPlayComboTriple,
  cardBackUrl,
  cardCatalog,
  expansionLabels,
  stealableKinds,
} from './catalog.ts';
import { catsSeatLayout, seatActorUrl } from './layout.ts';
import {
  describePlayedAction,
  initialCatsState,
  receiveCatsFrame,
  selectCatsView,
} from './log.ts';
import './styles.css';

function seatNickname(seats: readonly GameSeat[], playerId: number, you: number | null): string {
  const nick = seats.find(seat => seat.player_id === playerId)?.nickname ?? `Ghế ${playerId + 1}`;
  return playerId === you ? `${nick} (bạn)` : nick;
}

function decisionSummary(
  table: CatsSpectatorView,
  seats: readonly GameSeat[],
  you: number | null,
): string {
  if (table.winner !== null) {
    return `${seatNickname(seats, table.winner, you)} chiến thắng!`;
  }
  const current = table.decision;
  if (!current) return 'Đang cập nhật bàn chơi…';
  const who = seatNickname(seats, current.player, you);
  const mine = you !== null && current.player === you;
  switch (current.kind.type) {
    case 'turn':
      return mine
        ? `Lượt của bạn (${table.turn.turns_left} lượt): đánh bài hoặc rút để kết thúc.`
        : `Đang chờ ${who} hành động (${table.turn.turns_left} lượt).`;
    case 'defuse':
      return mine
        ? 'Bạn đã Gỡ Bom! Hãy chọn vị trí nhét Mèo Nổ lại vào bộ rút.'
        : `${who} đang chọn vị trí nhét Mèo Nổ lại vào bộ rút.`;
    case 'insert_imploding':
      return mine
        ? 'Mèo Sập vừa lật ngửa! Chọn vị trí nhét lại vào bộ rút.'
        : `${who} đang nhét Mèo Sập (ngửa) vào bộ rút.`;
    case 'bury_card':
      return mine
        ? 'Chôn Bài: xem lá vừa rút và chọn vị trí chôn vào bộ rút.'
        : `${who} đang chọn vị trí chôn bài.`;
    case 'attack_target':
      return mine
        ? 'Tấn Công Chỉ Định: chọn 1 người chơi trên bàn để nhận lượt.'
        : `${who} đang chọn mục tiêu Tấn Công Chỉ Định.`;
    case 'favour_target':
      return mine
        ? 'Xin Bài: chọn 1 người chơi trên bàn để xin 1 lá.'
        : `${who} đang chọn người để Xin Bài.`;
    case 'favour_card':
      return mine
        ? `${seatNickname(seats, current.kind.actor, you)} đang Xin Bài bạn: chọn 1 lá để đưa.`
        : `${who} đang chọn 1 lá bài để đưa cho ${seatNickname(seats, current.kind.actor, you)}.`;
    case 'random_target':
      return mine
        ? 'Combo 2 Mèo: chọn 1 người chơi để cướp ngẫu nhiên 1 lá.'
        : `${who} đang chọn mục tiêu cướp bài ngẫu nhiên.`;
    case 'steal_target':
      return mine
        ? 'Combo 3 Mèo: chọn 1 người chơi để gọi tên lá bài.'
        : `${who} đang chọn mục tiêu gọi tên lá bài.`;
    case 'steal_kind':
      return mine
        ? `Combo 3 Mèo: chọn loại lá muốn lấy từ ${seatNickname(seats, current.kind.target, you)}.`
        : `${who} đang gọi tên lá bài từ ${seatNickname(seats, current.kind.target, you)}.`;
    case 'take_discard':
      return mine
        ? 'Combo 5 Mèo khác loại: chọn 1 lá bất kỳ từ chồng bỏ.'
        : `${who} đang chọn 1 lá từ chồng bỏ.`;
    case 'alter_future':
      return mine
        ? `${current.kind.share_with_next ? 'Chia Sẻ' : 'Đổi'} Tương Lai: sắp xếp lại ${current.kind.count} lá trên cùng.`
        : `${who} đang sắp xếp lại ${current.kind.count} lá đỉnh bộ rút.`;
    case 'give_to_deck':
      return mine
        ? `${current.kind.shuffle_after ? 'Thu Gom Rác' : 'Góp Tiệc'}: chọn 1 lá trên tay để bỏ vào bộ rút.`
        : `${who} đang chọn 1 lá đặt vào bộ rút.`;
  }
}

function CardArtwork({ kind, label }: { kind: CatsCardKind; label?: string }) {
  const meta = cardCatalog[kind];
  const [missing, setMissing] = useState(false);
  return (
    <span className="cats-art">
      {missing ? (
        <span className="cats-art-fallback">
          <strong>{label ?? meta.name}</strong>
        </span>
      ) : (
        <img
          src={meta.image}
          alt={label ?? meta.name}
          loading="eager"
          decoding="async"
          draggable={false}
          onError={() => setMissing(true)}
        />
      )}
    </span>
  );
}

export default function Board(props: GameBoardProps) {
  const firstFrame = props.sync.frames[0];
  const [clientState, setClientState] = useState(() => {
    if (firstFrame) return receiveCatsFrame(initialCatsState, firstFrame, props.sync.viewer);
    return { ...initialCatsState, game: props.sync.game };
  });
  const seenFrame = useRef<number | null>(firstFrame ? firstFrame.id : null);
  const frame = props.sync.frames[0];

  const [selected, setSelected] = useState<number[]>([]);
  const [insertPosition, setInsertPosition] = useState(0);
  const [stealChoice, setStealChoice] = useState<CatsCardKind | ''>('');
  const [futureOrder, setFutureOrder] = useState<number[]>([]);
  const [inspectedKind, setInspectedKind] = useState<CatsCardKind | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [dismissedFuture, setDismissedFuture] = useState(false);

  useEffect(() => {
    if (!frame || props.sync.desynced) return;
    if (seenFrame.current === frame.id) {
      props.consume(frame.id);
      return;
    }
    seenFrame.current = frame.id;
    setClientState(current => receiveCatsFrame(current, frame, props.sync.viewer));
    setSelected([]);
    setInsertPosition(0);
    setStealChoice('');
    setDismissedFuture(false);
    props.consume(frame.id);
  }, [frame, props.sync.desynced, props.sync.viewer, props.consume]);

  useEffect(() => {
    if (frame || props.sync.desynced) return;
    if (props.sync.game) {
      setClientState(current =>
        current.game === props.sync.game ? current : { ...current, game: props.sync.game },
      );
    }
  }, [frame, props.sync.desynced, props.sync.game]);

  const snapshot = clientState.game ?? props.sync.game;
  const unwrapped = snapshot ? selectCatsView(snapshot.view) : null;

  const alterKey =
    unwrapped?.table.decision?.kind.type === 'alter_future'
      ? `${unwrapped.table.decision.pending_id}:${unwrapped.previewCards.map(c => c.id).join(',')}`
      : '';

  useEffect(() => {
    if (!alterKey || !unwrapped) {
      setFutureOrder([]);
      return;
    }
    setFutureOrder(unwrapped.previewCards.map(card => card.id));
  }, [alterKey]);

  const seats = snapshot?.seats ?? [];
  const memberById = useMemo(
    () => new Map(props.room.members.map(member => [member.id, member])),
    [props.room.members],
  );

  if (!snapshot || !unwrapped) {
    return (
      <section className="game-cats cats-loading" aria-label="Bàn Mèo Nổ">
        <p role="status">Đang tải bàn Mèo Nổ…</p>
        <button type="button" className="cats-btn" onClick={props.leaveRoom}>
          Rời phòng
        </button>
      </section>
    );
  }

  const { table, hand, you, previewCards } = unwrapped;
  const currentDecision: CatsDecision | null = table.decision;
  const ownsDecision = you !== null && currentDecision?.player === you;
  const isTurn = ownsDecision && currentDecision?.kind.type === 'turn';
  const locked = props.disabled || props.pending || props.sync.desynced;
  const canAct = !locked && ownsDecision;
  const activeSelf = you !== null && !table.players[you]?.eliminated;
  const host = props.room.host === props.room.you;
  const over = table.winner !== null;
  const send = (action: CatsAction) => props.sendAction({ game: 'cats', payload: action });

  const otherPlayers = table.players.filter(player => !player.eliminated && player.id !== you);
  const lastAction = table.last_action;
  const hasNope = hand.some(card => card.kind === 'nope');
  const canNopeNow = !locked && activeSelf && hasNope && !!lastAction?.nopeable && !over;

  const selectedCards = hand.filter(card => selected.includes(card.id));
  const selectedKinds = selectedCards.map(card => card.kind);
  const canPair = canPlayComboPair(selectedKinds);
  const canTriple = canPlayComboTriple(selectedKinds);
  const canFive = canPlayComboFive(selectedKinds);

  const pickingTargetKind =
    canAct &&
    currentDecision?.pending_id != null &&
    (currentDecision.kind.type === 'attack_target' ||
      currentDecision.kind.type === 'favour_target' ||
      currentDecision.kind.type === 'random_target' ||
      currentDecision.kind.type === 'steal_target')
      ? currentDecision.kind.type
      : null;

  const viewerIndex = table.players.findIndex(player => player.id === you);
  const seatPoses = catsSeatLayout(table.players.length, viewerIndex < 0 ? null : viewerIndex);
  const topDiscard = table.discard.length > 0 ? table.discard[table.discard.length - 1] : null;
  const expansions = activeExpansionNames(table.settings);
  const statusText = decisionSummary(table, seats, you);

  function toggleCard(cardId: number) {
    setSelected(current =>
      current.includes(cardId)
        ? current.filter(id => id !== cardId)
        : current.length < 5
          ? [...current, cardId]
          : current,
    );
  }

  function handleHandCardClick(card: CatsCardView) {
    const meta = cardCatalog[card.kind];
    if (card.kind === 'nope' && canNopeNow && lastAction) {
      send({ type: 'nope', pending_id: lastAction.id });
      return;
    }
    if (isTurn && canAct && meta.comboCat) {
      toggleCard(card.id);
      return;
    }
    if (isTurn && canAct && meta.playableSingle) {
      send({ type: 'play_card', card: card.id });
      return;
    }
    setInspectedKind(card.kind);
  }

  function submitTarget(
    action: 'attack_target' | 'favour_target' | 'random_target' | 'steal_target',
    target: number,
  ) {
    if (!currentDecision?.pending_id) return;
    send({ type: action, pending_id: currentDecision.pending_id, target });
  }

  function moveFutureCard(index: number, delta: -1 | 1) {
    setFutureOrder(current => {
      const nextIndex = index + delta;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  }

  function renderPositionPicker(
    title: string,
    maxPosition: number,
    submitLabel: string,
    onSubmit: (pos: number) => void,
    previewCard?: CatsCardView,
  ) {
    const clamped = Math.min(maxPosition, Math.max(0, insertPosition));
    const presets = [
      { label: 'Trên cùng (0)', value: 0 },
      ...(maxPosition >= 1 ? [{ label: 'Thứ 2 (1)', value: 1 }] : []),
      ...(maxPosition >= 3 ? [{ label: `Giữa (${Math.floor(maxPosition / 2)})`, value: Math.floor(maxPosition / 2) }] : []),
      ...(maxPosition >= 1 ? [{ label: `Dưới cùng (${maxPosition})`, value: maxPosition }] : []),
    ];
    return (
      <div className="cats-pending-panel">
        <p className="cats-pending-title">{title}</p>
        {previewCard && (
          <div className="cats-bury-preview">
            <CardArtwork kind={previewCard.kind} />
            <span>
              <strong>{cardCatalog[previewCard.kind].name}</strong>
              <small>{cardCatalog[previewCard.kind].effect}</small>
            </span>
          </div>
        )}
        <div className="cats-preset-row">
          {presets.map(preset => (
            <button
              key={preset.label}
              type="button"
              className={`cats-btn secondary${clamped === preset.value ? ' is-chosen' : ''}`}
              onClick={() => setInsertPosition(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="cats-position-row">
          <label htmlFor="cats-insert-position">Vị trí (0 = rút ngay kế tiếp, tối đa {maxPosition})</label>
          <input
            id="cats-insert-position"
            type="number"
            min={0}
            max={maxPosition}
            value={clamped}
            onChange={event => {
              const raw = Number.isNaN(event.currentTarget.valueAsNumber)
                ? 0
                : event.currentTarget.valueAsNumber;
              setInsertPosition(Math.min(maxPosition, Math.max(0, raw)));
            }}
          />
          <button type="button" className="cats-btn primary" onClick={() => onSubmit(clamped)}>
            {submitLabel}
          </button>
        </div>
      </div>
    );
  }

  function renderPendingControl() {
    if (!currentDecision || !ownsDecision || !canAct || currentDecision.pending_id == null) {
      return null;
    }
    const id = currentDecision.pending_id;
    switch (currentDecision.kind.type) {
      case 'defuse':
        return renderPositionPicker(
          '🛡️ Gỡ Bom thành công! Chọn vị trí đặt lại Mèo Nổ vào bộ rút:',
          currentDecision.kind.max_position,
          'Đặt Mèo Nổ',
          position => send({ type: 'defuse', pending_id: id, position }),
        );
      case 'insert_imploding':
        return renderPositionPicker(
          '⚠️ Mèo Sập đã lật NGỬA! Chọn vị trí chèn lại vào bộ rút:',
          currentDecision.kind.max_position,
          'Đặt Mèo Sập',
          position => send({ type: 'insert_imploding', pending_id: id, position }),
        );
      case 'bury_card':
        return renderPositionPicker(
          'Chôn Bài: chọn vị trí chôn lá vừa rút vào bộ rút:',
          currentDecision.kind.max_position,
          'Chôn lá bài',
          position => send({ type: 'bury_card', pending_id: id, position }),
          previewCards[0],
        );
      case 'attack_target':
      case 'favour_target':
      case 'random_target':
      case 'steal_target': {
        const action = currentDecision.kind.type;
        const prompt =
          action === 'attack_target'
            ? 'Chọn người để Tấn Công Chỉ Định (hoặc chạm trực tiếp vào ghế trên bàn):'
            : action === 'favour_target'
              ? 'Chọn người để Xin Bài (hoặc chạm trực tiếp vào ghế trên bàn):'
              : action === 'random_target'
                ? 'Chọn người để cướp ngẫu nhiên 1 lá (hoặc chạm vào ghế):'
                : 'Chọn người để gọi tên lá bài (hoặc chạm vào ghế):';
        return (
          <div className="cats-pending-panel" aria-label={prompt}>
            <p className="cats-pending-title">{prompt}</p>
            <div className="cats-choice-row">
              {otherPlayers.map(player => (
                <button
                  key={player.id}
                  type="button"
                  className="cats-btn primary"
                  onClick={() => submitTarget(action, player.id)}
                >
                  {seatNickname(seats, player.id, you)} ({player.hand_count} lá)
                </button>
              ))}
            </div>
          </div>
        );
      }
      case 'favour_card':
        return (
          <div className="cats-pending-panel">
            <p className="cats-pending-title">
              Chọn 1 lá bài trên tay để đưa cho {seatNickname(seats, currentDecision.kind.actor, you)}:
            </p>
            <div className="cats-mini-cards">
              {hand.map(card => (
                <button
                  key={card.id}
                  type="button"
                  className="cats-mini-card"
                  onClick={() => send({ type: 'favour_card', pending_id: id, card: card.id })}
                >
                  <CardArtwork kind={card.kind} />
                  <span>{cardCatalog[card.kind].name}</span>
                </button>
              ))}
            </div>
          </div>
        );
      case 'steal_kind':
        return (
          <div className="cats-pending-panel">
            <p className="cats-pending-title">
              Chọn loại bài muốn cướp từ {seatNickname(seats, currentDecision.kind.target, you)}:
            </p>
            <div className="cats-steal-grid">
              {stealableKinds.map(kind => (
                <button
                  key={kind}
                  type="button"
                  className={`cats-steal-chip${stealChoice === kind ? ' is-chosen' : ''}`}
                  aria-pressed={stealChoice === kind}
                  onClick={() => setStealChoice(kind)}
                >
                  {cardCatalog[kind].name}
                </button>
              ))}
            </div>
            <div className="cats-choice-row">
              <button
                type="button"
                className="cats-btn primary"
                disabled={!stealChoice}
                onClick={() =>
                  stealChoice && send({ type: 'steal_kind', pending_id: id, kind: stealChoice })
                }
              >
                Xác nhận gọi tên{stealChoice ? `: ${cardCatalog[stealChoice].name}` : ''}
              </button>
            </div>
          </div>
        );
      case 'take_discard':
        return (
          <div className="cats-pending-panel">
            <p className="cats-pending-title">Chọn 1 lá bất kỳ từ chồng bỏ:</p>
            <div className="cats-mini-cards">
              {table.discard.map(card => (
                <button
                  key={card.id}
                  type="button"
                  className="cats-mini-card"
                  onClick={() => send({ type: 'take_discard', pending_id: id, card: card.id })}
                >
                  <CardArtwork kind={card.kind} />
                  <span>{cardCatalog[card.kind].name}</span>
                </button>
              ))}
              {table.discard.length === 0 && (
                <button
                  type="button"
                  className="cats-btn secondary"
                  onClick={() => send({ type: 'take_discard', pending_id: id, card: null })}
                >
                  Bỏ qua (chồng bỏ trống)
                </button>
              )}
            </div>
          </div>
        );
      case 'alter_future': {
        const byId = new Map(previewCards.map(card => [card.id, card]));
        const ordered = futureOrder
          .map(cardId => byId.get(cardId))
          .filter((card): card is CatsCardView => !!card);
        const list = ordered.length === previewCards.length ? ordered : previewCards;
        return (
          <div className="cats-pending-panel">
            <p className="cats-pending-title">
              {currentDecision.kind.share_with_next
                ? 'Chia Sẻ Tương Lai: sắp xếp thứ tự (trái = rút trước) rồi chia sẻ cho người kế tiếp:'
                : 'Đổi Tương Lai: sắp xếp thứ tự các lá trên cùng (trái = rút trước):'}
            </p>
            <div className="cats-alter-row">
              {list.map((card, index) => (
                <div key={card.id} className="cats-alter-item">
                  <span className="cats-alter-rank">#{index + 1}</span>
                  <CardArtwork kind={card.kind} />
                  <span className="cats-alter-name">{cardCatalog[card.kind].name}</span>
                  <div className="cats-alter-arrows">
                    <button
                      type="button"
                      className="cats-btn secondary"
                      aria-label={`Đưa ${cardCatalog[card.kind].name} lên trước`}
                      disabled={index === 0}
                      onClick={() => moveFutureCard(index, -1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="cats-btn secondary"
                      aria-label={`Đưa ${cardCatalog[card.kind].name} ra sau`}
                      disabled={index === list.length - 1}
                      onClick={() => moveFutureCard(index, 1)}
                    >
                      →
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="cats-choice-row">
              <button
                type="button"
                className="cats-btn primary"
                onClick={() =>
                  send({
                    type: 'reorder_future',
                    pending_id: id,
                    order: list.map(card => card.id),
                  })
                }
              >
                Xác nhận thứ tự
              </button>
            </div>
          </div>
        );
      }
      case 'give_to_deck':
        return (
          <div className="cats-pending-panel">
            <p className="cats-pending-title">
              {currentDecision.kind.shuffle_after
                ? 'Thu Gom Rác: chọn 1 lá trên tay để bỏ lại vào bộ rút (sẽ xáo lại):'
                : 'Góp Tiệc: chọn 1 lá trên tay để đặt lên đỉnh bộ rút:'}
            </p>
            <div className="cats-mini-cards">
              {hand.map(card => (
                <button
                  key={card.id}
                  type="button"
                  className="cats-mini-card"
                  onClick={() => send({ type: 'put_card_in_deck', pending_id: id, card: card.id })}
                >
                  <CardArtwork kind={card.kind} />
                  <span>{cardCatalog[card.kind].name}</span>
                </button>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  }

  const listPlayers = seats.map(seat => {
    const member = memberById.get(seat.member_id);
    const statePlayer = table.players.find(p => p.id === seat.player_id);
    return {
      id: seat.member_id,
      nickname: seat.nickname,
      online: member?.online ?? false,
      eliminated: statePlayer?.eliminated ?? false,
      avatar: seatActorUrl(seat.player_id, 'q3front', statePlayer?.eliminated ?? false),
    };
  });
  const seatMemberIds = new Set(seats.map(seat => seat.member_id));
  const listSpectators = props.room.members
    .filter(member => !seatMemberIds.has(member.id))
    .map(member => ({
      id: member.id,
      nickname: member.nickname,
      online: member.online,
    }));
  const turnMemberId = seats.find(seat => seat.player_id === table.turn.player)?.member_id;

  return (
    <section
      className={`game-cats cats-board${journalOpen ? ' is-journal-open' : ''}`}
      aria-label="Bàn Mèo Nổ"
      aria-busy={props.pending}
    >
      <div className="cats-saloon-bg" aria-hidden="true">
        <DecodedImage src="/platform/saloon-bg.webp" className="cats-room-img" />
        <div className="cats-vignette" />
      </div>

      <header className="cats-heading">
        <p className="cats-eyebrow">
          Phòng {props.room.code} · {table.players.length} người ·{' '}
          {table.turn.direction >= 0 ? '↻ Xuôi chiều' : '↺ Ngược chiều'}
        </p>
        <h2 data-scene-title tabIndex={-1}>
          MÈO NỔ
        </h2>
        <p className="cats-expansions-line">
          {expansions.length > 0 ? `Mở rộng: ${expansions.join(' · ')}` : 'Bản gốc'}
        </p>
      </header>

      <div className="cats-turn-banner" role="status" aria-live="polite">
        <span className={ownsDecision ? 'is-own' : ''}>{statusText}</span>
      </div>

      <nav className="cats-tools" aria-label="Công cụ bàn chơi">
        {props.roomTools}
        <button
          type="button"
          className="cats-round-btn"
          title="Nhật ký ván chơi"
          aria-label="Mở nhật ký"
          aria-expanded={journalOpen}
          aria-controls="cats-journal"
          onClick={() => setJournalOpen(open => !open)}
        >
          📜
        </button>
        <button
          type="button"
          className="cats-round-btn"
          popoverTarget="cats-room-menu"
          title="Cài đặt phòng"
          aria-label="Cài đặt phòng"
        >
          ⚙
        </button>
      </nav>

      <div id="cats-room-menu" className="cats-room-menu cats-wood-panel" popover="auto">
        {props.roomMenu ?? (
          <>
            <h3>Phòng {props.room.code}</h3>
            <button type="button" className="cats-btn" onClick={props.leaveRoom}>
              Rời phòng
            </button>
          </>
        )}
        {host && !over && (
          <button
            type="button"
            className="cats-btn secondary cats-menu-extra"
            disabled={props.disabled}
            onClick={props.hostSkip}
          >
            Bỏ qua lượt chờ
          </button>
        )}
      </div>

      <div className="cats-table-stage">
        <img
          className="cats-wooden-table"
          src={waitingBackdrop}
          alt=""
          aria-hidden="true"
          decoding="async"
        />

        <section className="cats-table-center" aria-label="Bộ rút và chồng bỏ">
          <div className="cats-pile-row">
            <button
              type="button"
              className={`cats-draw-pile${table.top_known ? ' is-danger' : ''}${isTurn && canAct ? ' can-draw' : ''}`}
              disabled={!isTurn || !canAct}
              onClick={() => send({ type: 'draw' })}
              aria-label={`Rút bài, còn ${table.deck_count} lá`}
            >
              <span className="cats-pile-art">
                <img
                  src={table.top_known ? cardCatalog[table.top_known].image : cardBackUrl}
                  alt={table.top_known ? cardCatalog[table.top_known].name : 'Mặt sau bộ rút'}
                  draggable={false}
                />
                {table.top_known && (
                  <span className="cats-danger-tag">
                    {table.top_known === 'imploding' ? 'NGỬA!' : 'BOM!'}
                  </span>
                )}
              </span>
              <strong>{isTurn && canAct ? 'Rút bài' : 'Bộ rút'}</strong>
              <span>{table.deck_count} lá</span>
            </button>

            <button
              type="button"
              className="cats-discard-pile"
              disabled={!topDiscard}
              onClick={() => topDiscard && setInspectedKind(topDiscard.kind)}
              aria-label={
                topDiscard
                  ? `Chồng bỏ: ${cardCatalog[topDiscard.kind].name}, ${table.discard.length} lá`
                  : 'Chồng bỏ trống'
              }
            >
              <span className="cats-pile-art">
                {topDiscard ? (
                  <CardArtwork kind={topDiscard.kind} />
                ) : (
                  <span className="cats-empty-pile">Chưa bỏ</span>
                )}
              </span>
              <strong>Chồng bỏ</strong>
              <span>{table.discard.length} lá</span>
            </button>
          </div>
          {table.imploding_face_up && (
            <p className="cats-imploding-warn">⚠️ Mèo Sập đang nằm NGỬA trong bộ rút!</p>
          )}
        </section>

        <div className="cats-arena" aria-label="Người chơi quanh bàn">
          {table.players.map((player, index) => {
            const pose = seatPoses[index];
            const seat = seats.find(s => s.player_id === player.id);
            const member = seat ? memberById.get(seat.member_id) : undefined;
            const nickname = seat?.nickname ?? `Ghế ${player.id + 1}`;
            const isOwnSeat = player.id === you;
            const hasTurn = !over && table.turn.player === player.id;
            const isWaiting =
              !over && currentDecision?.player === player.id && currentDecision.kind.type !== 'turn';
            const canTarget = pickingTargetKind !== null && !player.eliminated && !isOwnSeat;
            const seatStyle = {
              '--seat-x': `${pose.x}%`,
              '--seat-y': `${pose.y}%`,
              '--portrait-x': `${pose.portraitX}%`,
              '--portrait-y': `${pose.portraitY}%`,
              '--actor-x': `${pose.outwardX * 30}px`,
              '--actor-y': `${pose.outwardY * 34}px`,
            } as CSSProperties;

            return (
              <div
                key={player.id}
                className={`cats-seat-pos${isOwnSeat ? ' is-own-seat' : ''}`}
                style={seatStyle}
                data-player-id={player.id}
              >
                <article
                  className={`cats-seat${player.eliminated ? ' is-eliminated' : ''}${hasTurn ? ' has-turn' : ''}${isWaiting ? ' is-waiting' : ''}${canTarget ? ' is-targetable' : ''}`}
                >
                  {!isOwnSeat && (
                    <span
                      className="cats-seat-actor"
                      style={{ transform: pose.flip ? 'translate(-50%, -46%) scaleX(-1)' : 'translate(-50%, -46%)' }}
                      aria-hidden="true"
                    >
                      <img
                        src={seatActorUrl(player.id, pose.view, player.eliminated)}
                        alt=""
                        draggable={false}
                      />
                    </span>
                  )}
                  <button
                    type="button"
                    className="cats-seat-card"
                    disabled={!canTarget}
                    onClick={() => canTarget && pickingTargetKind && submitTarget(pickingTargetKind, player.id)}
                    aria-label={
                      canTarget
                        ? `Chọn mục tiêu ${nickname}`
                        : `${nickname}${isOwnSeat ? ' (bạn)' : ''}, ${player.eliminated ? 'đã bị loại' : `${player.hand_count} lá`}`
                    }
                  >
                    {hasTurn && (
                      <span className="cats-turn-badge" aria-hidden="true">
                        ✦{table.turn.turns_left > 1 ? ` ×${table.turn.turns_left}` : ''}
                      </span>
                    )}
                    <span className="cats-seat-ribbon">
                      <strong>
                        {nickname}
                        {isOwnSeat ? ' (bạn)' : ''}
                      </strong>
                      <small>
                        {player.eliminated
                          ? '💀 Đã nổ'
                          : member && !member.online
                            ? 'Mất kết nối'
                            : `${player.hand_count} lá`}
                      </small>
                    </span>
                    {canTarget && <span className="cats-target-hint">Chọn mục tiêu</span>}
                  </button>
                </article>
              </div>
            );
          })}
        </div>
      </div>

      <aside className="cats-members-dock cats-wood-panel" aria-label="Thành viên trong phòng">
        <MemberList
          players={listPlayers}
          spectators={listSpectators}
          host={props.room.host}
          you={props.room.you}
          turn={turnMemberId}
          defaultAvatar="/platform/seat/cowboy-a-q3front.webp"
          voice={props.voice}
        />
      </aside>

      <div className="cats-decision-dock">
        {canNopeNow && lastAction && (
          <div className="cats-nope-bar" role="region" aria-label="Cửa sổ phản ứng Không!">
            <span>
              <strong>{seatNickname(seats, lastAction.actor, you)}</strong> vừa đánh{' '}
              <em>{describePlayedAction(lastAction.played)}</em>
            </span>
            <button
              type="button"
              className="cats-btn danger cats-nope"
              onClick={() => send({ type: 'nope', pending_id: lastAction.id })}
            >
              🚫 Dùng Không! (Nope)
            </button>
          </div>
        )}

        {clientState.futurePreview && !dismissedFuture && (
          <aside className="cats-future-strip" aria-live="polite">
            <div className="cats-future-head">
              <strong>🔮 {clientState.futurePreview.length} lá kế tiếp (trái → rút trước)</strong>
              <button
                type="button"
                className="cats-close-small"
                aria-label="Ẩn xem tương lai"
                onClick={() => setDismissedFuture(true)}
              >
                ×
              </button>
            </div>
            <div className="cats-future-cards">
              {clientState.futurePreview.map((card, index) => (
                <div key={`${card.id}-${index}`} className="cats-future-item">
                  <span>#{index + 1}</span>
                  <CardArtwork kind={card.kind} />
                  <small>{cardCatalog[card.kind].name}</small>
                </div>
              ))}
            </div>
          </aside>
        )}

        {renderPendingControl()}

        {isTurn && selected.length > 0 && (
          <div className="cats-combo-bar" aria-label="Combo mèo">
            <span>Đã chọn {selected.length} lá Mèo:</span>
            <button
              type="button"
              className="cats-btn primary"
              disabled={!canAct || !canPair}
              onClick={() => canPair && send({ type: 'play_pair', cards: selected })}
            >
              Chơi cặp mèo (2)
            </button>
            <button
              type="button"
              className="cats-btn primary"
              disabled={!canAct || !canTriple}
              onClick={() => canTriple && send({ type: 'play_triple', cards: selected })}
            >
              Chơi bộ ba (3)
            </button>
            <button
              type="button"
              className="cats-btn primary"
              disabled={!canAct || !canFive}
              onClick={() => canFive && send({ type: 'play_five', cards: selected })}
            >
              Chơi 5 mèo khác loại
            </button>
            <button type="button" className="cats-btn secondary" onClick={() => setSelected([])}>
              Bỏ chọn
            </button>
          </div>
        )}

        {props.actionError && (
          <p role="alert" className="cats-error-banner">
            {props.actionError}
          </p>
        )}
      </div>

      {you !== null ? (
        <section
          className={`cats-hand-tray cats-wood-panel${isTurn ? ' is-my-turn' : ''}`}
          aria-label="Bài trên tay của bạn"
        >
          <div className="cats-hand-header">
            <h3>Bài trên tay · {hand.length} lá</h3>
            <div className="cats-hand-actions">
              {isTurn && (
                <button
                  type="button"
                  className="cats-btn primary cats-draw"
                  disabled={!canAct}
                  onClick={() => send({ type: 'draw' })}
                >
                  Rút bài ({table.deck_count})
                </button>
              )}
            </div>
          </div>
          <div className="cats-hand-cards">
            {hand.map(card => {
              const meta = cardCatalog[card.kind];
              const isSelected = selected.includes(card.id);
              const playableNow =
                (card.kind === 'nope' && canNopeNow) ||
                (isTurn && canAct && (meta.playableSingle || meta.comboCat));
              return (
                <div key={card.id} className="cats-hand-slot">
                  <button
                    type="button"
                    className={`cats-card${isSelected ? ' is-selected' : ''}${playableNow ? ' is-playable' : ''}`}
                    aria-pressed={meta.comboCat ? isSelected : undefined}
                    onClick={() => handleHandCardClick(card)}
                  >
                    <CardArtwork kind={card.kind} />
                    <span className="cats-card-caption">
                      <strong>{meta.name}</strong>
                      <small>
                        {card.kind === 'nope' && canNopeNow
                          ? 'Bấm để Nope!'
                          : isTurn && meta.comboCat
                            ? isSelected
                              ? 'Đã chọn'
                              : 'Chọn combo'
                            : isTurn && meta.playableSingle
                              ? 'Bấm để đánh'
                              : 'Xem chi tiết'}
                      </small>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="cats-card-info"
                    aria-label={`Xem mô tả ${meta.name}`}
                    onClick={() => setInspectedKind(card.kind)}
                  >
                    ?
                  </button>
                </div>
              );
            })}
            {hand.length === 0 && <p className="cats-empty-hand">Bạn không còn lá bài nào trên tay.</p>}
          </div>
        </section>
      ) : (
        <p className="cats-spectator-note cats-wood-panel">
          Bạn đang xem ván Mèo Nổ (chế độ khán giả).
        </p>
      )}

      <aside id="cats-journal" className="cats-journal cats-wood-panel" aria-label="Nhật ký ván chơi">
        <div className="cats-journal-head">
          <h3>Nhật ký</h3>
          <button
            type="button"
            className="cats-close-small"
            aria-label="Đóng nhật ký"
            onClick={() => setJournalOpen(false)}
          >
            ×
          </button>
        </div>
        <ol className="cats-log-list">
          {clientState.log.length === 0 && <li>Bàn chơi đã sẵn sàng.</li>}
          {clientState.log.map(entry => (
            <li key={entry.id} className={`tone-${entry.tone}`}>
              {entry.text}
            </li>
          ))}
        </ol>
      </aside>

      {inspectedKind && (
        <aside className="cats-detail-card" role="complementary" aria-label="Chi tiết lá bài">
          <button
            type="button"
            className="cats-close-small"
            aria-label="Đóng chi tiết lá"
            onClick={() => setInspectedKind(null)}
          >
            ×
          </button>
          <CardArtwork kind={inspectedKind} />
          <h3>{cardCatalog[inspectedKind].name}</h3>
          <span className="cats-exp-tag">{expansionLabels[cardCatalog[inspectedKind].expansion]}</span>
          <p>{cardCatalog[inspectedKind].effect}</p>
        </aside>
      )}

      {table.winner !== null && (
        <div className="cats-winner-overlay" role="dialog" aria-modal="false" aria-label="Kết quả ván Mèo Nổ">
          <div className="cats-winner-card">
            <p className="cats-winner-eyebrow">Ván đấu kết thúc</p>
            <h3>🏆 {seatNickname(seats, table.winner, you)} chiến thắng!</h3>
            <ul className="cats-standings">
              {table.players.map(player => (
                <li key={player.id}>
                  <strong>{seatNickname(seats, player.id, you)}</strong>
                  <span>{player.id === table.winner ? 'Sống sót cuối cùng' : 'Đã bị loại'}</span>
                </li>
              ))}
            </ul>
            <div className="cats-winner-actions">
              {host ? (
                <button
                  type="button"
                  className="cats-btn primary"
                  disabled={props.disabled}
                  onClick={props.endGame}
                >
                  Kết thúc ván (về phòng chờ)
                </button>
              ) : (
                <p className="cats-wait-host">Đang chờ chủ phòng kết thúc ván…</p>
              )}
              <button
                type="button"
                className="cats-btn secondary"
                disabled={props.disabled}
                onClick={props.leaveRoom}
              >
                Rời phòng
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
