import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useBlocker, useLocation, useNavigate, useParams } from 'react-router';
import { AnimatePresence, LazyMotion, domAnimation } from 'motion/react';
import { SaloonBackdrop, SceneTransition } from '../shared/SaloonScene';
import '../shared/saloon.css';
import { PROTOCOL_VERSION } from '../generated/protocol';
import type { ClientMessage, RoomView, ServerMessage } from '../generated/protocol';
import Room from '../features/rooms/Room';
import VoiceControls from '../features/rooms/VoiceControls';
import { createVoice } from '../features/rooms/voice';
import { consumeFrames, initialGameState, inputLocked, receiveGameState } from '../shared/gameSync';
import type { GameSyncState } from '../shared/gameSync';
import { errorMessages } from '../shared/lib/errors';
import { connectSocket } from '../shared/lib/socket';
import { createRequestTracker } from '../shared/lib/request';
import { loadSession, retryDelay, saveSession } from '../shared/lib/session';
import { isValidRoomCode, normalizeRoomCode, roomPath, roomRoute } from '../shared/lib/roomRoute';
import { loadGame } from '../games/registry';
import LeaveRoomDialog from './LeaveRoomDialog';

const Lobby = lazy(() => import('../features/lobby/Lobby'));

type ConnectionStatus = 'Đang kết nối' | 'Đã kết nối' | 'Đang kết nối lại…' | 'Mất kết nối';

