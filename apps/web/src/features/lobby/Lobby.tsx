import { useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import type { ClientMessage } from '../../generated/protocol';
import { PROTOCOL_VERSION } from '../../generated/protocol';
import { SaloonBackdrop } from '../../shared/SaloonScene';

type Props = { disabled: boolean; send: (message: ClientMessage) => void };

export default function Lobby({ disabled, send }: Props) {
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const reduced = useReducedMotion();
  const nameLength = Array.from(nickname.trim()).length;
  const validName = nameLength >= 1 && nameLength <= 20;
  const feedback = { whileHover: { scale: reduced || disabled ? 1 : 1.02 }, whileTap: { scale: reduced || disabled ? 1 : .98 }, transition: { duration: .1 } };
  return (
    <section className="saloon-lobby" aria-label="Sảnh BANG!">
      <SaloonBackdrop />
      <header className="lobby-heading">
        <p className="saloon-eyebrow">18h40 games · Quán quen miền Tây</p>
        <h2 className="saloon-sign western-wood" data-scene-title tabIndex={-1}>BANG!</h2>
        <p className="lobby-invitation">Hẹn nhau một ván</p>
      </header>
      <div className="lobby-posters">
        <form className="saloon-poster" aria-labelledby="create-heading" onSubmit={(event) => {
          event.preventDefault();
          if (validName && !disabled) send({ v: PROTOCOL_VERSION, type: 'create_room', nickname });
        }}>
          <span className="poster-star" aria-hidden="true">✦</span>
          <h3 id="create-heading">Tạo phòng</h3>
          <p className="poster-description">Mở bàn, gọi hội bạn vào chơi.</p>
          <div className="poster-fields">
            <label htmlFor="nickname">Tên của bạn</label>
            <input id="nickname" autoComplete="nickname" autoCapitalize="words" value={nickname} onChange={(event) => setNickname(event.target.value)} aria-describedby="nickname-hint" className="saloon-field" />
            <p id="nickname-hint" className="field-hint">Từ 1 đến 20 ký tự · {nameLength}/20</p>
          </div>
          <m.button {...feedback} className="western-button" disabled={disabled || !validName} type="submit">Tạo phòng <span aria-hidden="true">✦</span></m.button>
        </form>
        <form className="saloon-poster join-poster" aria-labelledby="join-heading" onSubmit={(event) => {
          event.preventDefault();
          if (validName && roomCode.trim().length === 5 && !disabled) send({ v: PROTOCOL_VERSION, type: 'join_room', room_code: roomCode.trim(), nickname });
        }}>
          <span className="poster-star" aria-hidden="true">✦</span>
          <h3 id="join-heading">Vào phòng</h3>
          <p className="poster-description">Bạn bè đã đợi? Kéo ghế vào bàn.</p>
          <div className="poster-fields">
            <label htmlFor="join-nickname">Tên của bạn</label>
            <input id="join-nickname" autoComplete="nickname" autoCapitalize="words" value={nickname} onChange={(event) => setNickname(event.target.value)} aria-describedby="join-nickname-hint" className="saloon-field" />
            <p id="join-nickname-hint" className="field-hint">Từ 1 đến 20 ký tự · {nameLength}/20</p>
            <label htmlFor="room-code">Mã phòng</label>
            <input id="room-code" autoComplete="off" autoCapitalize="characters" maxLength={5} value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ABCDE" aria-describedby="room-code-hint" className="saloon-field room-code-input" />
            <p id="room-code-hint" className="field-hint">Nhập mã 5 ký tự từ chủ phòng.</p>
          </div>
          <m.button {...feedback} className="western-button" disabled={disabled || !validName || roomCode.trim().length !== 5} type="submit">Vào phòng <span aria-hidden="true">→</span></m.button>
        </form>
      </div>
      <p className="lobby-footnote">4–7 người chơi <span aria-hidden="true">✦</span> Một bàn, đủ chuyện</p>
    </section>
  );
}
