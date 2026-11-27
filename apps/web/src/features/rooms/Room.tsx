import { Fragment, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ClientMessage, RoomView } from '../../generated/protocol';
import { PROTOCOL_VERSION } from '../../generated/protocol';
import { loadGame, registry } from '../../games/registry';
import type { GameClient } from '../../games/types';
import type { GameSyncState } from '../../shared/gameSync';
import WaitingRoom from './WaitingRoom';
import type { Voice } from './voice.ts';

type Props = { room: RoomView; roomTools?: ReactNode; voice?: Voice; sync: GameSyncState; fxEnabled: boolean; disabled: boolean; pending?: boolean; requestVersion?: number; actionError?: string | null; actionErrorCode?: string | null; consume: (through: number) => void; send: (message: ClientMessage) => void };
export default function Room({ room, roomTools, voice, sync, fxEnabled, disabled, pending = false, requestVersion = 0, actionError = null, actionErrorCode = null, consume, send }: Props) {
  const [loaded, setLoaded] = useState<{ kind: string; client: GameClient } | null>(null);
  const [failedGame, setFailedGame] = useState<RoomView['game'] | null>(null);
  const [retry, setRetry] = useState(0);
  const info = registry[room.game];
  useEffect(() => {
    let active = true;
    setLoaded(null); setFailedGame(null);
    void loadGame(room.game).then(client => { if (active) setLoaded({ kind: room.game, client }); }).catch(() => { if (active) setFailedGame(room.game); });
    return () => { active = false; };
  }, [room.code, room.game, retry]);
  const leaveRoom = () => send({ v: PROTOCOL_VERSION, type: 'leave_room' });
  const retryLoad = () => setRetry(value => value + 1);
  const loadFailed = failedGame === room.game;
  const waiting = room.phase === 'waiting';
  if (!info?.enabled || (!waiting && loadFailed)) return <section className="saloon-restoring"><div className="saloon-poster"><h2>{info?.name ?? 'Trò chơi không hỗ trợ'}</h2><p role="alert">{info?.enabled ? 'Không tải được trò chơi. Hãy thử lại hoặc rời phòng.' : 'Trò chơi chưa được hỗ trợ. Bạn vẫn có thể rời phòng.'}</p>{info?.enabled && <button className="western-button" onClick={retryLoad}>Thử tải lại</button>}<button className="western-button" disabled={disabled} onClick={leaveRoom}>Rời phòng</button>{roomTools}</div></section>;
  const client = loaded?.kind === room.game ? loaded.client : null;
  const Root = client?.Root ?? Fragment;
  if (waiting) return <Root><WaitingRoom room={room} roomTools={roomTools} disabled={disabled} send={send} Settings={client?.Settings} waitingScene={client?.waitingScene} retryLoad={loadFailed ? retryLoad : undefined} /></Root>;
  if (!sync.game || !client) return <section className="saloon-restoring"><div className="saloon-poster"><h2>Phòng {room.code}</h2><p role="status">Đang tải trò chơi…</p><button className="western-button" disabled={disabled} onClick={leaveRoom}>Rời phòng</button>{roomTools}</div></section>;
  const Board = client.Board;
  const host = room.host === room.you;
  const players = room.members.filter(member => member.role === 'player').length;
  return <Root><Board key={sync.generation} room={room} roomTools={roomTools} voice={voice} sync={sync} consume={consume} disabled={disabled || sync.frames.length > 0} pending={pending} requestVersion={requestVersion} actionError={actionError} actionErrorCode={actionErrorCode} fxEnabled={fxEnabled}
    sendAction={action => { if (!disabled && sync.frames.length === 0) send({ v: PROTOCOL_VERSION, type: 'game_action', action }); }}
    endGame={() => send({ v: PROTOCOL_VERSION, type: 'end_game' })} leaveRoom={leaveRoom} hostSkip={() => send({ v: PROTOCOL_VERSION, type: 'host_skip' })}
    roomMenu={<><h2 id="room-overview">{info.name} · Phòng {room.code}</h2><p>{players} người chơi · Đang chơi</p><ul className="room-presence">{room.members.map(member => <li key={member.id}><span>{member.nickname}{member.id === room.you ? ' (bạn)' : ''}</span><span>{member.online ? 'Đang kết nối' : 'Mất kết nối'}</span></li>)}</ul><a className="action secondary" href="#room-overview">Về phòng</a>{host && <button className="action secondary" disabled={disabled} onClick={() => send({ v: PROTOCOL_VERSION, type: 'end_game' })}>Kết thúc ván</button>}<button className="action" disabled={disabled} onClick={leaveRoom}>Rời phòng</button></>} /></Root>;
}
