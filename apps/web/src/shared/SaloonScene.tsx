import { useEffect, useRef, useState } from 'react';
import type { ReactNode, ReactEventHandler } from 'react';
import { m, useIsPresent, useReducedMotion } from 'motion/react';

export function DecodedImage({ src, className, alt = '', loading, onError }: { src: string; className?: string; alt?: string; loading?: 'eager' | 'lazy'; onError?: ReactEventHandler<HTMLImageElement> }) {
  const image = useRef<HTMLImageElement>(null);
  const [decoded, setDecoded] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const element = image.current!;
    const decode = () => {
      void element.decode().then(() => { if (active) setDecoded(src); }).catch(() => {
        if (active && element.complete && element.naturalWidth) setDecoded(src);
      });
    };
    element.addEventListener('load', decode);
    decode();
    return () => { active = false; element.removeEventListener('load', decode); };
  }, [src]);
  return <img ref={image} src={src} alt={alt} aria-hidden={alt ? undefined : true} loading={loading} onError={onError} decoding="async" draggable={false} className={`decoded-image ${className ?? ''}${decoded === src ? ' is-decoded' : ''}`} />;
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

const sceneImages = new Map<string, Promise<void>>();
export function usePreloadedImages(files: string[]) {
  const key = files.join('\n');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!key) { setReady(false); return; }
    // Later actor changes decode in place, without sending an open table back to the waiting room.
    if (ready) return;
    let active = true;
    const jobs = key ? key.split('\n').map(src => {
      if (!sceneImages.has(src)) {
        const image = new Image(); image.decoding = 'async'; image.src = src;
        sceneImages.set(src, image.decode().catch(() => undefined));
      }
      return sceneImages.get(src)!;
    }) : [];
    void Promise.all(jobs).then(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [key, ready]);
  return !key || ready;
}
