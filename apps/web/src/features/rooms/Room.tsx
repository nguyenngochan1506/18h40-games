import type { ClientMessage, GameSnapshot, RoomView } from '../../generated/protocol';
import { PROTOCOL_VERSION } from '../../generated/protocol';
import GameBoard from '../game/GameBoard';
import type { LogEntry } from '../game/log';
import { selectGameView } from '../game/state';

type Props = { room: RoomView; game: GameSnapshot | null; log: LogEntry[]; viewer: number | null; disabled: boolean; send: (message: ClientMessage) => void };

export default function Room({ room, game, log, viewer, disabled, send }: Props) {
  const players = room.members.filter((member) => member.role === 'player').length;
  const you = room.members.find((member) => member.id === room.you);
  const host = room.host === room.you;
  const waiting = room.phase === 'waiting';
  const missing = Math.max(0, room.min_players - players);
  if (game && !waiting) return <GameBoard game={game} room={room} log={log} viewer={viewer} disabled={disabled}
    endGame={() => send({ v: PROTOCOL_VERSION, type: 'end_game' })}
    sendAction={(action) => send({ v: PROTOCOL_VERSION, type: 'game_action', action })}
    roomMenu={<><h2 id="room-overview">Phòng {room.code}</h2><p>{players} người chơi · Đang chơi</p><ul className="room-presence">{room.members.map((member) => <li key={member.id}><span>{member.nickname}{member.id === room.you ? ' (bạn)' : ''}</span><span>{member.online ? 'Đang kết nối' : 'Mất kết nối'}</span></li>)}</ul>
      <a className="action secondary" href="#room-overview">Về phòng</a>
      {host && !selectGameView(game.view).table.winner && <button className="action secondary" disabled={disabled} onClick={() => send({ v: PROTOCOL_VERSION, type: 'host_skip' })}>Bỏ qua lượt chờ</button>}
      {host && <button className="action secondary" disabled={disabled} onClick={() => send({ v: PROTOCOL_VERSION, type: 'end_game' })}>Kết thúc ván</button>}
      <button className="action" disabled={disabled} onClick={() => send({ v: PROTOCOL_VERSION, type: 'leave_room' })}>Rời phòng</button></>}
  />;
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-300 pb-5">
        <div><h2 id="room-overview" className="text-sm text-stone-600">Mã phòng</h2><p className="mt-1 text-3xl font-semibold tracking-widest">{room.code}</p></div>
        <div role="status" aria-live="polite"><p className="font-medium">{waiting ? 'Đang chờ' : 'Đang chơi'}</p><p className="mt-1 text-sm text-stone-600">{players} người chơi · cần {room.min_players}–{room.max_players}</p></div>
      </div>
      <h3 className="mt-6 font-medium">Thành viên ({room.members.length})</h3>
      <ul className="mt-2 divide-y divide-stone-200" aria-live="polite">
        {room.members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
            <div className="min-w-0 break-words"><span className="font-medium">{member.nickname}</span>{member.id === room.you && <span className="ml-2 text-sm text-emerald-800">Bạn</span>}<p className="mt-1 text-sm text-stone-600">{member.role === 'player' ? 'Người chơi' : 'Khán giả'}{member.id === room.host ? ' · Chủ phòng' : ''}</p></div>
            <span className={`text-sm ${member.online ? 'text-emerald-800' : 'text-stone-500'}`}>{member.online ? 'Online' : 'Offline'}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-3">
        {waiting && <a className="action secondary" href="#room-overview">Về phòng</a>}
        {you?.role === 'spectator' && waiting && <button className="action" disabled={disabled || players >= room.max_players} onClick={() => send({ v: PROTOCOL_VERSION, type: 'take_seat' })}>Tham gia ván</button>}
        {host && waiting && <button className="action" disabled={disabled || missing > 0} onClick={() => send({ v: PROTOCOL_VERSION, type: 'start_game' })}>Bắt đầu</button>}
        {host && !waiting && (!game || !selectGameView(game.view).table.winner) && <button className="action" disabled={disabled} onClick={() => send({ v: PROTOCOL_VERSION, type: 'end_game' })}>Kết thúc ván</button>}
        <button className="action secondary" disabled={disabled} onClick={() => send({ v: PROTOCOL_VERSION, type: 'leave_room' })}>Rời phòng</button>
      </div>
      <div className="mt-3 space-y-1 text-sm text-stone-600">
        {waiting && missing > 0 && <p>Cần thêm {missing} người chơi để bắt đầu.</p>}
        {waiting && you?.role === 'spectator' && players >= room.max_players && <p>Đã đủ ghế chơi. Hãy chờ một ghế trống.</p>}
        {!waiting && !game && <p>Đang nhận bàn chơi từ máy chủ.</p>}
        {disabled && <p>Hãy chờ kết nối hoặc yêu cầu hiện tại hoàn tất.</p>}
      </div>
    </section>
  );
}
