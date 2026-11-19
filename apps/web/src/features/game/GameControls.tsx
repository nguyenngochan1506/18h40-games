import type { Action, GameSnapshot } from '../../generated/protocol';
import { actionMode, discardCount, emptyDraft, endTurnAction, playAction, playKind, needsTarget, respondAction, responseKind, chooseStoreSlotAction, chooseDrawSourceAction, keepCardsAction, keepCount, chooseDrawResultAction, isSid, sidHealAction } from './actions';
import type { ActionDraft } from './actions';
import { cardFace } from './cardCatalog';
import { cards } from './i18n';
import { selectGameView } from './state';

type Props = { game: GameSnapshot; draft: ActionDraft; disabled: boolean; setDraft: (draft: ActionDraft) => void; sendAction: (action: Action) => void };

function DecisionControls({ game, draft, disabled, setDraft, sendAction }: Props) {
  const mode = actionMode(game);
  const { table, you } = selectGameView(game.view);
  if (mode === 'view') return null;
  if (mode === 'waiting') return <div className="game-controls"><p>Chưa đến lượt của bạn. Bạn vẫn có thể xem chi tiết bài.</p><button className="action secondary" disabled>Kết thúc lượt</button></div>;
  const cardName = draft.card !== null && cardFace(draft.card) ? cards[cardFace(draft.card)!.kind].name : null;
  const send = (action: Action | null) => { if (action && !disabled) sendAction(action); };
  const cancel = <button type="button" className="action secondary" disabled={disabled} onClick={() => setDraft(emptyDraft)}>Hủy <kbd aria-hidden="true">Esc</kbd></button>;
  if (mode === 'draw_choice') {
    const own = table.players.find((player) => player.id === you)!;
    const action = chooseDrawSourceAction(game, draft.source, disabled);
    return <div className="game-controls" aria-label="Chọn nơi rút lá đầu"><p>Chọn nơi rút lá đầu. Lá thứ hai sẽ rút từ bộ rút.</p>
      <fieldset className="affect-options" disabled={disabled}><legend>Nguồn rút bài</legend>
        <label><input type="radio" name="draw-source" checked={draft.source === 'deck'} onChange={() => setDraft({ ...draft, source: 'deck' })} /> Rút từ bộ rút</label>
        {own.character === 'pedro_ramirez' && <label><input type="radio" name="draw-source" checked={draft.source === 'discard'} disabled={table.discard_count === 0} onChange={() => setDraft({ ...draft, source: 'discard' })} /> Lấy lá trên chồng bỏ ({table.discard_count} lá)</label>}
        {own.character === 'jesse_jones' && table.players.filter((player) => player.alive && player.id !== you).map((player) => <label key={player.id}><input type="radio" name="draw-source" checked={typeof draft.source === 'object' && draft.source.player === player.id} disabled={player.hand_count === 0} onChange={() => setDraft({ ...draft, source: { player: player.id } })} /> Lấy từ tay {game.seats.find((seat) => seat.player_id === player.id)?.nickname ?? `Ghế ${player.id + 1}`} ({player.hand_count} lá)</label>)}
      </fieldset><div className="control-buttons"><button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => send(action)}>Rút bài <kbd aria-hidden="true">Enter</kbd></button>{cancel}</div></div>;
  }
  if (mode === 'general_store' || mode === 'keep_cards' || mode === 'choose_draw_result') {
    const action = mode === 'general_store' ? chooseStoreSlotAction(game, draft.storeSlot, disabled) : mode === 'keep_cards' ? keepCardsAction(game, draft.kept, disabled) : chooseDrawResultAction(game, draft.card, disabled);
    const reason = table.waiting?.kind.type === 'choose_draw_result' ? cards[table.waiting.kind.reason].name : '';
    return <div className="game-controls" aria-label="Chọn bài"><p role="status">{mode === 'general_store' ? 'Chọn 1 lá úp.' : mode === 'keep_cards' ? `Chọn ${keepCount(game)} trong ${selectGameView(game.view).choices.length} lá để giữ · Đã chọn ${draft.kept.length}/${keepCount(game)}. Lá còn lại sẽ úp lên đỉnh bộ rút.` : `Lật kiểm tra cho ${reason}. Chọn 1 lá làm kết quả.`}</p>
      <div className="control-buttons"><button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => send(action)}>{mode === 'general_store' ? 'Lấy lá đã chọn' : mode === 'keep_cards' ? 'Giữ bài' : 'Chọn kết quả'} <kbd aria-hidden="true">Enter</kbd></button>{cancel}</div></div>;
  }
  if (mode === 'response') {
    const action = draft.card !== null ? respondAction(game, draft.card, disabled) : null;
    const dying = table.waiting?.kind.type === 'dying';
    const required = responseKind(game)!;
    const remaining = table.waiting?.kind.type === 'attack_response' && table.waiting.kind.kind !== 'indians' ? table.waiting.kind.remaining : 1;
    return <div className="game-controls" aria-label="Phản ứng của bạn"><p>{remaining > 1 && `Cần thêm ${remaining} lá Missed! nữa. `}Chọn {cards[required].name} trên tay để {dying ? 'hồi máu' : 'phản ứng'}, hoặc {dying ? 'chấp nhận bị loại' : 'chịu đòn'}.</p><div className="control-buttons">
      <button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => send(action)}>{dying ? 'Dùng Beer' : required === 'missed' ? `Đỡ bằng ${cardName ?? 'Missed!'}` : `Đáp bằng ${cardName ?? 'BANG!'}`} <kbd aria-hidden="true">Enter</kbd></button>
      <button type="button" className="action secondary" data-primary-action={draft.card === null ? "true" : undefined} aria-keyshortcuts={draft.card === null ? "Enter" : undefined} disabled={disabled} onClick={() => send(respondAction(game, null, disabled))}>{dying ? 'Chấp nhận bị loại' : 'Chịu đòn'}{draft.card === null && <kbd aria-hidden="true">Enter</kbd>}</button>
      {draft.card !== null && cancel}
    </div></div>;
  }
  if (draft.discarding) {
    const amount = discardCount(game);
    const action = endTurnAction(game, draft.discard, disabled);
    return <div className="game-controls" aria-label="Bỏ bài thừa"><p>Chọn {amount} lá cần bỏ · Đã chọn {draft.discard.length}/{amount}. Bỏ bớt bài đến khi còn tối đa {Math.max(0, table.players.find((p) => p.id === you)!.health)} lá.</p><div className="control-buttons"><button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => send(action)}>Kết thúc lượt <kbd aria-hidden="true">Enter</kbd></button>{cancel}</div></div>;
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
    <div className="control-buttons"><button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => send(action)}>Chơi <kbd aria-hidden="true">Enter</kbd></button>{draft.card !== null && cancel}
      <button type="button" className="action secondary" data-primary-action={draft.card === null ? "true" : undefined} aria-keyshortcuts={draft.card === null ? "Enter" : undefined} disabled={disabled} onClick={() => discardCount(game) ? setDraft({ ...emptyDraft, discarding: true }) : send(endTurnAction(game, [], disabled))}>Kết thúc lượt{draft.card === null && <kbd aria-hidden="true">Enter</kbd>}</button></div>
  </div>;
}

