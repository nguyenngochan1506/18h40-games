import type { GameBoardProps } from '../types.ts';
import './styles.css';

export default function Board({ leaveRoom }: GameBoardProps) {
  // TODO: Handle sync.frames and sync.game.view.payload after view.game === 'werewolf' (generated/protocol.ts).
  return <section className="game-werewolf" aria-label="Bàn Ma Sói">
    <h2>Ma Sói</h2>
    <p className="werewolf-message" role="status">Game đang được xây dựng.</p>
    <button type="button" onClick={leaveRoom}>Rời phòng</button>
  </section>;
}
