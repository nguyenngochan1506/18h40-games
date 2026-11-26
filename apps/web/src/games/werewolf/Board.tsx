import { useEffect, useRef, useState } from 'react';
import type {
  WerewolfAction,
  WerewolfNightStep,
  WerewolfPlayerId,
  WerewolfPublicPhase,
  WerewolfRoleDeck,
} from '../../generated/protocol.ts';
import type { GameBoardProps } from '../types.ts';
import RoleCard from './RoleCard.tsx';
import { ROLE_ORDER, ROLES, teamLabel } from './roles.ts';
import {
  deathCauseLabel,
  initialWerewolfState,
  nightStepLabel,
  receiveFrame,
  seatName,
  selectPlayerView,
  selectSpectatorView,
  winnerLabel,
} from './state.ts';
import './styles.css';

function phaseTitle(
  phase: WerewolfPublicPhase,
  activeNightStep: WerewolfNightStep | null,
  seats: { nickname: string }[],
): string {
  switch (phase.kind) {
    case 'night':
      return activeNightStep
        ? `Đêm ${phase.night} — ${nightStepLabel(activeNightStep)}`
        : `Đêm ${phase.night} — Cả làng đang ngủ`;
    case 'day_vote':
      return `Ngày ${phase.day} — Thảo luận & Bỏ phiếu treo cổ`;
    case 'hunter_shot':
      return `Thợ Săn ${seats[phase.hunter]?.nickname ?? `#${phase.hunter + 1}`} chọn mục tiêu kéo theo`;
    case 'game_over':
      return 'Ván đấu kết thúc';
  }
}

function DeckDialog({
  playerCount,
  roleCounts,
  onClose,
}: {
  playerCount: number;
  roleCounts: WerewolfRoleDeck;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = dialog.current!;
    node.showModal();
    closeButton.current?.focus();
    return () => {
      if (node.open) node.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="ww-modal"
      aria-labelledby="ww-deck-dialog-title"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onClick={event => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
          return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ),
        ];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!first) {
          event.preventDefault();
          event.currentTarget.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <div className="ww-modal-inner">
        <div className="ww-modal-head">
          <h3 id="ww-deck-dialog-title">Bộ bài trong ván ({playerCount} lá)</h3>
          <button
            ref={closeButton}
            type="button"
            className="ww-btn ww-btn-secondary"
            onClick={onClose}
          >
            Đóng
          </button>
        </div>
        <div className="ww-modal-grid">
          {ROLE_ORDER.filter(id => roleCounts[id] > 0).map(id => (
            <div key={id} className="ww-modal-card-item">
              <RoleCard role={id} size="sm" showSummary />
              <span className="ww-modal-count">×{roleCounts[id]}</span>
            </div>
          ))}
        </div>
      </div>
    </dialog>
  );
}