export default function GameControls(props: Props) {
  const { game, draft, disabled, setDraft, sendAction } = props;
  const { hand } = selectGameView(game.view);
  if (actionMode(game) === 'view') return null;
  if (draft.healing && isSid(game)) {
    const action = sidHealAction(game, draft.discard, disabled);
    return <div className="game-controls" aria-label="Hồi máu Sid Ketchum"><p>Sid Ketchum · Chọn đúng 2 lá trên tay để hồi 1 máu · Đã chọn {draft.discard.length}/2.</p><div className="control-buttons">
      <button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => { if (action && !disabled) sendAction(action); }}>Hồi máu <kbd aria-hidden="true">Enter</kbd></button>
      <button type="button" className="action secondary" disabled={disabled} onClick={() => setDraft(emptyDraft)}>Hủy <kbd aria-hidden="true">Esc</kbd></button>
    </div></div>;
  }
  return <><DecisionControls {...props} />{isSid(game) && <div className="game-controls sid-controls"><p>Sid Ketchum · Có thể hồi máu khi đang chờ người khác.</p><div className="control-buttons"><button type="button" className="action secondary" disabled={disabled || hand.length < 2} onClick={() => setDraft({ ...emptyDraft, healing: true })}>Bỏ 2 lá để hồi máu</button></div></div>}</>;
}
