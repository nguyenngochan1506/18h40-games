import { useEffect, useRef, useState } from 'react';
import { PROTOCOL_VERSION } from '../generated/protocol';
import type { ClientMessage, RoomView, ServerMessage } from '../generated/protocol';
import Lobby from '../features/lobby/Lobby';
import Room from '../features/rooms/Room';
import { initialGameState, inputLocked, receiveGameState } from '../features/game/state';
import type { GameSyncState } from '../features/game/state';
import { errorMessages } from '../shared/lib/errors';
import { connectSocket } from '../shared/lib/socket';
import { createRequestTracker } from '../shared/lib/request';
import { loadSession, retryDelay, saveSession } from '../shared/lib/session';

type ConnectionStatus = 'Đang kết nối' | 'Đã kết nối' | 'Đang kết nối lại…' | 'Mất kết nối';

export default function App() {
  const [initialSession] = useState(loadSession);
  const session = useRef(initialSession);
  const socket = useRef<WebSocket | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [gameState, setGameState] = useState<GameSyncState>(initialGameState);
  const gameRef = useRef(gameState);
  const game = gameState.game;
  const [restoring, setRestoring] = useState(Boolean(initialSession));
  const [status, setStatus] = useState<ConnectionStatus>(initialSession ? 'Đang kết nối lại…' : 'Đang kết nối');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requests] = useState(() => createRequestTracker<WebSocket>((connection) => {
    reconnect(connection, 'Máy chủ chưa phản hồi sau 15 giây. Đang kết nối lại để đồng bộ trạng thái.');
  }));

  function clearRequest(connection: WebSocket) {
    requests.cancel(connection);
    setPending(false);
  }
  function reconnect(connection: WebSocket, message: string) {
    if (socket.current !== connection) return;
    clearRequest(connection);
    setError(message);
    setStatus('Đang kết nối lại…');
    setRestoring(Boolean(session.current));
    connection.close();
  }
  function submit(connection: WebSocket, message: ClientMessage) {
    const nonce = requests.start(connection);
    if (nonce === null) return;
    setPending(true);
    setError(null);
    try {
      connection.send(JSON.stringify(message));
      // The server awaits this connection's command before reading the following ping.
      connection.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'ping', nonce } satisfies ClientMessage));
    } catch {
      reconnect(connection, 'Kết nối vừa gián đoạn. Hãy chờ kết nối lại.');
    }
  }
  function setGameSync(next: GameSyncState) { gameRef.current = next; setGameState(next); }

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function connect() {
      if (stopped) return;
      const connection = connectSocket();
      socket.current = connection;
      connection.onopen = () => {
        if (session.current) {
          setRestoring(true);
          submit(connection, { v: PROTOCOL_VERSION, type: 'rejoin_room', room_code: session.current.roomCode, token: session.current.token });
        } else {
          attempt = 0;
          setStatus('Đã kết nối');
        }
      };
      connection.onmessage = (event: MessageEvent<string>) => {
        try {
          if (socket.current !== connection) return;
          const message: ServerMessage = JSON.parse(event.data);
          if (message.v !== PROTOCOL_VERSION) throw new Error('Unsupported protocol version');
          const before = gameRef.current;
          const next = receiveGameState(before, message);
          setGameSync(next);
          if (requests.finish(connection, message)) setPending(false);
          if (next.desynced && !before.desynced) {
            clearRequest(connection);
            connection.close();
            return;
          }
          switch (message.type) {
            case 'joined':
              session.current = { roomCode: message.room_code, token: message.token };
              saveSession(session.current);
              setRoom(message.room);
              setRestoring(false);
              setStatus('Đã kết nối');
              setError(null);
              attempt = 0;
              break;
            case 'room_state':
              setRoom(message.room);
              break;
            case 'left':
              session.current = null;
              saveSession(null);
              setRoom(null);
              setRestoring(false);
              break;
            case 'error':
              setError(errorMessages[message.code] ?? 'Không xử lý được yêu cầu. Hãy tải lại trang.');
              if (message.code === 'invalid_token' || message.code === 'room_not_found') {
                session.current = null;
                saveSession(null);
                setRoom(null);
                setGameSync(initialGameState);
                setRestoring(false);
                setStatus('Đã kết nối');
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
      connection.onerror = () => connection.close();
      connection.onclose = (event) => {
        if (stopped || socket.current !== connection) return;
        clearRequest(connection);
        if (event.code === 4001) {
          setStatus('Mất kết nối');
          setRestoring(false);
          setError('Phiên đã được mở ở nơi khác. Tải lại trang nếu muốn vào lại tại đây.');
          return;
        }
        setStatus('Đang kết nối lại…');
        setRestoring(Boolean(session.current));
        timer = setTimeout(connect, retryDelay(attempt++));
      };
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      const connection = socket.current;
      if (connection) {
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
    submit(connection, message);
  }

  const disabled = inputLocked({ connected: status === 'Đã kết nối', pending, restoring, desynced: gameState.desynced });
  return (
    <main className={`mx-auto min-h-svh ${game ? 'max-w-[1400px] px-4 py-6 sm:px-7' : 'max-w-2xl px-6 py-10 sm:py-16'}`}>
      <p className="text-sm font-medium uppercase tracking-widest text-stone-500">18h40 games</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{room ? 'Phòng của bạn' : restoring ? 'Đang vào lại phòng' : 'Hẹn nhau một ván'}</h1>
      <p className="mt-3 text-sm text-stone-600" role="status" aria-live="polite">{status}</p>
      {gameState.desynced && <p className="mt-5 border-l-2 border-amber-700 pl-3 text-sm text-amber-900" role="alert">Bàn chơi đang mất đồng bộ. Đang kết nối lại để lấy trạng thái mới; tạm khóa thao tác.</p>}
      {error && <p className="mt-5 border-l-2 border-red-700 pl-3 text-sm text-red-800" role="alert">{error}</p>}
      {room ? <Room room={room} game={game} log={gameState.log} viewer={gameState.viewer} disabled={disabled} send={send} /> : restoring ? <p className="mt-8 text-stone-600">Đang khôi phục phiên. Bạn sẽ trở về đúng chỗ khi kết nối thành công.</p> : <Lobby disabled={disabled} send={send} />}
    </main>
  );
}
