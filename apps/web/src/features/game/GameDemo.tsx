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
    if (['turn', 'store', 'jesse', 'pedro', 'kit', 'kit_short', 'lucky_jail', 'lucky_dynamite'].includes(mode)) table.turn.player = 0;
    if (mode === 'sid') table.turn.player = 2;
    if (mode === 'turn') { table.turn.player = 0; table.waiting = { player: 0, pending_id: null, kind: { type: 'turn' } }; }
    if (mode === 'duel') table.waiting = { player: 0, pending_id: 14, kind: { type: 'duel' } };
    if (mode === 'dying') { table.players[0].health = 0; table.waiting = { player: 0, pending_id: 15, kind: { type: 'dying', needed: 1 } }; }
    if (mode === 'store') { table.store_pool = [5, 33, 60, 71]; table.waiting = { player: 0, pending_id: 16, kind: { type: 'general_store' } }; }
    if (mode === 'jesse' || mode === 'pedro') { table.players[0].character = mode === 'jesse' ? 'jesse_jones' : 'pedro_ramirez'; table.waiting = { player: 0, pending_id: 17, kind: { type: 'draw_choice' } }; }
    if (mode === 'kit' || mode === 'kit_short') { table.players[0].character = 'kit_carlson'; game.view.view.choices = mode === 'kit_short' ? [5] : [5, 33, 60]; table.waiting = { player: 0, pending_id: 18, kind: { type: 'keep_cards', keep: Math.min(2, game.view.view.choices.length) } }; }
    if (mode.startsWith('lucky')) { table.players[0].character = 'lucky_duke'; game.view.view.choices = [5, 33]; table.waiting = { player: 0, pending_id: 19, kind: { type: 'choose_draw_result', reason: mode === 'lucky_jail' ? 'jail' : mode === 'lucky_dynamite' ? 'dynamite' : 'barrel' } }; }
    if (mode === 'sid' || mode === 'sid_dying') { table.players[0].character = 'sid_ketchum'; table.players[0].health = mode === 'sid_dying' ? 0 : 2; table.waiting = mode === 'sid_dying' ? { player: 0, pending_id: 20, kind: { type: 'dying', needed: 1 } } : { player: 1, pending_id: 21, kind: { type: 'attack_response', kind: 'bang', remaining: 1 } }; }
  }
  if (spectator) game.view = { perspective: 'spectator', view: selectGameView(game.view).table };
  return <main className="demo-shell"><nav className="demo-nav"><span>18h40 games · Bàn mẫu</span><a href="/">Về phòng</a></nav>
    <div className="demo-toolbar"><label htmlFor="demo-mode">Tình huống demo</label><select id="demo-mode" value={mode} onChange={(event) => { setMode(event.target.value); setSent(null); }}><option value="turn">Lượt chơi / bỏ bài thừa</option><option value="attack">BANG! cần hai Missed!</option><option value="duel">Đáp Duel</option><option value="dying">Cứu mạng bằng Beer</option><option value="store">General Store</option><option value="jesse">Jesse Jones · nguồn rút</option><option value="pedro">Pedro Ramirez · nguồn rút</option><option value="kit">Kit Carlson · giữ bài</option><option value="kit_short">Kit Carlson · chỉ còn 1 lá</option><option value="lucky">Lucky Duke · Barrel</option><option value="lucky_jail">Lucky Duke · Jail</option><option value="lucky_dynamite">Lucky Duke · Dynamite</option><option value="sid">Sid Ketchum · ngoài lượt</option><option value="sid_dying">Sid Ketchum · cứu mạng</option></select></div>
    <GameBoard key={mode} game={game} room={demoRoom} sendAction={setSent} />
    {sent && <output className="demo-action-log" aria-label="Hành động thử">{JSON.stringify({ type: 'game_action', action: sent }, null, 2)}</output>}
  </main>;
}
