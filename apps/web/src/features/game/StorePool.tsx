import { useRef } from 'react';
import { m } from 'motion/react';
import type { Action, GameSnapshot } from '../../generated/protocol';
import { actionMode, chooseStoreSlotAction, emptyDraft } from './actions';
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
  const canChoose = !locked && !draft.healing && actionMode(game) === 'general_store';
  const picker = game.seats.find(seat => seat.player_id === table.waiting?.player)?.nickname ?? 'Người chơi';
  return <section ref={root} className="store-pool" aria-label="Chọn mù General Store">
    <img className="store-deck" data-animation-region="draw" src={assetUrl(backFiles.card)} alt="" aria-hidden="true" draggable={false} />
    <h3>General Store · {table.store_slots} lá úp</h3>
    <p role="status">{canChoose ? 'Chọn một lá úp. Nhận xong mới thấy mặt lá.' : `${picker} đang chọn một lá úp.`}</p>
    <div className="store-slots">{Array.from({ length: table.store_slots }, (_, slot) => <m.button key={`${game.seq}:${slot}`} type="button" className={`store-slot${draft.storeSlot === slot ? ' is-picked' : ''}`} data-store-slot={slot}
      disabled={!canChoose} aria-label={`Chọn lá úp ${slot + 1}`} aria-pressed={canChoose ? draft.storeSlot === slot : undefined} style={{ touchAction: desktop && canChoose ? 'none' : undefined }}
      drag={desktop && canChoose} dragSnapToOrigin dragMomentum={false}
      onDragStart={() => { dragging.current = slot; }} onDragEnd={(event, info) => {
        const active = dragging.current; dragging.current = null; draggedAt.current = performance.now();
        const tray = root.current?.closest('.board-scene')?.querySelector('.own-hand');
        const action = chooseStoreSlotAction(game, slot, !canChoose);
        if (event.type !== 'pointercancel' && active === slot && action && tray && dropZoneAt(info.point, [{ player: null, rect: tray.getBoundingClientRect() }])) send(action);
      }}
      onClick={() => { if (performance.now() - draggedAt.current >= 200) setDraft({ ...emptyDraft, storeSlot: slot }); }}>
      <img src={assetUrl(backFiles.card)} alt="" draggable={false} /><span>Ô {slot + 1}</span>{desktop && canChoose && <kbd aria-hidden="true">{slot + 1}</kbd>}
    </m.button>)}</div>
    {canChoose && <small>Chọn rồi nhấn Enter · hoặc kéo lá về khay bài của bạn</small>}
  </section>;
}
