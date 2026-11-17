import { useEffect, useRef, useState } from 'react';
import { PROTOCOL_VERSION } from '../generated/protocol';
import type { ClientMessage, ServerMessage } from '../generated/protocol';
import { connectSocket } from '../shared/lib/socket';

type ConnectionStatus = 'Đang kết nối' | 'Đã kết nối' | 'Mất kết nối';

export default function App() {
  const socket = useRef<WebSocket | null>(null);
  const pendingPing = useRef<{ nonce: number; startedAt: number } | null>(null);
  const nextNonce = useRef(0);
  const [status, setStatus] = useState<ConnectionStatus>('Đang kết nối');
  const [waiting, setWaiting] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const connection = connectSocket();
    socket.current = connection;
    connection.onopen = () => setStatus('Đã kết nối');
    const disconnected = () => {
      setStatus('Mất kết nối');
      pendingPing.current = null;
      setWaiting(false);
    };
    connection.onclose = disconnected;
    connection.onerror = disconnected;
    connection.onmessage = (event: MessageEvent<string>) => {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        if (message.v !== PROTOCOL_VERSION) {
          throw new Error('Unsupported protocol version');
        }
        if (message.type === 'pong' && message.nonce === pendingPing.current?.nonce) {
          setLatency(performance.now() - pendingPing.current.startedAt);
          pendingPing.current = null;
          setWaiting(false);
        } else if (message.type === 'error') {
          setError(message.code === 'unsupported_version'
            ? 'Phiên bản kết nối không tương thích. Hãy tải lại trang.'
            : 'Máy chủ không chấp nhận tin nhắn. Hãy gửi lại ping.');
          pendingPing.current = null;
          setWaiting(false);
        }
      } catch {
        setError('Không đọc được phản hồi từ máy chủ. Hãy tải lại trang.');
        pendingPing.current = null;
        setWaiting(false);
      }
    };
    return () => {
      connection.onopen = null;
      connection.onclose = null;
      connection.onerror = null;
      connection.onmessage = null;
      pendingPing.current = null;
      socket.current = null;
      connection.close();
    };
  }, []);

  function sendPing() {
    if (socket.current?.readyState !== WebSocket.OPEN || pendingPing.current) return;
    const nonce = nextNonce.current;
    nextNonce.current = (nonce + 1) >>> 0;
    const message: ClientMessage = { v: PROTOCOL_VERSION, type: 'ping', nonce };
    pendingPing.current = { nonce, startedAt: performance.now() };
    socket.current.send(JSON.stringify(message));
    setWaiting(true);
    setError(null);
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center px-6 py-12">
      <p className="mb-3 text-sm font-medium uppercase tracking-widest text-stone-500">18h40 games · M0</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Kiểm tra kết nối</h1>
      <p className="mt-4 leading-relaxed text-stone-600">Gửi ping đến máy chủ để đo thời gian phản hồi.</p>
      <div className="mt-8 border-y border-stone-300 py-5" role="status" aria-live="polite">
        <p className="font-medium">{status}</p>
        <p className="mt-2 text-sm tabular-nums text-stone-600">
          {waiting ? 'Đang chờ phản hồi…' : latency === null ? 'Chưa có kết quả đo' : `Thời gian phản hồi: ${latency.toFixed(1)} ms`}
        </p>
      </div>
      <button
        type="button"
        onClick={sendPing}
        disabled={status !== 'Đã kết nối' || waiting}
        className="mt-6 min-h-12 self-start rounded-md bg-emerald-800 px-6 py-3 font-medium text-white hover:bg-emerald-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Gửi ping
      </button>
      {error && <p className="mt-4 text-sm text-red-800" role="alert">{error}</p>}
    </main>
  );
}
