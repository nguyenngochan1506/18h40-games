import type { FxAnchor, FxContext, FxCue, scheduleFx } from './fx.ts';

type Rect = { x: number; y: number; width: number; height: number };
export type FlightLayout = ReturnType<typeof captureFlightLayout>;
export function captureFlightLayout(stage: HTMLElement, ctx: FxContext) {
  const origin = stage.getBoundingClientRect();
  const rect = (node: Element): Rect => {
    const r = node.getBoundingClientRect();
    return { x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height };
  };
  const cards = new Map<string, Rect>(), anchors = new Map<FxAnchor, Rect>();
  const storeSlots = new Map<number, Rect>();
  for (const node of stage.querySelectorAll<HTMLElement>('[data-store-slot]')) storeSlots.set(Number(node.dataset.storeSlot), rect(node));
  for (const node of stage.querySelectorAll<HTMLElement>('[data-animation-region],[data-animation-anchor]')) {
    const anchor = (node.dataset.animationRegion ?? Number(node.dataset.animationAnchor)) as FxAnchor;
    const art = anchor === 'draw' ? node.querySelector('.game-art') : anchor === 'discard' ? node.querySelector('.game-card:not([inert]),.empty-pile') : null;
    anchors.set(anchor, rect(art ?? node));
    if (typeof anchor === 'string') for (const card of node.querySelectorAll<HTMLElement>('[data-card-id]:not([inert])')) cards.set(`${anchor}:${card.dataset.cardId}`, rect(card.querySelector('.card-visual,.game-art') ?? card));
  }
  for (const node of stage.querySelectorAll<HTMLElement>('.decision-pool [data-card-id]:not([inert])')) cards.set(`table:${node.dataset.cardId}`, rect(node));
  for (const player of ctx.players) {
    const badge = stage.querySelector(`[data-player-id="${player.id}"] .hand-count`);
    if (badge) anchors.set(player.id, rect(badge));
  }
  const top = stage.querySelector<HTMLElement>('.discard-pile .pile-top .game-card:not([inert]),.discard-pile .empty-pile');
  const discard = top?.cloneNode(true) as HTMLElement | undefined;
  if (discard) { discard.style.opacity = '1'; discard.style.transform = 'none'; discard.style.visibility = 'visible'; discard.removeAttribute('inert'); }
  return { you: ctx.you, cards, anchors, storeSlots, discard, counts: new Map(ctx.players.map(p => [p.id, p.hand_count])) };
}

