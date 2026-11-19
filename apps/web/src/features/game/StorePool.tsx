import { useRef } from 'react';
import { m } from 'motion/react';
import type { Action, GameSnapshot } from '../../generated/protocol';
import { actionMode, chooseStoreSlotAction, chooseHandSlotAction, emptyDraft } from './actions';
import type { ActionDraft } from './actions';
import { assetUrl, backFiles } from './assetMap';
import { dropZoneAt } from './cardDrag';
import { selectGameView } from './state';
import './storePool.css';

export default function StorePool({ game, draft, locked, desktop, setDraft, send }: {
  game: GameSnapshot; draft: ActionDraft; locked: boolean; desktop: boolean;
  setDraft: (draft: ActionDraft) => void; send: (action: Action) => void;
}) {
  const root = useRef<HTMLElement>(null), dragging = useRef<number | null>(null), draggedAt = useRef(-Infinity);
  const { table } = selectGameView(game.view);
  const pickingHand = table.waiting?.kind.type === 'pick_hand_slot' ? table.waiting.kind : null;
  const count = pickingHand?.count ?? table.store_slots;
  const picked = pickingHand ? draft.handSlot : draft.storeSlot;
  const target = game.seats.find(seat => seat.player_id === pickingHand?.target)?.nickname ?? 'người chơi';
  const canChoose = !locked && !draft.healing && actionMode(game) === (pickingHand ? 'pick_hand_slot' : 'general_store');
  const picker = game.seats.find(seat => seat.player_id === table.waiting?.player)?.nickname ?? 'Người chơi';
  return <section ref={root} className={`store-pool${pickingHand ? ' hand-pool' : ''}`} aria-label={pickingHand ? 'Chọn mù bài trên tay' : 'Chọn mù General Store'}>
    {!pickingHand && <img className="store-deck" data-animation-region="draw" src={assetUrl(backFiles.card)} alt="" aria-hidden="true" draggable={false} />}
    <h3>{pickingHand ? `${canChoose ? 'Chọn 1 lá úp' : `${count} lá úp`} trên tay ${target}` : `General Store · ${count} lá úp`}</h3>
    <p role="status">{pickingHand ? canChoose ? 'Chọn ô rồi xác nhận. Các mặt lá được giữ kín.' : `${picker} đang chọn lá từ tay ${target}.` : canChoose ? 'Chọn một lá úp. Nhận xong mới thấy mặt lá.' : `${picker} đang chọn một lá úp.`}</p>
    <div className="store-slots">{Array.from({ length: count }, (_, slot) => <m.button key={`${game.seq}:${slot}`} type="button" className={`store-slot${picked === slot ? ' is-picked' : ''}`} data-store-slot={pickingHand ? undefined : slot} data-hand-slot={pickingHand ? slot : undefined}
      disabled={!canChoose} aria-label={`Chọn lá úp ${slot + 1}`} aria-pressed={canChoose ? picked === slot : undefined} style={{ touchAction: desktop && canChoose && !pickingHand ? 'none' : undefined }}
      drag={desktop && canChoose && !pickingHand} dragSnapToOrigin dragMomentum={false}
      onDragStart={() => { dragging.current = slot; }} onDragEnd={(event, info) => {
        const active = dragging.current; dragging.current = null; draggedAt.current = performance.now();
        const tray = root.current?.closest('.board-scene')?.querySelector('.own-hand');
        const action = pickingHand ? chooseHandSlotAction(game, slot, !canChoose) : chooseStoreSlotAction(game, slot, !canChoose);
        if (event.type !== 'pointercancel' && active === slot && action && tray && dropZoneAt(info.point, [{ player: null, rect: tray.getBoundingClientRect() }])) send(action);
      }}
      onClick={event => { if (performance.now() - draggedAt.current >= 200) { event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' }); setDraft({ ...emptyDraft, ...(pickingHand ? { handSlot: slot } : { storeSlot: slot }) }); } }}>
      <img src={assetUrl(backFiles.card)} alt="" draggable={false} /><span>Ô {slot + 1}</span>{desktop && canChoose && slot < 9 && <kbd aria-hidden="true">{slot + 1}</kbd>}
    </m.button>)}</div>
    {canChoose && <small>{pickingHand ? 'Chọn rồi nhấn Enter · phím 1–9 chọn ô' : 'Chọn rồi nhấn Enter · hoặc kéo lá về khay bài của bạn'}</small>}
  </section>;
}
