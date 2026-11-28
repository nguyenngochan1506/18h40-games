import { useId, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import type { ClientMessage, RoomView } from '../../generated/protocol';
import { PROTOCOL_VERSION } from '../../generated/protocol';
import { DecodedImage } from '../../shared/SaloonScene';
import { waitingBackdrop } from '../../shared/waitingScene';
import type { GameClient, GameInfo, GameWaitingScene } from '../../games/types';
import { waitingSeats } from './waitingSeats';
import { games, registry } from '../../games/registry';
import { inviteLink } from '../../shared/lib/roomRoute';
import { copyText } from '../../shared/lib/clipboard';

type Props = { room: RoomView; roomTools?: ReactNode; disabled: boolean; send: (message: ClientMessage) => void; Settings?: GameClient['Settings']; waitingScene?: GameWaitingScene; retryLoad?: () => void };

function ChangeGameForm({ options, disabled, send }: Pick<Props, 'disabled' | 'send'> & { options: GameInfo[] }) {
  const hintId = useId();
  const [selection, setSelection] = useState('');
  const nextGame = options.find(game => game.id === selection);

  return <form className="waiting-game-switch saloon-poster" onSubmit={event => {
    event.preventDefault();
    if (!disabled && nextGame) send({ v: PROTOCOL_VERSION, type: 'change_game', game: nextGame.id });
  }}>
    <label>
      Game tiếp theo
      <select className="saloon-field" value={selection} disabled={disabled} aria-describedby={hintId} onChange={event => setSelection(event.target.value)}>
        <option value="" disabled>Chọn game khác</option>
        {options.map(game => <option key={game.id} value={game.id}>{game.name}</option>)}
      </select>
    </label>
    <p id={hintId} className="field-hint">Mọi người sẽ cần vào ghế lại. Ai muốn chơi ván mới bấm Tham gia ván.</p>
    <button className="western-button" type="submit" disabled={disabled || !nextGame}>Đổi game</button>
  </form>;
}

export default function WaitingRoom({ room, roomTools, disabled, send, Settings, waitingScene, retryLoad }: Props) {
  const reduced = useReducedMotion();
  const info = registry[room.game];
  const [copyStatus, setCopyStatus] = useState('');
  const [copying, setCopying] = useState(false);
  const [heirId, setHeirId] = useState('');
  const seatedPlayers = room.members.filter(member => member.role === 'player');
  const seats = waitingScene
    ? seatedPlayers.map((member, index) => {
        const seat = waitingScene.seat(index, room.max_players, seatedPlayers.length);
        return { member, seat, slot: index, actor: waitingScene.actor(index, seat.view) };
      })
    : waitingSeats(room);
  const backdrop = waitingScene?.backdrop ?? waitingBackdrop;
  const spectators = room.members.filter(member => member.role === 'spectator');
  const you = room.members.find(member => member.id === room.you);
  const host = room.host === room.you;
  const heirs = host ? room.members.filter(member => member.online && member.id !== room.you) : [];
  const waiting = room.phase === 'waiting';
  const nextGames = host && waiting ? games.filter(game => game.enabled && game.id !== room.game) : [];
  const missing = Math.max(0, room.min_players - seats.length);
  const feedback = { whileHover: { scale: reduced || disabled ? 1 : 1.02 }, whileTap: { scale: reduced || disabled ? 1 : .98 }, transition: { duration: .1 } };
  const settings = waiting && Settings && <Settings key={JSON.stringify([room.settings, seats.length])} settings={room.settings} players={seats.length} maxPlayers={room.max_players} editable={host && !disabled} onChange={settings => send({ v: PROTOCOL_VERSION, type: 'update_settings', settings })} />;
  async function copyCode(link = false) {
    setCopying(true);
    try {
      await copyText(link ? inviteLink(window.location.origin, room.code) : room.code);
      setCopyStatus(link ? 'Đã sao chép link' : 'Đã chép');
    } catch {
      setCopyStatus(`Chưa sao chép được. Hãy gửi mã ${room.code} cho bạn bè.`);
    } finally {
      setCopying(false);
    }
  }
  return <section className={`saloon-waiting${waiting ? ' with-settings' : ''}${waitingScene?.className ? ` ${waitingScene.className}` : ''}`} aria-label={`Phòng ${room.code}`}>
    <div className="waiting-stage">
      <DecodedImage className="waiting-backdrop" src={backdrop} />
      <div className="waiting-vignette" aria-hidden="true" />
      <header className="waiting-code western-wood">
        <h2 id="room-overview" data-scene-title tabIndex={-1}>Mã phòng</h2>
        <div className="code-row"><strong>{room.code}</strong><button className="copy-code" type="button" onClick={() => void copyCode()} disabled={copying} aria-label="Sao chép mã phòng" title="Sao chép mã phòng"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="1" /><path d="M16 8V3H3v13h5" /></svg></button></div>
        <button className="western-button quiet-button copy-invite" type="button" disabled={copying} onClick={() => void copyCode(true)}>Sao chép link mời</button>
        <p className="copy-status" role="status" aria-live="polite">{copyStatus || 'Gửi mã này để rủ bạn vào bàn'}</p>
      </header>
      <ul className="waiting-seats" aria-label={`Người chơi (${seats.length})`} aria-live="polite" aria-relevant="all">
        <AnimatePresence>
          {seats.map(({ member, seat, slot, actor }) => <m.li key={member.id} className={`waiting-seat${member.online ? '' : ' is-offline'}`} data-waiting-slot={slot} data-seat-view={seat.view} data-seat-flip={seat.flip}
            style={{ '--seat-x': `${seat.x}%`, '--seat-y': `${seat.y}%`, '--actor-height': `${seat.actorHeight * 100}%` } as CSSProperties}
            initial={{ opacity: 0, y: reduced ? 0 : -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -12 }}
            transition={reduced ? { duration: .1 } : { type: 'spring', stiffness: 350, damping: 24, opacity: { duration: .2 } }}>
            <div className="waiting-portrait" style={{ transform: seat.flip ? 'scaleX(-1)' : undefined }}><DecodedImage src={actor} /></div>
            <m.div className={`waiting-name${member.id === room.you ? ' own-name' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? .1 : .2 }}>
              <strong>{member.id === room.host && <span className="host-star" title="Chủ phòng" aria-label="Chủ phòng">★</span>}{member.nickname}{member.id === room.you && <small> (bạn)</small>}</strong>
              <span>{member.online ? member.id === room.host ? 'Chủ phòng' : 'Đã vào bàn' : 'Mất kết nối'}</span>
            </m.div>
          </m.li>)}
        </AnimatePresence>
      </ul>
      <aside className="waiting-spectators western-wood" aria-label="Khán giả">
        <h3>Khán giả <span>{spectators.length}</span></h3>
        {spectators.length === 0 ? <p>Bạn bè có thể vào xem.</p> : <ul aria-live="polite">{spectators.map(member => <li key={member.id} className={member.online ? '' : 'is-offline'}><strong>{member.nickname}{member.id === room.you ? ' (bạn)' : ''}{member.id === room.host ? ' ★' : ''}</strong><small>{member.online ? 'Đang xem' : 'Mất kết nối'}{member.id === room.host ? ' · Chủ phòng' : ''}</small></li>)}</ul>}
      </aside>
      <div className="waiting-table-note saloon-poster">
        <p className="saloon-eyebrow" aria-live="polite">{info.name} · Bàn bạn bè</p>
        <div className="waiting-status" role="status" aria-live="polite"><h3>{waiting ? 'Đang chờ' : 'Đang chơi'}</h3><p>{seats.length} người chơi · cần {room.min_players}–{room.max_players}</p></div>
        <div className="waiting-primary">
          {you?.role === 'spectator' && waiting && <m.button {...feedback} className="western-button" disabled={disabled || seats.length >= room.max_players} onClick={() => send({ v: PROTOCOL_VERSION, type: 'take_seat' })}>Tham gia ván</m.button>}
          {host && waiting && <m.button {...feedback} className="western-button" disabled={disabled || missing > 0 || !Settings} aria-describedby="waiting-help" onClick={() => send({ v: PROTOCOL_VERSION, type: 'start_game' })}>Bắt đầu <span aria-hidden="true">→</span></m.button>}
          {host && !waiting && <m.button {...feedback} className="western-button" disabled={disabled} onClick={() => send({ v: PROTOCOL_VERSION, type: 'end_game' })}>Kết thúc ván</m.button>}
        </div>
        {heirs.length > 0 && <div className="give-host" role="group" aria-label="Nhường chủ phòng">
          <select aria-label="Người nhận quyền chủ phòng" disabled={disabled} value={heirs.some(member => member.id === heirId) ? heirId : ''} onChange={event => setHeirId(event.target.value)}>
            <option value="">Nhường chủ phòng cho…</option>
            {heirs.map(member => <option key={member.id} value={member.id}>{member.nickname}</option>)}
          </select>
          <button type="button" disabled={disabled || !heirs.some(member => member.id === heirId)} onClick={() => { send({ v: PROTOCOL_VERSION, type: 'transfer_host', member: heirId }); setHeirId(''); }}>Nhường</button>
        </div>}
        <div id="waiting-help" className="waiting-help" aria-live="polite">
          {waiting && missing > 0 && <p>Cần thêm {missing} người chơi để bắt đầu.</p>}
          {waiting && !host && <p>Chờ chủ phòng bắt đầu ván.</p>}
          {waiting && host && missing === 0 && <p>Đã đủ người. Bắt đầu khi mọi người sẵn sàng.</p>}
          {waiting && you?.role === 'spectator' && seats.length >= room.max_players && <p>Đã đủ ghế chơi. Hãy chờ một ghế trống.</p>}
          {!waiting && <p>Đang tải cảnh bàn chơi. Bạn sẽ vào bàn khi ảnh đã sẵn sàng.</p>}
          {disabled && <p>Hãy chờ kết nối hoặc yêu cầu hiện tại hoàn tất.</p>}
        </div>
      </div>
      <nav className="waiting-actions" aria-label="Thao tác phòng">
        {roomTools}
        {waiting && <a className="western-button quiet-button" href="#room-overview">Về phòng</a>}
        <m.button {...feedback} className="western-button quiet-button" disabled={disabled} onClick={() => send({ v: PROTOCOL_VERSION, type: 'leave_room' })}>Rời phòng</m.button>
      </nav>
    </div>
    {nextGames.length > 0 || retryLoad ? <div className="waiting-options">
      {retryLoad && <div className="waiting-load-error saloon-poster">
        <p role="alert">Không tải được trò chơi. Hãy thử tải lại.</p>
        <button className="western-button" type="button" onClick={retryLoad}>Thử tải lại</button>
      </div>}
      {nextGames.length > 0 && <ChangeGameForm key={`${room.code}:${room.game}`} options={nextGames} disabled={disabled} send={send} />}
      {settings}
    </div> : settings}
  </section>;
}
