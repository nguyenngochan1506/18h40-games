import type { Action, CardSelection } from '../../generated/protocol';
import type { BangSnapshot as GameSnapshot } from './types.ts';
import { canSidHeal, actionMode, discardCount, emptyDraft, endTurnAction, playAction, playKind, needsTarget, respondAction, responseKind, chooseStoreSlotAction, chooseHandSlotAction, chooseDrawSourceAction, keepCardsAction, keepCount, chooseDrawResultAction, isSid, sidHealAction, flipCheckAction, flipBarrelAction, handLimit, has, needsExtra, isAffect, brawlTargets, pickableHand, activateGreenAction, greenKinds, greenActive, greenTargets, greenPickable, chuckAction, joseCards, joseAction, docTargets, docAction, chooseCopyAction, vultureTakeAction } from './actions';
import type { ActionDraft } from './actions';
import { cardFace } from './cardCatalog';
import { cards, characters } from './i18n';
import { selectGameView } from './state';
import { orderedEquipment } from './equipment';

type Props = { game: GameSnapshot; draft: ActionDraft; disabled: boolean; setDraft: (draft: ActionDraft) => void; sendAction: (action: Action) => void };

function DecisionControls({ game, draft, disabled, setDraft, sendAction }: Props) {
  const mode = actionMode(game);
  const { table, you } = selectGameView(game.view);
  if (mode === 'view') return null;
  if (mode === 'waiting') return <div className="game-controls"><p>Chưa đến lượt của bạn. Bạn vẫn có thể xem chi tiết bài.</p><button className="action secondary" disabled>Kết thúc lượt</button></div>;
  const cardName = draft.card !== null && cardFace(draft.card) ? cards[cardFace(draft.card)!.kind].name : null;
  const send = (action: Action | null) => { if (action && !disabled) sendAction(action); };
  const seatName = (id: number) => game.seats.find(seat => seat.player_id === id)?.nickname ?? `Ghế ${id + 1}`;
  const cardLabel = (card: number) => `${cards[cardFace(card)!.kind].name} (${cardFace(card)!.rank}${cardFace(card)!.suit})`;
  const cancel = <button type="button" className="action secondary" disabled={disabled} onClick={() => setDraft(emptyDraft)}>Hủy <kbd aria-hidden="true">Esc</kbd></button>;
  if (mode === 'check' && table.waiting?.kind.type === 'check') {
    const reason = table.waiting.kind.reason;
    const action = flipCheckAction(game, disabled);
    const draw = has(table.players.find(player => player.id === table.waiting!.player)!, 'lucky_duke') ? 'lật 2 lá, chọn 1 lá' : 'lật 1 lá';
    return <div className="game-controls check-controls" aria-label="Lật kiểm tra"><p role="status">{reason === 'dynamite' ? `Dynamite: ${draw}. ♠ từ 2 đến 9 thì nổ, mất 3 máu.` : `Jail: ${draw}. ♥ thì thoát, không thì mất lượt.`}</p>
      <div className="control-buttons"><button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => send(action)}>Lật bài <kbd aria-hidden="true">Enter</kbd></button></div></div>;
  }
  if (mode === 'draw_choice') {
    const own = table.players.find((player) => player.id === you)!;
    const action = chooseDrawSourceAction(game, draft.source, disabled);
    return <div className="game-controls" aria-label="Chọn nơi rút lá đầu"><p>{has(own, 'pat_brennan') ? 'Pat Brennan: chọn rút 2 lá từ bộ rút, hoặc lấy đúng 1 lá trước mặt một người và không rút thêm.' : 'Chọn nơi rút lá đầu. Lá thứ hai sẽ rút từ bộ rút.'}</p>
      <fieldset className="affect-options" disabled={disabled}><legend>Nguồn rút bài</legend>
        <label><input type="radio" name="draw-source" checked={draft.source === 'deck'} onChange={() => setDraft({ ...draft, source: 'deck' })} /> Rút từ bộ rút</label>
        {has(own, 'pedro_ramirez') && <label><input type="radio" name="draw-source" checked={draft.source === 'discard'} disabled={table.discard_count === 0} onChange={() => setDraft({ ...draft, source: 'discard' })} /> Lấy lá trên chồng bỏ ({table.discard_count} lá)</label>}
        {has(own, 'jesse_jones') && table.players.filter((player) => player.alive && player.id !== you).map((player) => <label key={player.id}><input type="radio" name="draw-source" checked={typeof draft.source === 'object' && 'player' in draft.source && draft.source.player === player.id} disabled={player.hand_count === 0} onChange={() => setDraft({ ...draft, source: { player: player.id } })} /> Lấy từ tay {game.seats.find((seat) => seat.player_id === player.id)?.nickname ?? `Ghế ${player.id + 1}`} ({player.hand_count} lá)</label>)}
        {has(own, 'pat_brennan') && table.players.filter(player => player.alive && player.in_play.length > 0).flatMap(player => player.in_play.map(card => <label key={`${player.id}:${card}`}><input type="radio" name="draw-source" checked={typeof draft.source === 'object' && 'in_play' in draft.source && draft.source.in_play.card === card} onChange={() => setDraft({ ...draft, source: { in_play: { player: player.id, card } } })} /> Lấy {cards[cardFace(card)!.kind].name} ({cardFace(card)!.rank}{cardFace(card)!.suit}) trước mặt {seatName(player.id)}{player.id === you ? ' (bạn)' : ''}</label>))}
      </fieldset><div className="control-buttons"><button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => send(action)}>{typeof draft.source === 'object' && 'in_play' in draft.source ? 'Lấy 1 lá, không rút thêm' : has(own, 'pat_brennan') ? 'Rút 2 lá từ bộ rút' : 'Rút bài'} <kbd aria-hidden="true">Enter</kbd></button>{cancel}</div></div>;
  }
  if (mode === 'choose_copy') {
    const action = chooseCopyAction(game, draft.target, disabled);
    return <div className="game-controls" aria-label="Chọn nhân vật để sao chép"><p role="status">Vera Custer: chọn một người chơi còn sống để dùng khả năng nhân vật của họ đến lượt sau của bạn.</p>
      <fieldset className="affect-options" disabled={disabled}><legend>Sao chép khả năng</legend>
        {table.players.filter(player => player.alive && player.id !== you).map(player => <label key={player.id}><input type="radio" name="copy-target" checked={draft.target === player.id} onChange={() => setDraft({ ...draft, target: player.id })} /> {characters[player.character].name} ({seatName(player.id)}): {characters[player.character].ability}</label>)}
      </fieldset><div className="control-buttons"><button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => send(action)}>Sao chép <kbd aria-hidden="true">Enter</kbd></button></div></div>;
  }
  if (mode === 'vulture_split' && table.waiting?.kind.type === 'vulture_split') {
    const split = table.waiting.kind;
    const action = vultureTakeAction(game, draft.selection, disabled);
    return <div className="game-controls" aria-label="Chia bài của người bị loại"><p role="status">Chia bài của {seatName(split.victim)} (Vulture Sam): mỗi lượt lấy 1 lá úp trên tay (ngẫu nhiên) hoặc 1 lá ngửa trước mặt, luân phiên với người còn lại.</p>
      <fieldset className="affect-options" disabled={disabled}><legend>Lấy một lá</legend>
        <label><input type="radio" name="vulture-take" checked={draft.selection === 'hand'} disabled={split.hand_count === 0} onChange={() => setDraft({ ...draft, selection: 'hand' })} /> Lá úp trên tay, ngẫu nhiên ({split.hand_count} lá)</label>
        {(table.loot_table ?? []).map(card => <label key={card}><input type="radio" name="vulture-take" checked={typeof draft.selection === 'object' && draft.selection?.in_play === card} onChange={() => setDraft({ ...draft, selection: { in_play: card } })} /> Lá ngửa: {cards[cardFace(card)!.kind].name} ({cardFace(card)!.rank}{cardFace(card)!.suit})</label>)}
      </fieldset><div className="control-buttons"><button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => send(action)}>Lấy lá đã chọn <kbd aria-hidden="true">Enter</kbd></button></div></div>;
  }
  if (mode === 'pick_hand_slot' || mode === 'general_store' || mode === 'keep_cards' || mode === 'choose_draw_result') {
    const action = mode === 'pick_hand_slot' ? chooseHandSlotAction(game, draft.handSlot, disabled) : mode === 'general_store' ? chooseStoreSlotAction(game, draft.storeSlot, disabled) : mode === 'keep_cards' ? keepCardsAction(game, draft.kept, disabled) : chooseDrawResultAction(game, draft.card, disabled);
    const reason = table.waiting?.kind.type === 'choose_draw_result' ? cards[table.waiting.kind.reason].name : '';
    return <div className="game-controls" aria-label="Chọn bài"><p role="status">{mode === 'pick_hand_slot' ? 'Chọn 1 lá úp trên tay mục tiêu. Mặt lá chỉ hiện sau khi chọn.' : mode === 'general_store' ? 'Chọn 1 lá úp.' : mode === 'keep_cards' ? `Chọn ${keepCount(game)} trong ${selectGameView(game.view).choices.length} lá để giữ · Đã chọn ${draft.kept.length}/${keepCount(game)}. Lá còn lại sẽ úp lên đỉnh bộ rút.` : `Lật kiểm tra cho ${reason}. Chọn 1 lá làm kết quả.`}</p>
      <div className="control-buttons"><button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => send(action)}>{mode === 'pick_hand_slot' ? table.waiting?.kind.type === 'pick_hand_slot' && ['cat_balou', 'brawl', 'can_can'].includes(table.waiting.kind.kind) ? 'Buộc bỏ lá đã chọn' : 'Lấy lá đã chọn' : mode === 'general_store' ? 'Lấy lá đã chọn' : mode === 'keep_cards' ? 'Giữ bài' : 'Chọn kết quả'} <kbd aria-hidden="true">Enter</kbd></button>{cancel}</div></div>;
  }
  if (mode === 'response') {
    const action = draft.card !== null ? respondAction(game, draft.card, disabled) : null;
    const dying = table.waiting?.kind.type === 'dying';
    const required = responseKind(game)!;
    const remaining = table.waiting?.kind.type === 'attack_response' && table.waiting.kind.kind !== 'indians' ? table.waiting.kind.remaining : 1;
    const checks = table.waiting?.kind.type === 'attack_response' ? table.waiting.kind.checks_left : 0;
    const barrel = flipBarrelAction(game, disabled);
    const barrelName = has(table.players.find(player => player.id === you)!, 'jourdonnais') && checks === 1 ? 'Jourdonnais' : 'Barrel';
    const ownGreens = table.players.find(player => player.id === you)?.green_answers ?? [];
    const greenAnswers = required === 'missed' ? ownGreens : [];
    return <div className="game-controls" aria-label="Phản ứng của bạn"><p>{remaining > 1 && `Cần thêm ${remaining} lá Missed! nữa. `}Chọn {cards[required].name} trên tay để {dying ? 'hồi máu' : 'phản ứng'}, hoặc {dying ? 'chấp nhận bị loại' : 'chịu đòn'}.</p>
      {greenAnswers.length > 0 && <fieldset className="affect-options" disabled={disabled}><legend>Lá xanh lá đỡ được Missed!</legend>
        {greenAnswers.map(card => <label key={card}><input type="radio" name="green-answer" checked={draft.card === card} onChange={() => setDraft({ ...draft, card })} /> Bỏ {cardLabel(card)} để đỡ</label>)}
      </fieldset>}
      <div className="control-buttons">
      <button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => send(action)}>{dying ? 'Dùng Beer' : required === 'missed' ? `Đỡ bằng ${cardName ?? 'Missed!'}` : `Đáp bằng ${cardName ?? 'BANG!'}`} <kbd aria-hidden="true">Enter</kbd></button>
      {checks > 0 && <button type="button" className="action" data-primary-action={draft.card === null ? "true" : undefined} aria-keyshortcuts={draft.card === null ? "Enter" : undefined} disabled={!barrel} onClick={() => send(barrel)}>Lật {barrelName}{checks > 1 ? ` (${checks} lần còn lại)` : ''}{draft.card === null && <kbd aria-hidden="true">Enter</kbd>}</button>}
      <button type="button" className="action secondary" data-primary-action={draft.card === null && !checks ? "true" : undefined} aria-keyshortcuts={draft.card === null && !checks ? "Enter" : undefined} disabled={disabled} onClick={() => send(respondAction(game, null, disabled))}>{dying ? 'Chấp nhận bị loại' : 'Chịu đòn'}{draft.card === null && !checks && <kbd aria-hidden="true">Enter</kbd>}</button>
      {draft.card !== null && cancel}
    </div></div>;
  }
  if (draft.discarding) {
    const amount = discardCount(game);
    const action = endTurnAction(game, draft.discard, disabled);
    return <div className="game-controls" aria-label="Bỏ bài thừa"><p>Chọn {amount} lá cần bỏ · Đã chọn {draft.discard.length}/{amount}. Bỏ bớt bài đến khi còn tối đa {handLimit(table.players.find((p) => p.id === you)!)} lá.</p><div className="control-buttons"><button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => send(action)}>Kết thúc lượt <kbd aria-hidden="true">Enter</kbd></button>{cancel}</div></div>;
  }
  const action = playAction(game, draft, disabled);
  const target = table.players.find((player) => player.id === draft.target);
  const affect = draft.card !== null && isAffect(game, draft.card);
  const you_ = table.players.find(player => player.id === you)!;
  const ownGreen = you_.in_play.filter(card => cardFace(card) && greenKinds.includes(cardFace(card)!.kind));
  const greenTarget = draft.green === null ? undefined : greenTargets(game, draft.green).find(player => player.id === draft.target);
  const greenAction = activateGreenAction(game, draft, disabled);
  const chuck = chuckAction(game, disabled);
  const { skillUses } = selectGameView(game.view);
  const joseHand = joseCards(game);
  const doc = has(you_, 'doc_holyday') && !skillUses?.doc_holyday;
  // Active skills are listed with their state even when spent, so the player knows why nothing can be pressed.
  const skillStatus = [
    has(you_, 'chuck_wengam') && `Chuck Wengam: ${chuck ? 'dùng được' : 'chưa dùng được (cần còn hơn 1 máu)'}`,
    has(you_, 'jose_delgado') && `José Delgado: còn ${Math.max(0, 2 - (skillUses?.jose_delgado ?? 0))}/2 lần trong lượt${joseHand.length ? '' : ' (cần lá xanh dương trên tay)'}`,
    has(you_, 'doc_holyday') && `Doc Holyday: ${doc ? 'dùng được 1 lần trong lượt' : 'đã dùng trong lượt này'}`,
  ].filter(Boolean) as string[];
  const kind = draft.card === null ? undefined : playKind(game, draft.card);
  const extra = draft.card !== null && needsExtra(game, draft.card);
  const { hand } = selectGameView(game.view);
  const selectionOptions = (player: (typeof table.players)[number], name: string, value: CardSelection | null, set: (selection: CardSelection) => void, handCount = player.hand_count) => <>
    <label><input type="radio" name={name} checked={value === 'hand'} disabled={handCount === 0} onChange={() => set('hand')} /> Chọn mù một lá trên tay ({handCount} lá)</label>
    {orderedEquipment(player.in_play).map(card => <label key={card}><input type="radio" name={name} checked={typeof value === 'object' && value?.in_play === card} onChange={() => set({ in_play: card })} /> Bài trước mặt: {cardLabel(card)}</label>)}
  </>;
  return <div className="game-controls" aria-label="Hành động của bạn">
    <p role="status">{cardName ? `Đã chọn ${cardName}.${extra ? draft.extra === null ? ' Chọn thêm 1 lá trên tay để bỏ.' : '' : ''}${needsTarget(game, draft.card!) ? target ? ` Nhắm tới ${seatName(target.id)}.` : ' Chọn người nhắm tới trên bàn.' : ''}${kind === 'brawl' ? ' Chọn 1 lá cho từng người khác.' : ''}` : 'Chạm một lá trên tay để chọn, rồi xác nhận Chơi.'}</p>
    {extra && <fieldset className="affect-options" disabled={disabled}><legend>Lá bỏ thêm</legend>
      {hand.filter(card => card !== draft.card).map(card => <label key={card}><input type="radio" name="extra-discard" checked={draft.extra === card} onChange={() => setDraft({ ...draft, extra: card })} /> {cardLabel(card)}</label>)}
      {hand.length < 2 && <p>Cần thêm một lá khác trên tay để bỏ.</p>}
    </fieldset>}
    {affect && target && <fieldset className="affect-options" disabled={disabled}><legend>Chọn bài muốn tác động</legend>
      {selectionOptions(target, 'affect-card', draft.selection, selection => setDraft({ ...draft, selection }), pickableHand(game, draft.card!, target))}
    </fieldset>}
    {kind === 'brawl' && brawlTargets(game).map(player => <fieldset key={player.id} className="affect-options" disabled={disabled}><legend>Brawl: {seatName(player.id)} bỏ</legend>
      {selectionOptions(player, `brawl-${player.id}`, draft.brawl[player.id] ?? null, selection => setDraft({ ...draft, brawl: { ...draft.brawl, [player.id]: selection } }))}
    </fieldset>)}
    {ownGreen.length > 0 && draft.panel !== 'green' && <button type="button" className="action secondary" data-open-panel="green" disabled={disabled} onClick={() => setDraft({ ...emptyDraft, panel: 'green' })}>Lá xanh lá ({ownGreen.length})…</button>}
    {ownGreen.length > 0 && draft.panel === 'green' && <fieldset className="affect-options green-cards" disabled={disabled}><legend>Lá xanh lá trước mặt bạn</legend>
      {ownGreen.map(card => { const ready = !!you_.green_ready?.includes(card), usable = ready && greenActive(cardFace(card)?.kind), answers = !!you_.green_answers?.includes(card);
        return <label key={card}><input type="radio" name="green-card" checked={draft.green === card} disabled={!usable} onChange={() => setDraft({ ...emptyDraft, panel: 'green', green: card })} /> {cardLabel(card)} — {!ready ? 'vừa đặt, dùng hiệu ứng từ lượt sau của bạn' : usable ? 'sẵn sàng dùng' : 'chỉ đỡ Missed!'}{answers ? ' · đỡ được Missed! ngoài lượt' : ''}</label>; })}
      {draft.green !== null && greenTargets(game, draft.green).length > 0 && <>
        <p>Chọn người nhắm tới:</p>
        {greenTargets(game, draft.green).map(player => <label key={player.id}><input type="radio" name="green-target" checked={draft.target === player.id} onChange={() => setDraft({ ...draft, target: player.id, selection: null })} /> {seatName(player.id)}{player.id === you ? ' (bạn)' : ''}</label>)}
        {['can_can', 'conestoga'].includes(cardFace(draft.green)!.kind) && greenTarget && <>
          <p>Chọn bài:</p>
          <label><input type="radio" name="green-pick" checked={draft.selection === 'hand'} disabled={greenPickable(game, draft.green, greenTarget).hand === 0} onChange={() => setDraft({ ...draft, selection: 'hand' })} /> Chọn mù một lá trên tay ({greenPickable(game, draft.green, greenTarget).hand} lá)</label>
          {orderedEquipment(greenPickable(game, draft.green, greenTarget).table).map(card => <label key={card}><input type="radio" name="green-pick" checked={typeof draft.selection === 'object' && draft.selection?.in_play === card} onChange={() => setDraft({ ...draft, selection: { in_play: card } })} /> Bài trước mặt: {cardLabel(card)}</label>)}
        </>}
      </>}
      <button type="button" className="action" data-primary-action={greenAction ? 'true' : undefined} aria-keyshortcuts={greenAction ? 'Enter' : undefined} disabled={!greenAction} onClick={() => send(greenAction)}>Bỏ lá xanh lá để dùng hiệu ứng{greenAction && <kbd aria-hidden="true">Enter</kbd>}</button>{cancel}
    </fieldset>}
    {skillStatus.length > 0 && draft.panel !== 'skills' && <button type="button" className="action secondary" data-open-panel="skills" disabled={disabled} onClick={() => setDraft({ ...emptyDraft, panel: 'skills' })}>Kỹ năng nhân vật…</button>}
    {skillStatus.length > 0 && draft.panel === 'skills' && <fieldset className="affect-options skills" disabled={disabled}><legend>Kỹ năng nhân vật</legend>
      <ul className="skill-status">{skillStatus.map(line => <li key={line}>{line}</li>)}</ul>
      {chuck && <button type="button" className="action" onClick={() => send(chuck)}>Chuck Wengam: mất 1 máu, rút 2 lá</button>}
      {joseHand.length > 0 && <>{joseHand.map(card => <label key={card}><input type="radio" name="jose-card" checked={draft.extra === card} onChange={() => setDraft({ ...draft, extra: card })} /> José Delgado: bỏ {cardLabel(card)} để rút 2 lá</label>)}
        <button type="button" className="action" data-primary-action={joseAction(game, draft.extra, disabled) ? 'true' : undefined} disabled={!joseAction(game, draft.extra, disabled)} onClick={() => send(joseAction(game, draft.extra, disabled))}>Bỏ lá đã chọn, rút 2 lá (còn {2 - (skillUses?.jose_delgado ?? 0)} lần trong lượt)</button></>}
      {doc && <><p>Doc Holyday: bỏ 2 lá trên tay để BANG! một người trong tầm (không tính giới hạn BANG!). Đã chọn {draft.discard.length}/2.</p>
        {hand.map(card => <label key={card}><input type="checkbox" checked={draft.discard.includes(card)} onChange={() => setDraft({ ...draft, doc: true, discard: draft.discard.includes(card) ? draft.discard.filter(item => item !== card) : [...draft.discard, card].slice(-2) })} /> {cardLabel(card)}</label>)}
        {docTargets(game, draft.discard).map(player => <label key={player.id}><input type="radio" name="doc-target" checked={draft.target === player.id} onChange={() => setDraft({ ...draft, doc: true, target: player.id })} /> Nhắm tới {seatName(player.id)}</label>)}
        <button type="button" className="action" data-primary-action={docAction(game, draft.discard, draft.target, disabled) ? 'true' : undefined} disabled={!docAction(game, draft.discard, draft.target, disabled)} onClick={() => send(docAction(game, draft.discard, draft.target, disabled))}>Bắn bằng Doc Holyday</button></>}
      {cancel}
    </fieldset>}
    <div className="control-buttons"><button type="button" className="action" data-primary-action="true" aria-keyshortcuts="Enter" disabled={!action} onClick={() => send(action)}>Chơi <kbd aria-hidden="true">Enter</kbd></button>{draft.card !== null && cancel}
      <button type="button" className="action secondary" data-primary-action={draft.card === null && draft.panel === null ? "true" : undefined} aria-keyshortcuts={draft.card === null && draft.panel === null ? "Enter" : undefined} disabled={disabled} onClick={() => discardCount(game) ? setDraft({ ...emptyDraft, discarding: true }) : send(endTurnAction(game, [], disabled))}>Kết thúc lượt{draft.card === null && draft.panel === null && <kbd aria-hidden="true">Enter</kbd>}</button></div>
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
  return <><DecisionControls {...props} />{canSidHeal(game) && <div className="game-controls sid-controls"><p>Sid Ketchum · Có thể hồi máu khi đang chờ người khác.</p><div className="control-buttons"><button type="button" className="action secondary" disabled={disabled || hand.length < 2} onClick={() => setDraft({ ...emptyDraft, healing: true })}>Bỏ 2 lá để hồi máu</button></div></div>}</>;
}
