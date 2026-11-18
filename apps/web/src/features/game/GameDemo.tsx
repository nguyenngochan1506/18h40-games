import GameBoard from './GameBoard';
import { demoGame, demoRoom } from './demo';
import { selectGameView } from './state';

export default function GameDemo() {
  const spectator = new URLSearchParams(window.location.search).get('view') === 'spectator';
  const game = spectator ? { ...demoGame, view: { perspective: 'spectator' as const, view: selectGameView(demoGame.view).table } } : demoGame;
  return <main className="demo-shell"><nav className="demo-nav"><span>18h40 games · Bàn mẫu</span><a href="/">Về phòng</a></nav><GameBoard game={game} room={demoRoom} /></main>;
}
