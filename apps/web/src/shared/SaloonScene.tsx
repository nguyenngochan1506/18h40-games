import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { m, useIsPresent, useReducedMotion } from 'motion/react';

export function DecodedImage({ src, className }: { src: string; className?: string }) {
  const image = useRef<HTMLImageElement>(null);
  const [decoded, setDecoded] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const element = image.current!;
    void element.decode().then(() => { if (active) setDecoded(src); }).catch(() => {
      // Some browsers reject decode even after a successful load.
      if (active && element.complete && element.naturalWidth) setDecoded(src);
    });
    return () => { active = false; };
  }, [src]);
  return <img ref={image} src={src} alt="" aria-hidden="true" decoding="async" draggable={false} className={`decoded-image ${className ?? ''}${decoded === src ? ' is-decoded' : ''}`} />;
}

export function SaloonBackdrop() {
  return <div className="saloon-backdrop" aria-hidden="true"><DecodedImage src="/scene/saloon-bg.webp" /><div className="saloon-shade" /><div className="saloon-embers" /><div className="saloon-lamplight" /></div>;
}

export function SceneTransition({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const present = useIsPresent();
  const scene = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scene.current?.querySelector<HTMLElement>('[data-scene-title]')?.focus({ preventScroll: true });
  }, []);
  return <m.div ref={scene} className="app-scene" inert={!present} aria-hidden={!present || undefined}
    initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
    transition={{ duration: reduced ? .1 : .3, ease: 'easeOut' }}>{children}</m.div>;
}
