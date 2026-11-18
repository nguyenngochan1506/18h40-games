import { useEffect, useRef, useState } from 'react';
import { PROTOCOL_VERSION } from '../generated/protocol';
import type { ClientMessage, RoomView, ServerMessage } from '../generated/protocol';
import Lobby from '../features/lobby/Lobby';
import Room from '../features/rooms/Room';
import { errorMessages } from '../shared/lib/errors';
import { connectSocket } from '../shared/lib/socket';
import { loadSession, retryDelay, saveSession } from '../shared/lib/session';

type ConnectionStatus = 'Đang kết nối' | 'Đã kết nối' | 'Đang kết nối lại…' | 'Mất kết nối';

export default function App() {
  const [initialSession] = useState(loadSession);
  const session = useRef(initialSession);
  const socket = useRef<WebSocket | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [restoring, setRestoring] = useState(Boolean(initialSession));
  const [status, setStatus] = useState<ConnectionStatus>(initialSession ? 'Đang kết nối lại…' : 'Đang kết nối');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          connection.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'rejoin_room', room_code: session.current.roomCode, token: session.current.token } satisfies ClientMessage));
        } else {
          attempt = 0;
          setStatus('Đã kết nối');
        }
      };
      connection.onmessage = (event: MessageEvent<string>) => {
        try {
          const message: ServerMessage = JSON.parse(event.data);
          if (message.v !== PROTOCOL_VERSION) throw new Error('Unsupported protocol version');
          switch (message.type) {
            case 'joined':
              session.current = { roomCode: message.room_code, token: message.token };
              saveSession(session.current);
              setRoom(message.room);
              setRestoring(false);
              setStatus('Đã kết nối');
              setPending(false);
              setError(null);
              attempt = 0;
              break;
            case 'room_state':
              setRoom(message.room);
              setPending(false);
              break;
            case 'left':
              session.current = null;
              saveSession(null);
              setRoom(null);
              setRestoring(false);
              setPending(false);
              break;
            case 'error':
              setError(errorMessages[message.code] ?? 'Không xử lý được yêu cầu. Hãy tải lại trang.');
              setPending(false);
              if (message.code === 'invalid_token' || message.code === 'room_not_found') {
                session.current = null;
                saveSession(null);
                setRoom(null);
                setRestoring(false);
                setStatus('Đã kết nối');
              }
              break;
            case 'pong': break;
            default: throw new Error('Invalid server message');
          }
        } catch {
          setError('Không đọc được phản hồi từ máy chủ. Hãy tải lại trang.');
          setPending(false);
        }
      };
      connection.onerror = () => connection.close();
      connection.onclose = (event) => {
        if (stopped) return;
        setPending(false);
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
    if (socket.current?.readyState !== WebSocket.OPEN || status !== 'Đã kết nối' || pending) return;
    try {
      socket.current.send(JSON.stringify(message));
      setPending(true);
      setError(null);
    } catch {
      setError('Kết nối vừa gián đoạn. Hãy chờ kết nối lại.');
      socket.current.close();
    }
  }

  const disabled = status !== 'Đã kết nối' || pending || restoring;
  return (
    <main className="mx-auto min-h-svh max-w-2xl px-6 py-10 sm:py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-stone-500">18h40 games</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{room ? 'Phòng của bạn' : restoring ? 'Đang vào lại phòng' : 'Hẹn nhau một ván'}</h1>
      <p className="mt-3 text-sm text-stone-600" role="status" aria-live="polite">{status}</p>
      {error && <p className="mt-5 border-l-2 border-red-700 pl-3 text-sm text-red-800" role="alert">{error}</p>}
      {room ? <Room room={room} disabled={disabled} send={send} /> : restoring ? <p className="mt-8 text-stone-600">Đang khôi phục phiên. Bạn sẽ trở về đúng chỗ khi kết nối thành công.</p> : <Lobby disabled={disabled} send={send} />}
    </main>
  );
}
