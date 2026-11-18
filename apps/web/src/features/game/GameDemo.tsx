import { useState } from 'react';
import type { Action, GameSnapshot } from '../../generated/protocol';
import GameBoard from './GameBoard';
import { demoGame, demoRoom } from './demo';
import { selectGameView } from './state';

export default function GameDemo() {
  const [mode, setMode] = useState('turn');
  const [sent, setSent] = useState<Action | null>(null);
  const spectator = new URLSearchParams(window.location.search).get('view') === 'spectator';
  const game: GameSnapshot = structuredClone(demoGame);
  if (game.view.perspective === 'player') {
    const table = game.view.view.table;
    if (mode === 'turn') { table.turn.player = 0; table.waiting = { player: 0, pending_id: null, kind: { type: 'turn' } }; }
    if (mode === 'duel') table.waiting = { player: 0, pending_id: 14, kind: { type: 'duel' } };
    if (mode === 'dying') { table.players[0].health = 0; table.waiting = { player: 0, pending_id: 15, kind: { type: 'dying', needed: 1 } }; }
    if (mode === 'unsupported') table.waiting = { player: 0, pending_id: 16, kind: { type: 'keep_cards', keep: 2 } };
  }
  if (spectator) game.view = { perspective: 'spectator', view: selectGameView(game.view).table };
  return <main className="demo-shell"><nav className="demo-nav"><span>18h40 games · Bàn mẫu</span><a href="/">Về phòng</a></nav>
    <div className="demo-toolbar"><label htmlFor="demo-mode">Tình huống demo</label><select id="demo-mode" value={mode} onChange={(event) => { setMode(event.target.value); setSent(null); }}><option value="turn">Lượt chơi / bỏ bài thừa</option><option value="attack">BANG! cần hai Missed!</option><option value="duel">Đáp Duel</option><option value="dying">Cứu mạng bằng Beer</option><option value="unsupported">Khung chờ bước sau</option></select></div>
    <GameBoard key={mode} game={game} room={demoRoom} sendAction={setSent} />
    {sent && <output className="demo-action-log" aria-label="Hành động thử">{JSON.stringify({ type: 'game_action', action: sent }, null, 2)}</output>}
  </main>;
}