export function prepareFlights(stage: HTMLElement, jobs: ReturnType<typeof scheduleFx>, previous: FlightLayout | undefined, ctx: FxContext) {
  const current = captureFlightLayout(stage, ctx);
  const restores = new Set<() => void>();
  const hide = (node: HTMLElement | null) => {
    if (!node) return () => {};
    const old = node.style.visibility;
    node.style.visibility = 'hidden';
    const restore = () => { node.style.visibility = old; restores.delete(restore); };
    restores.add(restore); return restore;
  };
  const fallback = current.anchors.get('table') ?? { x: stage.clientWidth / 2, y: stage.clientHeight / 2, width: 0, height: 0 };
  const center = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  const arrivals = new Map<number, number>();
  for (const job of jobs) if (job.kind === 'card') {
    const player = job.to === 'hand' ? ctx.you : typeof job.to === 'number' ? job.to : null;
    if (player !== null) arrivals.set(player, (arrivals.get(player) ?? 0) + 1);
  }
  const counts = new Map<number, { node: HTMLElement; display: HTMLElement; count: number; restore: () => void }>();
  for (const [player, count] of arrivals) {
    const node = stage.querySelector<HTMLElement>(`[data-player-id="${player}"] .hand-count`);
    if (!node) continue;
    const base = Math.max(0, (current.counts.get(player) ?? count) - count);
    const display = document.createElement('span'); display.className = 'fx-hand-count'; display.setAttribute('aria-hidden', 'true'); display.textContent = String(base); node.append(display);
    const restore = () => { delete node.dataset.flightCount; display.remove(); restores.delete(restore); };
    restores.add(restore); counts.set(player, { node, display, count: base, restore });
    node.dataset.flightCount = String(base);
  }
  const discards = jobs.filter(job => (job.kind === 'card' || job.kind === 'extinguish') && job.to === 'discard' || job.kind === 'check' && job.card !== undefined);
  let pendingDiscards = discards.length;
  let hold: HTMLElement | undefined;
  let showDiscard = () => {};
  if (pendingDiscards) {
    const pile = stage.querySelector<HTMLElement>('.discard-pile .pile-top');
    showDiscard = hide(pile);
    hold = document.createElement('span'); hold.className = 'fx-discard-hold'; hold.setAttribute('aria-hidden', 'true'); hold.inert = true;
    const p = center(current.anchors.get('discard') ?? fallback);
    hold.style.left = `${p.x}px`; hold.style.top = `${p.y}px`;
    if (previous?.discard) hold.append(previous.discard.cloneNode(true));
    stage.append(hold);
    restores.add(() => hold?.remove());
  }
  const lost = previous ? [...previous.cards.keys()].filter(key => key.startsWith('hand:') && !current.cards.has(key)) : [];
  const plans = new Map<FxCue, { from: { x: number; y: number }; to: { x: number; y: number }; width: number; targetWidth: number; land: (face?: HTMLElement) => void }>();
  for (const job of jobs) {
    if (job.kind !== 'card' && job.kind !== 'extinguish' && !(job.kind === 'check' && job.card !== undefined)) continue;
    const sourceKey = `${job.from}:${job.card}`;
    const equipment = typeof job.from === 'number' ? `equipment-${job.from}` : job.from === 'hand' ? `equipment-${ctx.you}` : job.from;
    let from = (job.storeSlot === undefined ? undefined : previous?.storeSlots.get(job.storeSlot)) ?? previous?.cards.get(sourceKey) ?? previous?.cards.get(`${equipment}:${job.card}`) ?? current.cards.get(sourceKey);
    if (!from && job.from === 'hand' && lost.length) from = previous?.cards.get(lost.shift()!);
    const drag = job.card === undefined ? null : document.querySelector<HTMLElement>(`.drag-flight[data-flight-card="${job.card}"]`);
    if (drag) {
      const r = drag.getBoundingClientRect(), origin = stage.getBoundingClientRect();
      from = { x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height }; hide(drag);
    }
    const exactSource = from !== undefined;
    from ??= previous?.anchors.get(job.from) ?? current.anchors.get(job.from) ?? fallback;
    const to = current.cards.get(`${job.to}:${job.card}`) ?? current.anchors.get(job.to) ?? fallback;
    const target = job.card === undefined ? null : job.to === 'hand' ? stage.querySelector<HTMLElement>(`.own-hand .hand-cards [data-card-id="${job.card}"]:not([inert])`) : typeof job.to === 'string' && job.to.startsWith('equipment-') ? stage.querySelector<HTMLElement>(`[data-animation-region="${job.to}"] [data-card-id="${job.card}"]:not([inert])`) : null;
    if (job.from === 'hand' && job.card !== undefined && !current.cards.has(`hand:${job.card}`)) hide(stage.querySelector<HTMLElement>(`.own-hand .hand-cards [data-card-id="${job.card}"]`));
    const show = hide(target);
    const player = job.to === 'hand' ? ctx.you : typeof job.to === 'number' ? job.to : null;
    let landed = false;
    const land = (face?: HTMLElement) => {
      if (landed) return;
      landed = true;
      show();
      const badge = player === null ? undefined : counts.get(player);
      if (badge) {
        badge.count++; badge.node.dataset.flightCount = String(badge.count); badge.display.textContent = String(badge.count);
        arrivals.set(player!, arrivals.get(player!)! - 1);
        if (!arrivals.get(player!)) badge.restore();
      }
      if (discards.includes(job)) {
        pendingDiscards--;
        if (!pendingDiscards) { hold?.remove(); showDiscard(); }
        else if (face && hold) hold.replaceChildren(face.cloneNode(true));
      }
    };
    plans.set(job, { from: center(from), to: center(to), width: exactSource || job.from === 'draw' || job.from === 'discard' ? from.width || 60 : 60, targetWidth: job.to === 'hand' && job.card === undefined ? 60 : to.width || 60, land });
  }
  return { current, plans, clear() { for (const restore of [...restores]) restore(); restores.clear(); } };
}
