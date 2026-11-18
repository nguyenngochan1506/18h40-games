import { useState } from 'react';
import type { ClientMessage } from '../../generated/protocol';
import { PROTOCOL_VERSION } from '../../generated/protocol';

type Props = { disabled: boolean; send: (message: ClientMessage) => void };

export default function Lobby({ disabled, send }: Props) {
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const nameLength = Array.from(nickname.trim()).length;
  const validName = nameLength >= 1 && nameLength <= 20;
  return (
    <div className="mt-8 space-y-8">
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        if (validName && !disabled) send({ v: PROTOCOL_VERSION, type: 'create_room', nickname });
      }}>
        <div>
          <label htmlFor="nickname">Tên của bạn</label>
          <input id="nickname" autoComplete="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} aria-describedby="nickname-hint" className="field" />
          <p id="nickname-hint" className="mt-2 text-sm text-stone-600">Từ 1 đến 20 ký tự · {nameLength}/20</p>
        </div>
        <button className="action" disabled={disabled || !validName} type="submit">Tạo phòng</button>
      </form>
      <form className="space-y-4 border-t border-stone-300 pt-6" onSubmit={(event) => {
        event.preventDefault();
        if (validName && roomCode.trim().length === 5 && !disabled) send({ v: PROTOCOL_VERSION, type: 'join_room', room_code: roomCode.trim(), nickname });
      }}>
        <div>
          <label htmlFor="room-code">Mã phòng</label>
          <input id="room-code" autoComplete="off" autoCapitalize="characters" maxLength={5} value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ABCDE" className="field uppercase tracking-widest" />
        </div>
        <button className="action secondary" disabled={disabled || !validName || roomCode.trim().length !== 5} type="submit">Vào phòng</button>
      </form>
    </div>
  );
}
