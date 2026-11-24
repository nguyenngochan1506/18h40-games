import { useEffect, useRef, useState } from 'react';
import type { GameBoardProps, GameClient } from '../types.ts';
import { GameLifetime } from './GameScope';
import RawBoard from './Board';
import Settings from './Settings';
import { initialBangState, receiveFrame, selectGameView } from './state.ts';
import { usePreloadedImages } from '../../shared/SaloonScene';
import { gameSceneImages } from './scene/sceneImages.ts';
import { sound } from './sound/sound.ts';

function Board(props: GameBoardProps) {
  const { sync, consume, room } = props;
  const first = sync.frames[0];
  const [state, setState] = useState(() => first?.reset ? receiveFrame(initialBangState, first, sync.viewer) : initialBangState);
  const seen = useRef<number | null>(first?.reset ? first.id : null);
  const frame = sync.frames[0];
  const [boardRequestVersion, setBoardRequestVersion] = useState(props.requestVersion);
  // A pong can arrive before the queued snapshots have reached the rendered board.
  if (sync.frames.length === 0 && boardRequestVersion !== props.requestVersion) setBoardRequestVersion(props.requestVersion);
  const game = state.game;
  const ready = usePreloadedImages(game ? gameSceneImages(selectGameView(game.view).table.players, sync.viewer, window.innerWidth >= 900) : []);
  useEffect(() => {
    if (!frame || !ready || sync.desynced) return;
    if (seen.current === frame.id) { consume(frame.id); return; }
    // Give each accepted batch its own render/task, including setup sounds after image decoding.
    const timer = window.setTimeout(() => {
      seen.current = frame.id;
      setState(current => receiveFrame(current, frame, sync.viewer));
      consume(frame.id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [frame, ready, consume, sync.viewer, sync.desynced]);
  useEffect(() => {
    if (props.actionErrorCode === 'illegal_action' && props.fxEnabled) void sound.play('invalid');
  }, [props.actionErrorCode]);
  if (!game || !ready) return <section className="saloon-restoring"><p role="status">Đang tải bàn chơi…</p><button className="western-button" onClick={props.leaveRoom}>Rời phòng</button>{props.roomTools}</section>;
  const over = !!selectGameView(game.view).table.winner;
  return <RawBoard game={game} room={room} log={state.log} fxBatch={state.fxBatch} soundBatch={state.soundBatch} viewer={sync.viewer}
    disabled={props.disabled || sync.frames.length > 0} pending={props.pending} requestVersion={boardRequestVersion} actionError={props.actionError}
    fxEnabled={props.fxEnabled} sendAction={payload => props.sendAction({ game: 'bang', payload })} endGame={props.endGame} leaveRoom={props.leaveRoom}
    roomTools={props.roomTools} roomMenu={<>{props.roomMenu}{room.host === room.you && !over && <button className="action secondary" disabled={props.disabled} onClick={props.hostSkip}>Bỏ qua lượt chờ</button>}</>} />;
}

export const client: GameClient = { Board, Settings, Root: GameLifetime };
