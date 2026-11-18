import type { Action, GameSnapshot } from '../../generated/protocol';
import { actionMode, discardCount, emptyDraft, endTurnAction, playAction, playKind, needsTarget, respondAction, responseKind } from './actions';
import type { ActionDraft } from './actions';
import { cardFace } from './cardCatalog';
import { cards } from './i18n';
import { selectGameView } from './state';

type Props = { game: GameSnapshot; draft: ActionDraft; disabled: boolean; setDraft: (draft: ActionDraft) => void; sendAction: (action: Action) => void };

export default function GameControls({ game, draft, disabled, setDraft, sendAction }: Props) {
  const mode = actionMode(game);
  const { table, you } = selectGameView(game.view);
  if (mode === 'view') return null;
  if (mode === 'waiting') return <div className="game-controls"><p>Chưa đến lượt của bạn. Bạn vẫn có thể xem chi tiết bài.</p><button className="action secondary" disabled>Kết thúc lượt</button></div>;
  if (mode === 'unsupported') return <div className="game-controls"><p>Chưa hỗ trợ lựa chọn này. Hãy nhờ chủ phòng bỏ qua lượt chờ để tiếp tục.</p></div>;
  const cardName = draft.card !== null && cardFace(draft.card) ? cards[cardFace(draft.card)!.kind].name : null;
  const send = (action: Action | null) => { if (action && !disabled) sendAction(action); };
  const cancel = <button type="button" className="action secondary" disabled={disabled} onClick={() => setDraft(emptyDraft)}>Hủy</button>;
  if (mode === 'response') {
    const action = draft.card !== null ? respondAction(game, draft.card, disabled) : null;
    const dying = table.waiting?.kind.type === 'dying';
    const required = responseKind(game)!;
    return <div className="game-controls" aria-label="Phản ứng của bạn"><p>Chọn {cards[required].name} trên tay để {dying ? 'hồi máu' : 'phản ứng'}, hoặc {dying ? 'chấp nhận bị loại' : 'chịu đòn'}.</p><div className="control-buttons">
      <button type="button" className="action" disabled={!action} onClick={() => send(action)}>{dying ? 'Dùng Beer' : required === 'missed' ? `Đỡ bằng ${cardName ?? 'Missed!'}` : `Đáp bằng ${cardName ?? 'BANG!'}`}</button>
      <button type="button" className="action secondary" disabled={disabled} onClick={() => send(respondAction(game, null, disabled))}>{dying ? 'Chấp nhận bị loại' : 'Chịu đòn'}</button>
      {draft.card !== null && cancel}
    </div></div>;
  }
  if (draft.discarding) {
    const amount = discardCount(game);
    const action = endTurnAction(game, draft.discard, disabled);
    return <div className="game-controls" aria-label="Bỏ bài thừa"><p>Chọn {amount} lá cần bỏ · Đã chọn {draft.discard.length}/{amount}. Bỏ bớt bài đến khi còn tối đa {Math.max(0, table.players.find((p) => p.id === you)!.health)} lá.</p><div className="control-buttons"><button type="button" className="action" disabled={!action} onClick={() => send(action)}>Kết thúc lượt</button>{cancel}</div></div>;
  }
  const action = playAction(game, draft, disabled);
  const target = table.players.find((player) => player.id === draft.target);
  const affect = draft.card !== null && ['panic', 'cat_balou'].includes(playKind(game, draft.card) ?? '');
  return <div className="game-controls" aria-label="Hành động của bạn">
    <p role="status">{cardName ? `Đã chọn ${cardName}.${needsTarget(game, draft.card!) ? target ? ` Nhắm tới ${game.seats.find((seat) => seat.player_id === target.id)?.nickname ?? 'người đã chọn'}.` : ' Chọn người nhắm tới trên bàn.' : ''}` : 'Chạm một lá trên tay để chọn, rồi xác nhận Chơi.'}</p>
    {affect && target && <fieldset className="affect-options" disabled={disabled}><legend>Chọn bài muốn tác động</legend>
      <label><input type="radio" name="affect-card" checked={draft.selection === 'hand'} disabled={target.hand_count === 0} onChange={() => setDraft({ ...draft, selection: 'hand' })} /> Một lá ngẫu nhiên trên tay ({target.hand_count} lá)</label>
      {target.in_play.map((card) => <label key={card}><input type="radio" name="affect-card" checked={typeof draft.selection === 'object' && draft.selection?.in_play === card} onChange={() => setDraft({ ...draft, selection: { in_play: card } })} /> Bài trước mặt: {cards[cardFace(card)!.kind].name} ({cardFace(card)!.rank}{cardFace(card)!.suit})</label>)}
    </fieldset>}
    <div className="control-buttons"><button type="button" className="action" disabled={!action} onClick={() => send(action)}>Chơi</button>{draft.card !== null && cancel}
      <button type="button" className="action secondary" disabled={disabled} onClick={() => discardCount(game) ? setDraft({ ...emptyDraft, discarding: true }) : send(endTurnAction(game, [], disabled))}>Kết thúc lượt</button></div>
  </div>;
}