export default function App() {
  const location = useLocation(), navigate = useNavigate();
  const { code } = useParams();
  const route = roomRoute(location.pathname);
  const routeRef = useRef(route); routeRef.current = route;
  const suppressRestore = useRef(false);
  const [initialSession] = useState(loadSession);
  const session = useRef(initialSession);
  const socket = useRef<WebSocket | null>(null);
  const membership = useRef<WebSocket | null>(null);
  const [voice] = useState(createVoice);
  const [room, setRoom] = useState<RoomView | null>(null);
  const roomRef = useRef<RoomView | null>(null);
  const entry = useRef<{ type: 'create_room' | 'join_room' | 'rejoin_room'; code?: string; invite: boolean; path: string; cancelled?: boolean } | null>(null);
  const switching = useRef<'restore' | 'leave' | null>(null);
  const leaving = useRef(false);
  const [gameState, setGameState] = useState<GameSyncState>(initialGameState);
  const gameRef = useRef(gameState);
  const game = gameState.game;
  const canRestore = () => Boolean(session.current && !suppressRestore.current && !routeRef.current.invalid && (!routeRef.current.code || routeRef.current.code === session.current.roomCode));
  const [restoring, setRestoring] = useState(canRestore);
  const [status, setStatus] = useState<ConnectionStatus>(restoring ? 'Đang kết nối lại…' : 'Đang kết nối');
  const [pending, setPending] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const blocker = useBlocker(({ nextLocation }) => Boolean(roomRef.current && roomRoute(nextLocation.pathname).code !== roomRef.current.code));
  const blockerRef = useRef(blocker); blockerRef.current = blocker;

  const [requests] = useState(() => createRequestTracker<WebSocket>((connection) => {
    reconnect(connection, 'Máy chủ chưa phản hồi sau 15 giây. Đang kết nối lại để đồng bộ trạng thái.');
  }));

  function clearRequest(connection: WebSocket, mayResume = true) {
    voice.detach(connection, mayResume);
    requests.cancel(connection);
    membership.current = null;
    switching.current = null; entry.current = null;
    leaving.current = false;
    setPending(false);
  }
  function reconnect(connection: WebSocket, message: string) {
    if (socket.current !== connection) return;
    clearRequest(connection);
    setError(message);
    setStatus('Đang kết nối lại…');
    setRestoring(canRestore());
    connection.close();
  }
  function submit(connection: WebSocket, message: ClientMessage | ClientMessage[]) {
    const nonce = requests.start(connection);
    if (nonce === null) return;
    setPending(true);
    setError(null); setErrorCode(null);
    try {
      for (const command of Array.isArray(message) ? message : [message]) connection.send(JSON.stringify(command));
      // Commands on this socket are serialized by the server before the final ping barrier.
      connection.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'ping', nonce } satisfies ClientMessage));
    } catch {
      reconnect(connection, 'Kết nối vừa gián đoạn. Hãy chờ kết nối lại.');
    }
  }
  function setGameSync(next: GameSyncState) { gameRef.current = next; setGameState(next); }
  const consumeGameFrames = useCallback((through: number) => setGameSync(consumeFrames(gameRef.current, through)), []);
  function updateRoom(next: RoomView | null) { roomRef.current = next; setRoom(next); if (next) void loadGame(next.game).catch(() => undefined); }
  function forgetSession() {
    if (socket.current) voice.detach(socket.current, false);
    session.current = null;
    saveSession(null);
  }
  function restoreForRoute(connection: WebSocket): boolean {
    if (!canRestore() || membership.current === connection || requests.pending || connection.readyState !== WebSocket.OPEN) return false;
    const saved = session.current!;
    entry.current = { type: 'rejoin_room', code: saved.roomCode, invite: !!routeRef.current.code, path: routeRef.current.path };
    setRestoring(true);
    submit(connection, { v: PROTOCOL_VERSION, type: 'rejoin_room', room_code: saved.roomCode, token: saved.token });
    return true;
  }

  useEffect(() => {
    if (entry.current && entry.current.path !== route.path) entry.current.cancelled = true;
    if (entry.current?.cancelled) {
      setRestoring(canRestore());
      if (socket.current?.readyState === WebSocket.OPEN) setStatus('Đã kết nối');
    }
    if (route.invalid) {
      suppressRestore.current = true; setRestoring(false); setError('Mã phòng không hợp lệ');
      void navigate('/', { replace: true }); return;
    }
    if (route.code) suppressRestore.current = false;
    if (route.path !== location.pathname) {
      void navigate({ pathname: route.path, search: location.search, hash: location.hash }, { replace: true }); return;
    }
    const connection = socket.current;
    if (connection) restoreForRoute(connection);
  }, [location.pathname]);
  useEffect(() => { document.title = room ? `18h40 — Phòng ${room.code}` : '18h40 — Phòng chơi cùng hội'; }, [room?.code]);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) voice.stopMic(); };
    window.addEventListener('blur', voice.stopMic);
    window.addEventListener('pagehide', voice.leave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', voice.stopMic);
      window.removeEventListener('pagehide', voice.leave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [voice]);

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function connect() {
      if (stopped) return;
      const connection = connectSocket();
      socket.current = connection;
      connection.onopen = () => {
        if (!restoreForRoute(connection)) {
          attempt = 0;
          setRestoring(false);
          setStatus('Đã kết nối');
        }
      };
      connection.onmessage = (event: MessageEvent<string>) => {
        try {
          if (socket.current !== connection) return;
          const message: ServerMessage = JSON.parse(event.data);
          if (message.type === 'voice_token_result' || message.type === 'voice_leave_result') {
            voice.receive(connection, message);
            return;
          }
          if (message.v !== PROTOCOL_VERSION) throw new Error('Unsupported protocol version');
          // Only a user-initiated entry switches the saved membership; opening an invite never does.
          if (switching.current === 'restore' && (message.type === 'joined' || message.type === 'error')) {
            if (message.type === 'error' && ['invalid_token', 'room_not_found'].includes(message.code)) forgetSession();
            switching.current = 'leave'; return;
          }
          if (switching.current === 'leave' && (message.type === 'left' || message.type === 'error')) {
            if (message.type === 'left' || message.type === 'error' && message.code === 'not_in_room') forgetSession();
            switching.current = null; return;
          }
          if (switching.current && message.type === 'room_state') return;
          if (entry.current && (entry.current.cancelled || entry.current.path !== routeRef.current.path)) {
            entry.current.cancelled = true;
            if (message.type === 'joined') {
              // A stale entry may have succeeded remotely; drain its leave before accepting new input.
              requests.cancel(connection);
              submit(connection, { v: PROTOCOL_VERSION, type: 'leave_room' });
            }
            if (message.type === 'left' || message.type === 'error' && ['invalid_token', 'room_not_found'].includes(message.code)) forgetSession();
            if (requests.finish(connection, message)) {
              entry.current = null;
              setPending(false); setRequestVersion(value => value + 1);
              if (!restoreForRoute(connection)) { setRestoring(false); setStatus('Đã kết nối'); }
            }
            return;
          }
          const expected = message.type === 'joined' || message.type === 'room_state' ? message.room.game : roomRef.current?.game;
          const tag = message.type === 'game_started' ? message.view.game : message.type === 'game_update' || message.type === 'game_over' ? message.update.game : message.type === 'joined' ? message.game?.view.game : undefined;
          if (tag && expected && tag !== expected) throw new Error('Mismatched game tag');
          const before = gameRef.current;
          const next = receiveGameState(before, message);
          setGameSync(next);
          if (requests.finish(connection, message)) { setPending(false); setRequestVersion(value => value + 1); }
          if (next.desynced && !before.desynced) {
            clearRequest(connection);
            connection.close();
            return;
          }
          switch (message.type) {
            case 'joined':
              membership.current = connection;
              voice.attach(connection, message.token, message.voice_enabled === true);
              session.current = { roomCode: message.room_code, token: message.token };
              saveSession(session.current);
              updateRoom(message.room);
              setRestoring(false);
              setStatus('Đã kết nối');
              setError(null); setErrorCode(null);
              attempt = 0;
              void navigate(roomPath(message.room_code), { replace: entry.current?.invite || entry.current?.type === 'rejoin_room' });
              entry.current = null;
              break;
            case 'room_state':
              updateRoom(message.room);
              break;
            case 'left':
              leaving.current = false;
              membership.current = null;
              forgetSession();
              updateRoom(null);
              setRestoring(false);
              if (blockerRef.current.state === 'blocked') blockerRef.current.proceed();
              else void navigate('/', { replace: true });
              break;
            case 'error':
              leaving.current = false;
              if (message.code === 'not_in_room') voice.detach(connection, false);
              setErrorCode(message.code);
              setError(message.code === 'room_not_found' && entry.current?.code ? `Không tìm thấy phòng ${entry.current.code}` : errorMessages[message.code] ?? 'Không xử lý được yêu cầu. Hãy tải lại trang.');
              if (message.code === 'invalid_token' || message.code === 'room_not_found') forgetSession();
              if (entry.current || message.code === 'invalid_token' || message.code === 'room_not_found') {
                updateRoom(null);
                setGameSync(initialGameState);
                setRestoring(false);
                setStatus('Đã kết nối');
              }
              if (entry.current) {
                suppressRestore.current = true;
                setRestoring(false);
                void navigate('/', { replace: true });
                entry.current = null;
              }
              break;
            case 'game_started':
            case 'game_update':
            case 'game_over':
            case 'pong': break;
            default: throw new Error('Invalid server message');
          }
        } catch {
          reconnect(connection, 'Không đọc được phản hồi từ máy chủ. Đang kết nối lại để đồng bộ trạng thái.');
        }
      };
      connection.onerror = () => {
        if (socket.current === connection) voice.detach(connection, true);
        connection.close();
      };
      connection.onclose = (event) => {
        if (stopped || socket.current !== connection) return;
        connection.onopen = null; connection.onmessage = null; connection.onerror = null; connection.onclose = null;
        clearRequest(connection, event.code !== 4001);
        if (event.code === 4001) {
          setStatus('Mất kết nối');
          setRestoring(false);
          setError('Phiên đã được mở ở nơi khác. Tải lại trang nếu muốn vào lại tại đây.');
          return;
        }
        setStatus('Đang kết nối lại…');
        setRestoring(canRestore());
        timer = setTimeout(connect, retryDelay(attempt++));
      };
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      const connection = socket.current;
      if (connection) {
        voice.detach(connection, false);
        requests.cancel(connection);
        connection.onopen = null;
        connection.onmessage = null;
        connection.onerror = null;
        connection.onclose = null;
        connection.close();
      }
      socket.current = null;
    };
  }, []);

  function send(message: ClientMessage) {
    const connection = socket.current;
    if (connection?.readyState !== WebSocket.OPEN || inputLocked({ connected: status === 'Đã kết nối', pending: requests.pending, restoring, desynced: gameRef.current.desynced })) return;
    if (message.type === 'leave_room') {
      leaving.current = true;
      voice.leave();
    }
    if (message.type === 'join_room' || message.type === 'create_room') {
      if (message.type === 'join_room') {
        const normalized = normalizeRoomCode(message.room_code);
        if (!isValidRoomCode(normalized)) { setError('Mã phòng không hợp lệ'); void navigate('/', { replace: true }); return; }
        message = { ...message, room_code: normalized };
      }
      const saved = session.current;
      entry.current = { type: message.type, code: message.type === 'join_room' ? message.room_code : undefined, invite: !!routeRef.current.code, path: routeRef.current.path };
      if (saved && !roomRef.current) {
        if (message.type === 'join_room' && message.room_code === saved.roomCode) {
          entry.current.type = 'rejoin_room';
          submit(connection, { v: PROTOCOL_VERSION, type: 'rejoin_room', room_code: saved.roomCode, token: saved.token }); return;
        }
        switching.current = 'restore';
        submit(connection, [{ v: PROTOCOL_VERSION, type: 'rejoin_room', room_code: saved.roomCode, token: saved.token }, { v: PROTOCOL_VERSION, type: 'leave_room' }, message]); return;
      }
    }
    submit(connection, message);
  }

  const disabled = inputLocked({ connected: status === 'Đã kết nối', pending, restoring, desynced: gameState.desynced });
  const playing = room && room.phase !== 'waiting' && game;
  const sceneKey = room ? `${room.code}-${playing ? 'game' : 'waiting'}` : restoring ? 'restoring' : 'lobby';
  return (
    <LazyMotion features={domAnimation} strict>
    <main className={`min-h-svh ${playing ? `game-app game-${room.game}` : 'saloon-app'}`}>
      <p className="app-brand text-sm font-medium uppercase tracking-widest text-stone-500">18h40 games</p>
      <h1 className="app-title mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{room ? 'Phòng của bạn' : restoring ? 'Đang vào lại phòng' : 'Hẹn nhau một ván'}</h1>
      <p className="connection-status mt-3 text-sm text-stone-600" role="status" aria-live="polite">{status}{status === 'Đang kết nối lại…' ? ' Hãy kiểm tra mạng; phiên sẽ tự khôi phục.' : status === 'Mất kết nối' ? ' Hãy tải lại trang để vào lại.' : ''}</p>
      {gameState.desynced && <p className="connection-alert mt-5 border-l-2 border-amber-700 pl-3 text-sm text-amber-900" role="alert">Bàn chơi đang mất đồng bộ. Đang kết nối lại để lấy trạng thái mới; tạm khóa thao tác.</p>}
      {error && <p className="connection-alert mt-5 border-l-2 border-red-700 pl-3 text-sm text-red-800" role="alert">{error}</p>}
      {room && <VoiceControls voice={voice} members={room.members} blocked={leaving.current || blocker.state === 'blocked'} />}
      <Suspense fallback={null}><div className="app-scenes"><AnimatePresence initial={false}><SceneTransition key={sceneKey}>
      {room ? <Room room={room} sync={gameState} consume={consumeGameFrames} fxEnabled={status === 'Đã kết nối' && !restoring && !gameState.desynced} disabled={disabled} pending={pending} requestVersion={requestVersion} actionError={error} actionErrorCode={errorCode} send={send} /> : restoring ? <section className="saloon-restoring"><SaloonBackdrop /><div className="saloon-poster"><h2 data-scene-title tabIndex={-1}>Đang vào lại phòng</h2><p role="status">Đang khôi phục phiên. Bạn sẽ trở về đúng chỗ khi kết nối thành công.</p></div></section> : <Lobby disabled={disabled} send={send} inviteCode={code === undefined ? null : route.code} previousRoom={session.current?.roomCode} returnToRoom={() => { const saved = session.current; if (saved) void navigate(roomPath(saved.roomCode)); }} dismissInvite={() => void navigate('/')} />}
      </SceneTransition></AnimatePresence></div></Suspense>
    </main>
    <Outlet />
    {room && blocker.state === 'blocked' && <LeaveRoomDialog code={room.code} disabled={disabled} leaving={leaving.current && pending} stay={() => blocker.reset()} leave={() => send({ v: PROTOCOL_VERSION, type: 'leave_room' })} />}
    </LazyMotion>
  );
}
