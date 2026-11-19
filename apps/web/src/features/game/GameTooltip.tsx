import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { tooltipContent, tooltipPosition } from './tablePolish';
import { DecodedImage } from '../../shared/SaloonScene';

export default function GameTooltip({ root, enabled, dragging }: { root: RefObject<HTMLDivElement | null>; enabled: boolean; dragging: boolean }) {
  const id = useId();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const timers = useRef<{ show?: number; hide?: number }>({});
  const clear = () => { clearTimeout(timers.current.show); clearTimeout(timers.current.hide); };
  const hide = () => { clear(); setTarget(null); setPosition(null); };
  useEffect(() => {
    const stage = root.current;
    if (!stage || !enabled || dragging) { hide(); return; }
    let current: HTMLElement | null = null, dismissed: HTMLElement | null = null;
    const find = (node: EventTarget | null) => node instanceof Element ? node.closest<HTMLElement>('[data-tip]') : null;
    const enter = (event: Event) => {
      const next = find(event.target);
      if (event.type === 'pointerover' && !next && current?.contains(document.activeElement)) return;
      if (next === current || next === dismissed) return;
      clear(); setTarget(null); setPosition(null); current = next;
      if (next && !next.closest(':disabled,[inert]')) timers.current.show = window.setTimeout(() => setTarget(next), next.dataset.tip?.startsWith('card:') ? 120 : 350);
    };
    const leave = (event: Event) => {
      const from = find(event.target), related = (event as MouseEvent).relatedTarget as Node | null;
      if (from === dismissed && !from?.contains(related)) dismissed = null;
      if (from !== current) return;
      if (event.type === 'pointerout' && current?.contains(document.activeElement)) return;
      if (current?.contains((event as MouseEvent).relatedTarget as Node | null)) return;
      const card = current?.dataset.tip?.startsWith('card:');
      current = null; dismissed = null;
      clear();
      if (card) hide(); else timers.current.hide = window.setTimeout(hide, 100);
    };
    const dismiss = () => { dismissed = current; current = null; hide(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' || event.key === 'Enter' || /^[1-9]$/.test(event.key)) dismiss(); };
    stage.addEventListener('pointerover', enter); stage.addEventListener('pointerout', leave);
    stage.addEventListener('focusin', enter); stage.addEventListener('focusout', leave);
    stage.addEventListener('pointerdown', dismiss, true); document.addEventListener('keydown', key, true);
    stage.addEventListener('click', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      clear(); stage.removeEventListener('pointerover', enter); stage.removeEventListener('pointerout', leave);
      stage.removeEventListener('focusin', enter); stage.removeEventListener('focusout', leave);
      stage.removeEventListener('pointerdown', dismiss, true); document.removeEventListener('keydown', key, true);
      stage.removeEventListener('click', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [enabled, dragging]);
  const content = target ? tooltipContent(target.dataset.tip ?? '') : null;
  useLayoutEffect(() => {
    if (!target || !content || !tip.current) return;
    const measure = () => {
      if (!tip.current || !target.isConnected) return;
      tip.current.style.removeProperty('--preview-image-height');
      const tray = content.image ? root.current!.querySelector<HTMLElement>('.own-hand') : null;
      const own = tray?.contains(target);
      const previewHeight = own ? tray!.getBoundingClientRect().top - 24 : innerHeight - 24;
      const art = tip.current.querySelector<HTMLElement>('.preview-art');
      if (art) {
        const excess = tip.current.getBoundingClientRect().height - previewHeight;
        if (excess > 0) tip.current.style.setProperty('--preview-image-height', `${Math.max(100, art.getBoundingClientRect().height - excess)}px`);
      }
      const blocked = [...root.current!.querySelectorAll<HTMLElement>(content.image ? '.decision-overlay,.card-detail,.own-hand' : '.decision-overlay,.card-detail')].filter(el => el.getClientRects().length && !el.closest('[inert]')).map(el => el.getBoundingClientRect());
      const rect = target.getBoundingClientRect();
      const anchor = own ? { left: rect.left, width: rect.width, top: tray!.getBoundingClientRect().top, height: 0 } : rect;
      const next = tooltipPosition(anchor, tip.current.getBoundingClientRect(), { width: innerWidth, height: innerHeight }, blocked);
      if (!next) { setTarget(null); return; }
      setPosition(next);
    };
    measure();
    const stage = root.current!;
    stage.addEventListener('scroll', measure, true);
    const previous = target.getAttribute('aria-describedby');
    target.setAttribute('aria-describedby', [previous, id].filter(Boolean).join(' '));
    return () => { stage.removeEventListener('scroll', measure, true); if (previous) target.setAttribute('aria-describedby', previous); else target.removeAttribute('aria-describedby'); };
  }, [target, id]);
  if (!content || !target) return null;
  return createPortal(<div ref={tip} id={id} role="tooltip" className={`game-tooltip${content.image ? ' card-preview' : ''}`} style={position ? { ...position, visibility: 'visible' } : { left: 0, top: 0, visibility: 'hidden' }} onPointerEnter={content.image ? undefined : clear} onPointerLeave={content.image ? undefined : hide}>
    {content.image && <div className="preview-art"><DecodedImage key={content.image} src={content.image} loading="eager" /><span className={`preview-rank${target.querySelector('.red-suit') ? ' red-suit' : ''}`} aria-hidden="true">{target.querySelector('.card-face')?.textContent}</span></div>}
    <strong>{content.title}</strong><p>{content.text}</p>
    {content.image && target.dataset.tipStatus && <small>{target.dataset.tipStatus}</small>}
  </div>, document.body);
}
