import type { ClientMessage, GameSnapshot, RoomView } from '../../generated/protocol';
import { PROTOCOL_VERSION } from '../../generated/protocol';
import GameBoard from '../game/GameBoard';
import WaitingRoom from './WaitingRoom';
import type { FxBatch } from '../game/fx';
import type { LogEntry } from '../game/log';
import { selectGameView } from '../game/state';

type Props = { room: RoomView; game: GameSnapshot | null; log: LogEntry[]; fxBatch: FxBatch | null; soundBatch: FxBatch | null; fxEnabled: boolean; viewer: number | null; disabled: boolean; pending?: boolean; requestVersion?: number; actionError?: string | null; send: (message: ClientMessage) => void };

export default function Room({ room, game, log, fxBatch, soundBatch, fxEnabled, viewer, disabled, pending = false, requestVersion = 0, actionError = null, send }: Props) {
  const players = room.members.filter((member) => member.role === 'player').length;
  const host = room.host === room.you;
  const waiting = room.phase === 'waiting';
  if (game && !waiting) return <GameBoard game={game} room={room} log={log} fxBatch={fxBatch} soundBatch={soundBatch} fxEnabled={fxEnabled} viewer={viewer} disabled={disabled} pending={pending} requestVersion={requestVersion} actionError={actionError}
    endGame={() => send({ v: PROTOCOL_VERSION, type: 'end_game' })}
    sendAction={(action) => send({ v: PROTOCOL_VERSION, type: 'game_action', action })}
    roomMenu={<><h2 id="room-overview">Phòng {room.code}</h2><p>{players} người chơi · Đang chơi</p><ul className="room-presence">{room.members.map((member) => <li key={member.id}><span>{member.nickname}{member.id === room.you ? ' (bạn)' : ''}</span><span>{member.online ? 'Đang kết nối' : 'Mất kết nối'}</span></li>)}</ul>
      <a className="action secondary" href="#room-overview">Về phòng</a>
      {host && !selectGameView(game.view).table.winner && <button className="action secondary" disabled={disabled} onClick={() => send({ v: PROTOCOL_VERSION, type: 'host_skip' })}>Bỏ qua lượt chờ</button>}
      {host && <button className="action secondary" disabled={disabled} onClick={() => send({ v: PROTOCOL_VERSION, type: 'end_game' })}>Kết thúc ván</button>}
      <button className="action" disabled={disabled} onClick={() => send({ v: PROTOCOL_VERSION, type: 'leave_room' })}>Rời phòng</button></>}
  />;
  return <WaitingRoom room={room} disabled={disabled} send={send} />;
}
