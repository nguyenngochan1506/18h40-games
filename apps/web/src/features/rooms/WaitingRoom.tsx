import { useState } from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import type { ClientMessage, RoomView } from '../../generated/protocol';
import { PROTOCOL_VERSION } from '../../generated/protocol';
import { DecodedImage } from '../../shared/SaloonScene';
import { landscapeScenes } from '../game/assetMap';
import { waitingSeats } from './waitingSeats';
import { availableGames } from '../lobby/games';
import WaitingSettings from './WaitingSettings';

type Props = { room: RoomView; disabled: boolean; send: (message: ClientMessage) => void };

export default function WaitingRoom({ room, disabled, send }: Props) {
  const reduced = useReducedMotion();
  const info = availableGames[room.game];
  const [copyStatus, setCopyStatus] = useState('');
  const [copying, setCopying] = useState(false);
  const seats = waitingSeats(room);
  const spectators = room.members.filter(member => member.role === 'spectator');
  const you = room.members.find(member => member.id === room.you);
  const host = room.host === room.you;
  const waiting = room.phase === 'waiting';
  const missing = Math.max(0, room.min_players - seats.length);
  const feedback = { whileHover: { scale: reduced || disabled ? 1 : 1.02 }, whileTap: { scale: reduced || disabled ? 1 : .98 }, transition: { duration: .1 } };
  async function copyCode() {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(room.code);
      setCopyStatus('Đã chép');
    } catch {
      setCopyStatus(`Chưa chép được. Hãy chọn mã ${room.code} và sao chép.`);
    } finally {
      setCopying(false);
    }
  }
  return <section className={`saloon-waiting${waiting ? ' with-settings' : ''}`} aria-label={`Phòng ${room.code}`}>
    <div className="waiting-stage">
      <DecodedImage className="waiting-backdrop" src={landscapeScenes[7]} />
      <div className="waiting-vignette" aria-hidden="true" />
      <header className="waiting-code western-wood">
        <h2 id="room-overview" data-scene-title tabIndex={-1}>Mã phòng</h2>
        <div className="code-row"><strong>{room.code}</strong><button className="copy-code" type="button" onClick={() => void copyCode()} disabled={copying} aria-label="Sao chép mã phòng" title="Sao chép mã phòng"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="1" /><path d="M16 8V3H3v13h5" /></svg></button></div>
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
        <p className="saloon-eyebrow">{info.name} · Bàn bạn bè</p>
        <div className="waiting-status" role="status" aria-live="polite"><h3>{waiting ? 'Đang chờ' : 'Đang chơi'}</h3><p>{seats.length} người chơi · cần {info.minPlayers}–{info.maxPlayers}</p></div>
        <div className="waiting-primary">
          {you?.role === 'spectator' && waiting && <m.button {...feedback} className="western-button" disabled={disabled || seats.length >= room.max_players} onClick={() => send({ v: PROTOCOL_VERSION, type: 'take_seat' })}>Tham gia ván</m.button>}
          {host && waiting && <m.button {...feedback} className="western-button" disabled={disabled || missing > 0} aria-describedby="waiting-help" onClick={() => send({ v: PROTOCOL_VERSION, type: 'start_game' })}>Bắt đầu <span aria-hidden="true">→</span></m.button>}
          {host && !waiting && <m.button {...feedback} className="western-button" disabled={disabled} onClick={() => send({ v: PROTOCOL_VERSION, type: 'end_game' })}>Kết thúc ván</m.button>}
        </div>
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
        {waiting && <a className="western-button quiet-button" href="#room-overview">Về phòng</a>}
        <m.button {...feedback} className="western-button quiet-button" disabled={disabled} onClick={() => send({ v: PROTOCOL_VERSION, type: 'leave_room' })}>Rời phòng</m.button>
      </nav>
    </div>
    {waiting && <WaitingSettings key={JSON.stringify([room.settings, seats.length])} settings={room.settings} players={seats.length} editable={host && !disabled} send={send} />}
  </section>;
}
