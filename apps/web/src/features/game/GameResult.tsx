import type { GameSnapshot, RoomView } from '../../generated/protocol';
import { gameResult } from './log';

export default function GameResult({ game, room, viewer, disabled, endGame }: { game: GameSnapshot; room: RoomView; viewer: number | null; disabled: boolean; endGame?: () => void }) {
  const result = gameResult(game, viewer);
  if (!result) return null;
  const host = room.host === room.you;
  return <section className="game-result" aria-label="Kết quả ván">
    <p className="game-eyebrow">Ván đã kết thúc</p><h3>{result.title}</h3>
    <ul>{result.players.map((player) => <li key={player.id}><div><strong>{player.name}</strong><span>{player.role}</span></div><div className="result-outcome"><strong>{player.won === null ? 'Chưa rõ' : player.won ? 'Thắng' : 'Thua'}</strong><span>{player.alive ? 'Còn sống' : 'Đã bị loại'}</span></div></li>)}</ul>
    {host ? <button type="button" className="action" disabled={disabled || !endGame} onClick={endGame}>Kết thúc ván</button> : <p className="result-wait">Chờ chủ phòng kết thúc ván.</p>}
  </section>;
}
