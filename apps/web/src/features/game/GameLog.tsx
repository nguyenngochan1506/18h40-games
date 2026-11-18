import { useLayoutEffect, useRef, useState } from 'react';
import type { LogEntry } from './log';

export default function GameLog({ entries }: { entries: LogEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    if (following.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [entries, expanded]);
  return <section className={`game-log${expanded ? ' expanded' : ''}`} aria-label="Nhật ký ván">
    <div className="log-heading"><h3>Nhật ký ván</h3><button type="button" className="action secondary log-toggle" aria-expanded={expanded} aria-controls="game-log-lines" onClick={() => setExpanded(!expanded)}>{expanded ? 'Thu gọn' : 'Mở nhật ký'}</button></div>
    <p className="log-note">Giữ tối đa 300 dòng gần nhất trong phiên này.</p>
    <div id="game-log-lines" className="log-scroll" ref={scroll} role="log" aria-label="Các sự kiện trong ván" aria-live="polite" aria-relevant="additions" aria-atomic="false" onScroll={(event) => {
      const node = event.currentTarget;
      following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
    }} tabIndex={0}>
      {entries.length ? <ol>{entries.map((entry) => <li key={entry.id}>{entry.text}</li>)}</ol> : <p>Chưa có sự kiện trong phiên này.</p>}
    </div>
  </section>;
}
