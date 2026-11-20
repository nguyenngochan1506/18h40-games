import type { GameSnapshot, RoomView } from '../../generated/protocol';
import { gameResult } from './log';
import { m } from 'motion/react';
import { tableSpring, useTableMotion } from './GameMotion';

export default function GameResult({ game, room, viewer, disabled, endGame, leaveRoom }: { game: GameSnapshot; room: RoomView; viewer: number | null; disabled: boolean; endGame?: () => void; leaveRoom?: () => void }) {
  const animated = useTableMotion();
  const result = gameResult(game, viewer);
  if (!result) return null;
  const host = room.host === room.you;
  return <section className="game-result" aria-label="Kết quả ván">
    <p className="game-eyebrow">Ván đã kết thúc</p><h3>{result.title}</h3>
    <ul>{result.players.map((player, index) => <m.li key={player.id} data-ui-motion="result" initial={{ opacity: 0, y: animated ? 8 : 0 }} animate={{ opacity: 1, y: 0 }} transition={animated ? { ...tableSpring, delay: index * .04 } : { duration: .1 }}><div><strong>{player.name}</strong><m.span data-ui-motion="role" initial={{ opacity: 0, rotateY: animated ? 90 : 0 }} animate={{ opacity: 1, rotateY: 0 }} transition={{ duration: animated ? .2 : .1, delay: animated ? index * .04 : 0 }}>{player.role}</m.span></div><div className="result-outcome"><strong>{player.won === null ? 'Chưa rõ' : player.won ? 'Thắng' : 'Thua'}</strong><span>{player.alive ? 'Còn sống' : 'Đã bị loại'}</span></div></m.li>)}</ul>
    {host ? <button type="button" className="action" disabled={disabled || !endGame} onClick={endGame}>Kết thúc ván</button> : <p className="result-wait">Chờ chủ phòng kết thúc ván.</p>}
    {leaveRoom && <button type="button" className="action secondary" disabled={disabled} onClick={leaveRoom}>Về sảnh</button>}
  </section>;
}