export default function Board(props: GameBoardProps) {
  const { sync, consume, room } = props;
  const first = sync.frames[0];
  const [state, setState] = useState(() => (first?.reset ? receiveFrame(initialWerewolfState, first) : initialWerewolfState));
  const seen = useRef<number | null>(first?.reset ? first.id : null);
  const frame = sync.frames[0];

  const [hideMyCard, setHideMyCard] = useState(false);
  const [showDeckModal, setShowDeckModal] = useState(false);
  const [selectedTargets, setSelectedTargets] = useState<WerewolfPlayerId[]>([]);
  const [alphaInfect, setAlphaInfect] = useState(false);
  const [witchHeal, setWitchHeal] = useState(false);

  useEffect(() => {
    if (!frame || sync.desynced) return;
    if (seen.current === frame.id) {
      consume(frame.id);
      return;
    }
    const timer = window.setTimeout(() => {
      seen.current = frame.id;
      setState(current => receiveFrame(current, frame));
      consume(frame.id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [frame, consume, sync.desynced]);

  const game = state.game;
  const resetKey = game
    ? JSON.stringify([
        state.epoch,
        selectSpectatorView(game.view).phase,
        selectPlayerView(game.view)?.active_night_step ?? null,
        Boolean(selectPlayerView(game.view)?.can_act),
      ])
    : '';
  useEffect(() => {
    setSelectedTargets([]);
    setAlphaInfect(false);
    setWitchHeal(false);
  }, [resetKey]);

  if (!game) {
    return (
      <section className="game-werewolf ww-loading" aria-label="Bàn Ma Sói">
        <p role="status">Đang tải bàn Ma Sói…</p>
        <button type="button" className="ww-btn ww-btn-secondary" onClick={props.leaveRoom}>
          Rời phòng
        </button>
      </section>
    );
  }

  const table = selectSpectatorView(game.view);
  const player = selectPlayerView(game.view);
  const seats = game.seats;
  const isNight = table.phase.kind === 'night';
  const isOver = table.winner !== null;
  const canAct = Boolean(player?.can_act) && !props.disabled && !props.pending && sync.frames.length === 0;
  const isHost = room.host === room.you;

  function emit(payload: WerewolfAction) {
    props.sendAction({ game: 'werewolf', payload });
  }

  function isTargetSelectable(targetId: WerewolfPlayerId): boolean {
    if (!canAct || !player) return false;
    const target = table.players[targetId];
    if (!target || !target.alive) return false;

    const phase = table.phase;
    if (phase.kind === 'night') {
      switch (player.active_night_step) {
        case 'cupid':
          return true;
        case 'bodyguard':
          return player.bodyguard_last_protected !== targetId;
        case 'werewolves':
          return !player.known_wolves.includes(targetId);
        case 'seer':
        case 'sorcerer':
          return targetId !== player.you;
        case 'witch':
          return player.witch_poison_available && targetId !== player.you;
        default:
          return false;
      }
    }
    if (phase.kind === 'day_vote' || phase.kind === 'hunter_shot') {
      return true;
    }
    return false;
  }

  function toggleTarget(targetId: WerewolfPlayerId) {
    if (!isTargetSelectable(targetId)) return;
    if (table.phase.kind === 'night' && player?.active_night_step === 'cupid') {
      setSelectedTargets(prev => {
        if (prev.includes(targetId)) return prev.filter(id => id !== targetId);
        if (prev.length >= 2) return [prev[1], targetId];
        return [...prev, targetId];
      });
      return;
    }
    setSelectedTargets(prev => (prev[0] === targetId ? [] : [targetId]));
  }

  function renderActionPanel() {
    if (isOver) {
      return (
        <div className="ww-victory-banner" role="status">
          <h2>{winnerLabel(table.winner!)}</h2>
          {table.winning_players.length > 0 && (
            <p>
              Người thắng:{' '}
              <strong>{table.winning_players.map(id => seatName(seats, id)).join(', ')}</strong>
            </p>
          )}
          <div className="ww-action-row">
            {isHost ? (
              <button type="button" className="ww-btn ww-btn-primary" onClick={props.endGame}>
                Kết thúc ván (về phòng chờ)
              </button>
            ) : (
              <span className="ww-hint">Chờ chủ phòng bấm Kết thúc ván để chơi ván mới.</span>
            )}
          </div>
        </div>
      );
    }

    if (!player) {
      return (
        <div className="ww-action-bar" role="status">
          <span>
            {isNight
              ? 'Bạn đang ở chế độ khán giả. Màn đêm đang diễn ra…'
              : `Bạn đang ở chế độ khán giả. Đang chờ ${table.awaited_count} người hành động…`}
          </span>
        </div>
      );
    }

    if (!player.can_act) {
      return (
        <div className="ww-action-bar" role="status">
          <span>
            {table.phase.kind === 'night'
              ? 'Đang chờ vai trò khác hành động trong đêm…'
              : `Bạn đã hoàn tất lượt. Đang chờ ${table.awaited_count} người còn lại…`}
          </span>
        </div>
      );
    }

    const phase = table.phase;
    if (phase.kind === 'night') {
      switch (player.active_night_step) {
        case 'cupid':
          return (
            <div className="ww-action-bar">
              <span>Chọn 2 người chơi để ghép đôi Tình Nhân ({selectedTargets.length}/2).</span>
              <button
                type="button"
                className="ww-btn ww-btn-primary"
                disabled={!canAct || selectedTargets.length !== 2}
                onClick={() => emit({ type: 'cupid_link', first: selectedTargets[0], second: selectedTargets[1] })}
              >
                Ghép đôi Tình Nhân
              </button>
            </div>
          );
        case 'bodyguard':
          return (
            <div className="ww-action-bar">
              <span>
                Chọn 1 người để bảo vệ đêm nay
                {player.bodyguard_last_protected !== null
                  ? ` (không chọn lại ${seatName(seats, player.bodyguard_last_protected)})`
                  : ''}.
              </span>
              <button
                type="button"
                className="ww-btn ww-btn-primary"
                disabled={!canAct || selectedTargets.length !== 1}
                onClick={() => emit({ type: 'bodyguard_protect', target: selectedTargets[0] })}
              >
                Xác nhận bảo vệ
              </button>
            </div>
          );
        case 'werewolves':
          return (
            <div className="ww-action-bar">
              <span>Chọn 1 nạn nhân ngoài bầy Sói để cắn đêm nay.</span>
              <div className="ww-action-row">
                {player.alpha_infect_available && (
                  <label className="ww-inline-check">
                    <input
                      type="checkbox"
                      checked={alphaInfect}
                      onChange={e => setAlphaInfect(e.target.checked)}
                    />
                    <span>Sói Trùm: Biến thành Ma Sói (1 lần)</span>
                  </label>
                )}
                <button
                  type="button"
                  className="ww-btn ww-btn-danger"
                  disabled={!canAct || selectedTargets.length !== 1}
                  onClick={() => emit({ type: 'wolf_vote', target: selectedTargets[0], infect: alphaInfect })}
                >
                  {alphaInfect ? 'Biến đổi nạn nhân' : 'Xác nhận cắn'}
                </button>
              </div>
            </div>
          );
        case 'seer':
          return (
            <div className="ww-action-bar">
              <span>Chọn 1 người chơi khác để soi xem có phải Ma Sói không.</span>
              <button
                type="button"
                className="ww-btn ww-btn-primary"
                disabled={!canAct || selectedTargets.length !== 1}
                onClick={() => emit({ type: 'seer_inspect', target: selectedTargets[0] })}
              >
                Soi danh tính
              </button>
            </div>
          );
        case 'sorcerer':
          return (
            <div className="ww-action-bar">
              <span>Chọn 1 người chơi khác để tìm Tiên Tri.</span>
              <button
                type="button"
                className="ww-btn ww-btn-primary"
                disabled={!canAct || selectedTargets.length !== 1}
                onClick={() => emit({ type: 'sorcerer_inspect', target: selectedTargets[0] })}
              >
                Soi tìm Tiên Tri
              </button>
            </div>
          );
        case 'witch':
          return (
            <div className="ww-action-bar">
              <span>
                {player.witch_victim !== null
                  ? `Đêm nay bầy Sói cắn ${seatName(seats, player.witch_victim)}.`
                  : 'Đêm nay không có nạn nhân bị Sói cắn (hoặc đã được Bảo Vệ che chắn).'}
                {player.witch_poison_available ? ' Bạn có thể chọn 1 người trên bàn để đầu độc.' : ''}
              </span>
              <div className="ww-action-row">
                {player.witch_heal_available && player.witch_victim !== null && (
                  <label className="ww-inline-check">
                    <input
                      type="checkbox"
                      checked={witchHeal}
                      onChange={e => setWitchHeal(e.target.checked)}
                    />
                    <span>Dùng bình Cứu cho {seatName(seats, player.witch_victim)}</span>
                  </label>
                )}
                <button
                  type="button"
                  className="ww-btn ww-btn-primary"
                  disabled={!canAct}
                  onClick={() => emit({ type: 'witch_act', heal: witchHeal, poison: selectedTargets[0] ?? null })}
                >
                  {witchHeal || selectedTargets.length > 0 ? 'Xác nhận dùng thuốc' : 'Bỏ qua (không dùng thuốc)'}
                </button>
              </div>
            </div>
          );
        default:
          return null;
      }
    }

    if (phase.kind === 'hunter_shot') {
      return (
        <div className="ww-action-bar">
          <span>Bạn đã bị loại! Chọn 1 người chơi còn sống để kéo theo.</span>
          <button
            type="button"
            className="ww-btn ww-btn-danger"
            disabled={!canAct || selectedTargets.length !== 1}
            onClick={() => emit({ type: 'hunter_shoot', target: selectedTargets[0] })}
          >
            Bắn mục tiêu
          </button>
        </div>
      );
    }

    return (
      <div className="ww-action-bar">
        <span>Chọn 1 người trên bàn để bỏ phiếu treo cổ, hoặc bỏ phiếu trắng.</span>
        <div className="ww-action-row">
          <button
            type="button"
            className="ww-btn ww-btn-danger"
            disabled={!canAct || selectedTargets.length !== 1}
            onClick={() => emit({ type: 'day_vote', target: selectedTargets[0] })}
          >
            Treo cổ {selectedTargets.length === 1 ? seatName(seats, selectedTargets[0]) : '…'}
          </button>
          <button
            type="button"
            className="ww-btn ww-btn-secondary"
            disabled={!canAct}
            onClick={() => emit({ type: 'day_vote', target: null })}
          >
            Bỏ phiếu trắng
          </button>
        </div>
      </div>
    );
  }

  return (
    <section
      className={`game-werewolf ww-board ${isNight ? 'ww-theme-night' : 'ww-theme-day'}`}
      aria-label="Bàn Ma Sói"
    >
      <header className="ww-topbar">
        <div className="ww-phase-pill">
          <span className="ww-phase-icon" aria-hidden="true">{isNight ? '☾' : '☀'}</span>
          <div>
            <h2 className="ww-phase-heading">{phaseTitle(table.phase, player?.active_night_step ?? null, seats)}</h2>
            <p className="ww-phase-sub">
              Phòng {room.code} · {table.players.filter(p => p.alive).length}/{table.players.length} người còn sống
            </p>
          </div>
        </div>
        <div className="ww-topbar-actions">
          <button type="button" className="ww-btn ww-btn-secondary" onClick={() => setShowDeckModal(v => !v)}>
            Bộ bài ({table.players.length})
          </button>
          {isHost && !isOver && (
            <button type="button" className="ww-btn ww-btn-secondary" disabled={props.disabled} onClick={props.hostSkip}>
              Bỏ qua lượt chờ
            </button>
          )}
          {props.roomTools}
          {props.roomMenu ? (
            <details className="ww-room-menu">
              <summary className="ww-btn ww-btn-secondary">Phòng</summary>
              <div className="ww-room-menu-panel">{props.roomMenu}</div>
            </details>
          ) : (
            <button type="button" className="ww-btn ww-btn-secondary" onClick={props.leaveRoom}>
              Rời phòng
            </button>
          )}
        </div>
      </header>

      {props.actionError && (
        <p className="ww-error" role="alert">{props.actionError}</p>
      )}

      {renderActionPanel()}

      <div className="ww-layout">
        {player && (
          <aside className="ww-my-panel" aria-label="Vai trò của bạn">
            <div className="ww-my-panel-head">
              <h3>Lá bài của bạn</h3>
              <button
                type="button"
                className="ww-btn ww-btn-ghost"
                onClick={() => setHideMyCard(v => !v)}
              >
                {hideMyCard ? 'Hiện bài' : 'Úp bài'}
              </button>
            </div>
            <RoleCard role={player.your_role} faceDown={hideMyCard} size="lg" showSummary />
            {!hideMyCard && (
              <div className="ww-secrets">
                <span className={`ww-badge ww-badge-${player.your_team}`}>{teamLabel(player.your_team)}</span>
                {player.is_wolf_pack && player.your_role !== 'werewolf' && player.your_role !== 'alpha_wolf' && (
                  <p className="ww-secret-note">Bạn đã biến thành Ma Sói và gia nhập bầy Sói!</p>
                )}
                {player.known_wolves.length > 0 && (
                  <p className="ww-secret-note">
                    <strong>Bầy Sói:</strong> {player.known_wolves.map(id => seatName(seats, id)).join(', ')}
                  </p>
                )}
                {player.lover !== null && (
                  <p className="ww-secret-note ww-secret-lover">
                    ♥ Tình Nhân của bạn: <strong>{seatName(seats, player.lover)}</strong>
                  </p>
                )}
                {player.cupid_lovers && (
                  <p className="ww-secret-note">
                    ♥ Đã ghép đôi: {seatName(seats, player.cupid_lovers[0])} & {seatName(seats, player.cupid_lovers[1])}
                  </p>
                )}
                {player.your_role === 'witch' && !player.is_wolf_pack && (
                  <p className="ww-secret-note">
                    Bình Cứu: <strong>{player.witch_heal_available ? 'Còn' : 'Đã dùng'}</strong> · Bình Độc:{' '}
                    <strong>{player.witch_poison_available ? 'Còn' : 'Đã dùng'}</strong>
                  </p>
                )}
                {player.seer_history.length > 0 && (
                  <div className="ww-history">
                    <strong>Sổ Tiên Tri</strong>
                    <ul>
                      {player.seer_history.map((item, idx) => (
                        <li key={idx}>
                          Đêm {item.night}: {seatName(seats, item.target)} →{' '}
                          <strong className={item.is_wolf ? 'ww-text-wolf' : 'ww-text-safe'}>
                            {item.is_wolf ? 'MA SÓI' : 'Không phải Sói'}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {player.sorcerer_history.length > 0 && (
                  <div className="ww-history">
                    <strong>Sổ Pháp Sư</strong>
                    <ul>
                      {player.sorcerer_history.map((item, idx) => (
                        <li key={idx}>
                          Đêm {item.night}: {seatName(seats, item.target)} →{' '}
                          <strong>{item.is_seer ? 'TIÊN TRI' : 'Không phải Tiên Tri'}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        <main className="ww-village" aria-label="Danh sách người chơi">
          <div className="ww-seats-grid">
            {table.players.map(seat => {
              const selectable = isTargetSelectable(seat.id);
              const selected = selectedTargets.includes(seat.id);
              const isMe = player?.you === seat.id;
              const isKnownWolf = Boolean(player?.known_wolves.includes(seat.id));
              const isLover = player?.lover === seat.id;
              const isWinner = table.winning_players.includes(seat.id);
              const wolfVoteFor = player?.wolf_votes.filter(v => v.target === seat.id) ?? [];
              const displayRole = seat.role ?? (isMe && !hideMyCard ? player.your_role : null);

              return (
                <button
                  key={seat.id}
                  type="button"
                  disabled={!selectable}
                  onClick={() => toggleTarget(seat.id)}
                  className={[
                    'ww-seat-card',
                    !seat.alive ? 'is-dead' : '',
                    selectable ? 'is-selectable' : '',
                    selected ? 'is-selected' : '',
                    isMe ? 'is-me' : '',
                    isWinner ? 'is-winner' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="ww-seat-top">
                    <span className="ww-seat-name">
                      {seatName(seats, seat.id)}
                      {isMe && ' (Bạn)'}
                    </span>
                    <span className={`ww-status-dot ${seat.alive ? 'alive' : 'dead'}`}>
                      {seat.alive ? 'Sống' : 'Đã loại'}
                    </span>
                  </div>

                  <RoleCard role={displayRole} faceDown={!displayRole} size="sm" />

                  <div className="ww-seat-badges">
                    {!hideMyCard && isKnownWolf && !isOver && <span className="ww-mini-badge ww-mini-wolf">Bầy Sói</span>}
                    {!hideMyCard && isLover && <span className="ww-mini-badge ww-mini-lover">♥ Tình Nhân</span>}
                    {seat.is_revealed_prince && <span className="ww-mini-badge ww-mini-royal">Hoàng Tử</span>}
                    {seat.is_revealed_mayor && <span className="ww-mini-badge ww-mini-royal">Thị Trưởng ×2</span>}
                    {seat.death_cause && (
                      <span className="ww-mini-badge ww-mini-dead">{deathCauseLabel(seat.death_cause)}</span>
                    )}
                    {seat.day_vote && (
                      <span className="ww-mini-badge ww-mini-vote">
                        {seat.day_vote.kind === 'abstain'
                          ? 'Phiếu trắng'
                          : `Bầu: ${seatName(seats, seat.day_vote.target)}`}
                      </span>
                    )}
                    {!hideMyCard && wolfVoteFor.length > 0 && (
                      <span className="ww-mini-badge ww-mini-wolf">
                        Sói chọn ({wolfVoteFor.length})
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </main>

        <aside className="ww-log-panel" aria-label="Nhật ký làng">
          <h3>Nhật ký làng</h3>
          <ol className="ww-log-list">
            {state.log.length === 0 ? (
              <li className="ww-log-item ww-log-neutral">Chưa có sự kiện nào.</li>
            ) : (
              [...state.log].reverse().map(entry => (
                <li key={entry.id} className={`ww-log-item ww-log-${entry.tone}`}>
                  {entry.text}
                </li>
              ))
            )}
          </ol>
        </aside>
      </div>

      {showDeckModal && (
        <DeckDialog
          playerCount={table.players.length}
          roleCounts={table.role_counts}
          onClose={() => setShowDeckModal(false)}
        />
      )}
    </section>
  );
}
