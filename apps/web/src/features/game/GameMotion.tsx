import { createContext, useContext, useId, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { animate, domMax, LayoutGroup, LazyMotion, m, MotionConfig, useIsPresent, useReducedMotion } from 'motion/react';

const TableMotion = createContext(false);
export const useTableMotion = () => useContext(TableMotion);
export const tableSpring = { type: 'spring' as const, stiffness: 420, damping: 32 };

export function GameMotion({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const reduced = useReducedMotion();
  const id = useId();
  return <LazyMotion features={domMax} strict><MotionConfig reducedMotion="user"><TableMotion.Provider value={enabled && !reduced}><LayoutGroup id={id}>{children}</LayoutGroup></TableMotion.Provider></MotionConfig></LazyMotion>;
}

export function MotionCount({ value }: { value: number }) {
  const animated = useTableMotion();
  const element = useRef<HTMLSpanElement>(null);
  const current = useRef(value);
  useLayoutEffect(() => {
    if (!animated) { current.current = value; return; }
    const animation = animate(current.current, value, { duration: .2, ease: 'easeOut', onUpdate: latest => {
      current.current = latest;
      if (element.current) element.current.textContent = String(Math.round(latest));
    } });
    return () => animation.stop();
  }, [value, animated]);
  return <span className="motion-count"><span className="sr-only">{value}</span><span ref={element} data-ui-motion="count" aria-hidden="true">{value}</span></span>;
}

export function MotionPanel({ children, className, label, role }: { children: ReactNode; className?: string; label?: string; role?: 'complementary' | 'status' }) {
  const animated = useTableMotion();
  const present = useIsPresent();
  return <m.div className={className} role={role} aria-label={label} inert={!present} data-ui-motion="panel"
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={animated ? { ...tableSpring, opacity: { duration: .15 } } : { duration: .1 }}>
    <m.div className="panel-surface" data-ui-motion="panel-surface" initial={{ y: animated ? 8 : 0 }} animate={{ y: 0 }} exit={{ y: animated ? 4 : 0 }} transition={animated ? tableSpring : { duration: .1 }}>{children}</m.div>
  </m.div>;
}
