import { createContext, useContext, useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { sound } from './sound/sound';

const PortalContext = createContext<HTMLElement | null>(null);
export const useGamePortal = () => useContext(PortalContext);
let listeners = 0;
let releaseSound: (() => void) | undefined;
function acquireSound() {
  if (listeners++ === 0) releaseSound = sound.listen();
  return () => { if (--listeners === 0) { releaseSound?.(); sound.dispose(); } };
}
export function GameLifetime({ children }: { children: ReactNode }) {
  useEffect(acquireSound, []);
  return <div className="game-bang game-bang-lifetime">{children}</div>;
}
export default function GameScope({ children }: { children: ReactNode }) {
  const id = useId();
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const element = document.createElement('div'); element.className = 'game-bang'; element.id = id;
    element.dataset.bangPortal = ''; document.body.append(element); setPortal(element);
    const release = acquireSound();
    return () => { element.remove(); release(); };
  }, [id]);
  return <div className="game-bang" data-bang-root={id}><PortalContext value={portal}>{children}</PortalContext></div>;
}
