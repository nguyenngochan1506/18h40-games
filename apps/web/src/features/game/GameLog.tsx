import { forwardRef, useId, useLayoutEffect, useRef } from 'react';
import type { LogEntry } from './log';
import type { RefObject } from 'react';
import { AnimatePresence, m, useIsPresent } from 'motion/react';
import { useTableMotion } from './GameMotion';

type Props = { entries: LogEntry[]; expanded: boolean; onToggle: () => void; scrollState: RefObject<{ following: boolean; top: number }> };

export default forwardRef<HTMLElement, Props>(function GameLog({ entries, expanded, onToggle, scrollState }, ref) {
  const linesId = useId();
  const present = useIsPresent();
  const animated = useTableMotion();
  const scroll = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { if (expanded) toggle.current?.focus({ preventScroll: true }); }, [expanded]);
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scrollState.current.following ? scroll.current.scrollHeight : scrollState.current.top;
  }, [entries, expanded, scrollState]);
  return <m.section ref={ref} inert={!present} aria-hidden={!present || undefined} initial={{ opacity: 0, y: animated ? 8 : 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: animated ? .2 : .1 }} onKeyDown={(event) => { if (event.key === 'Escape' && expanded) onToggle(); }} className={`game-log${expanded ? ' expanded' : ''}`} aria-label="Nhật ký ván">
    <div className="log-heading"><h3>Nhật ký ván</h3><button type="button" className="action secondary log-toggle" ref={toggle} aria-expanded={expanded} aria-controls={linesId} onClick={onToggle}>{expanded ? 'Thu gọn' : 'Mở rộng'}</button></div>
    <p className="log-note">Giữ tối đa 300 dòng gần nhất trong phiên này.</p>
    <div id={linesId} className="log-scroll" ref={scroll} role="log" aria-label="Các sự kiện trong ván" aria-live="polite" aria-relevant="additions" aria-atomic="false" onScroll={(event) => {
      const node = event.currentTarget;
      if (!present || node.clientHeight === 0) return;
      scrollState.current = { top: node.scrollTop, following: node.scrollHeight - node.scrollTop - node.clientHeight < 24 };
    }} tabIndex={0}>
      {entries.length ? <ol><AnimatePresence initial={false}>{entries.map((entry) => <m.li key={entry.id} data-ui-motion="log" initial={{ opacity: 0, x: animated ? 8 : 0 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: animated ? .2 : .1 }}>{entry.text}</m.li>)}</AnimatePresence></ol> : <p>Chưa có sự kiện trong phiên này.</p>}
    </div>
  </m.section>;
});
