import type { GameBoardProps } from '../types.ts';
import './styles.css';

export default function Board({ leaveRoom }: GameBoardProps) {
  // TODO: Handle sync.frames and sync.game.view.payload after view.game === 'uno' (generated/protocol.ts).
  return <section className="game-uno" aria-label="Bàn UNO">
    <h2>UNO</h2>
    <p className="uno-message" role="status">Game đang được xây dựng.</p>
    <button type="button" onClick={leaveRoom}>Rời phòng</button>
  </section>;
}
