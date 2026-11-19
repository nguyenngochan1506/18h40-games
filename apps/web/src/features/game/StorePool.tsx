import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { m } from 'motion/react';
import type { Action, GameSnapshot } from '../../generated/protocol';
import { actionMode, chooseStoreSlotAction, chooseHandSlotAction, emptyDraft } from './actions';
import type { ActionDraft } from './actions';
import { assetUrl, backFiles } from './assetMap';
import { dropZoneAt } from './cardDrag';
import { selectGameView } from './state';
import { choiceFan, nextChoiceSlot, storeOwners } from './choiceFan';
import type { FxBatch } from './fx';
import './storePool.css';

export default function StorePool({ game, draft, locked, desktop, setDraft, send, batch = null }: {
  game: GameSnapshot; draft: ActionDraft; locked: boolean; desktop: boolean;
  setDraft: (draft: ActionDraft) => void; send: (action: Action) => void; batch?: FxBatch | null;
}) {
  const root = useRef<HTMLElement>(null), dragging = useRef<number | null>(null), draggedAt = useRef(-Infinity);
  const { table } = selectGameView(game.view);
  const pickingHand = table.waiting?.kind.type === 'pick_hand_slot' ? table.waiting.kind : null;
  const count = pickingHand?.count ?? table.store_slots;
  const [store, setStore] = useState(() => ({ batch: batch?.id ?? null, owners: storeOwners([], count, batch?.events ?? []) }));
  const batchId = batch?.id ?? null;
  let owners = pickingHand ? Array<number | null>(count).fill(null) : store.owners;
  if (!pickingHand && (store.batch !== batchId || owners.filter(owner => owner === null).length !== count)) {
    owners = storeOwners(owners, count, store.batch !== batchId ? batch?.events ?? [] : []);
    setStore({ batch: batchId, owners });
  }
  const [size, setSize] = useState({ available: 320, card: 60 });
  useLayoutEffect(() => {
    const slots = root.current!.querySelector<HTMLElement>('.store-slots')!;
    const measure = () => {
      const available = slots.clientWidth, card = slots.querySelector<HTMLElement>('.store-slot')?.offsetWidth;
      if (available && card) setSize(previous => previous.available === available && previous.card === card ? previous : { available, card });
    };
    measure();
    const observer = new window.ResizeObserver(measure);
    observer.observe(slots);
    const card = slots.querySelector<HTMLElement>('.store-slot');
    if (card) observer.observe(card);
    return () => observer.disconnect();
  }, [count, desktop]);
  const rows = choiceFan(owners.length, size.card, size.available);
  let remaining = 0;
  const slots = owners.map(owner => ({ owner, slot: owner === null ? remaining++ : null }));
  const picked = pickingHand ? draft.handSlot : draft.storeSlot;
  const target = game.seats.find(seat => seat.player_id === pickingHand?.target)?.nickname ?? 'người chơi';
  const canChoose = !locked && !draft.healing && actionMode(game) === (pickingHand ? 'pick_hand_slot' : 'general_store');
  const picker = game.seats.find(seat => seat.player_id === table.waiting?.player)?.nickname ?? 'Người chơi';
  return <section ref={root} className={`store-pool${pickingHand ? ' hand-pool' : ''}`} aria-label={pickingHand ? 'Chọn mù bài trên tay' : 'Chọn mù General Store'} onKeyDown={event => {
    if (!canChoose || event.altKey || event.ctrlKey || event.metaKey) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.store-slot:not(:disabled)')];
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    const next = current < 0 ? null : nextChoiceSlot(event.key, current, buttons.length);
    if (next !== null) { event.preventDefault(); event.stopPropagation(); buttons[next].focus({ preventScroll: true }); }
  }}>
    {!pickingHand && <img className="store-deck" data-animation-region="draw" src={assetUrl(backFiles.card)} alt="" aria-hidden="true" draggable={false} />}
    <h3>{pickingHand ? `${canChoose ? 'Chọn 1 lá úp' : `${count} lá úp`} trên tay ${target}` : `General Store · ${count} lá úp`}</h3>
    <p role="status">{pickingHand ? canChoose ? 'Chọn lá rồi xác nhận. Các mặt lá được giữ kín.' : `${picker} đang chọn lá từ tay ${target}.` : canChoose ? 'Chọn một lá úp. Nhận xong mới thấy mặt lá.' : `${picker} đang chọn một lá úp.`}</p>
    <div className="store-slots" role="group" aria-label="Các lá úp">{rows.map((row, rowIndex) => <div className="choice-fan" key={rowIndex} style={{ width: row.width, height: row.height }}>{row.slots.map(position => {
      const { owner, slot } = slots[position.index];
      const recipient = owner === null ? null : game.seats.find(seat => seat.player_id === owner)?.nickname ?? 'Người chơi';
      const selectable = canChoose && slot !== null;
      return <m.button key={position.index} type="button" className={`store-slot${slot !== null && picked === slot ? ' is-picked' : ''}${recipient ? ' is-claimed' : ''}`} data-store-slot={pickingHand || slot === null ? undefined : slot} data-hand-slot={pickingHand ? slot : undefined} data-animation-region={owner !== null && owners.lastIndexOf(owner) === position.index ? `store-${owner}` : undefined}
      disabled={!selectable} aria-label={recipient ? `Lá đã được ${recipient} nhận` : `Lá úp số ${slot! + 1}`} aria-pressed={selectable ? picked === slot : undefined} aria-keyshortcuts={selectable && slot! < 9 ? String(slot! + 1) : undefined} style={{ left: position.left, top: 32, '--choice-angle': `${position.angle}deg`, '--choice-curve': `${position.curve}px`, '--choice-order': position.index + 1, '--choice-step': `${row.step || size.card}px`, touchAction: desktop && selectable && !pickingHand ? 'none' : undefined } as CSSProperties}
      drag={desktop && selectable && !pickingHand} dragSnapToOrigin dragMomentum={false}
      onDragStart={() => { dragging.current = slot; }} onDragEnd={(event, info) => {
        const active = dragging.current; dragging.current = null; draggedAt.current = performance.now();
        const tray = root.current?.closest('.board-scene')?.querySelector('.own-hand');
        const action = pickingHand ? chooseHandSlotAction(game, slot, !selectable) : chooseStoreSlotAction(game, slot, !selectable);
        if (event.type !== 'pointercancel' && active === slot && action && tray && dropZoneAt(info.point, [{ player: null, rect: tray.getBoundingClientRect() }])) send(action);
      }}
      onClick={() => { if (selectable && performance.now() - draggedAt.current >= 200) setDraft({ ...emptyDraft, ...(pickingHand ? { handSlot: slot } : { storeSlot: slot }) }); }}>
      <span className="store-face"><img src={assetUrl(backFiles.card)} alt="" draggable={false} /><span className="slot-number" aria-hidden="true">{slot === null ? '✓' : slot + 1}</span>{recipient && <span className="slot-recipient" title={recipient}>{recipient}</span>}</span>
    </m.button>;
    })}</div>)}</div>
    {canChoose && <small>{pickingHand ? 'Chọn rồi nhấn Enter · phím 1–9 chọn lá' : 'Chọn rồi nhấn Enter · hoặc kéo lá về khay bài của bạn'}</small>}
  </section>;
}
