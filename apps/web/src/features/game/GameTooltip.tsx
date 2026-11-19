import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { tooltipContent, tooltipPosition } from './tablePolish';

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
      if (next === current || next === dismissed) return;
      clear(); setTarget(null); setPosition(null); current = next;
      if (next && !next.closest(':disabled,[inert]')) timers.current.show = window.setTimeout(() => setTarget(next), 350);
    };
    const leave = (event: Event) => {
      if (current?.contains((event as MouseEvent).relatedTarget as Node | null)) return;
      current = null; dismissed = null;
      clear();
      timers.current.hide = window.setTimeout(hide, 100);
    };
    const dismiss = () => { dismissed = current; current = null; hide(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' || event.key === 'Enter' || /^[1-9]$/.test(event.key)) dismiss(); };
    stage.addEventListener('pointerover', enter); stage.addEventListener('pointerout', leave);
    stage.addEventListener('focusin', enter); stage.addEventListener('focusout', leave);
    stage.addEventListener('pointerdown', dismiss, true); stage.addEventListener('keydown', key, true);
    window.addEventListener('resize', dismiss); stage.addEventListener('scroll', dismiss, true);
    return () => {
      clear(); stage.removeEventListener('pointerover', enter); stage.removeEventListener('pointerout', leave);
      stage.removeEventListener('focusin', enter); stage.removeEventListener('focusout', leave);
      stage.removeEventListener('pointerdown', dismiss, true); stage.removeEventListener('keydown', key, true);
      window.removeEventListener('resize', dismiss); stage.removeEventListener('scroll', dismiss, true);
    };
  }, [enabled, dragging]);
  const content = target ? tooltipContent(target.dataset.tip ?? '') : null;
  useLayoutEffect(() => {
    if (!target || !content || !tip.current) return;
    const blocked = [...root.current!.querySelectorAll<HTMLElement>('.decision-overlay,.card-detail')].filter(el => el.getClientRects().length && !el.closest('[inert]')).map(el => el.getBoundingClientRect());
    const next = tooltipPosition(target.getBoundingClientRect(), tip.current.getBoundingClientRect(), { width: innerWidth, height: innerHeight }, blocked);
    if (!next) { setTarget(null); return; }
    setPosition(next);
    const previous = target.getAttribute('aria-describedby');
    target.setAttribute('aria-describedby', [previous, id].filter(Boolean).join(' '));
    return () => { if (previous) target.setAttribute('aria-describedby', previous); else target.removeAttribute('aria-describedby'); };
  }, [target, id]);
  if (!content || !target) return null;
  return createPortal(<div ref={tip} id={id} role="tooltip" className="game-tooltip" style={position ? { ...position, visibility: 'visible' } : { visibility: 'hidden' }} onPointerEnter={clear} onPointerLeave={hide}>
    <strong>{content.title}</strong><p>{content.text}</p>
  </div>, document.body);
}
