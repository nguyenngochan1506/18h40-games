import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { m, useReducedMotion } from 'motion/react';
import type { CardId, PublicPlayer } from '../../generated/protocol';
import type { FxBatch } from './fx';
import { assetUrl, backFiles, cardFiles } from './assetMap';
import { cardFace } from './cardCatalog';
import { DEAL_DURATION, dealPlan, shouldDeal } from './tableMotion';

type Flight = ReturnType<typeof dealPlan>[number] & { x: number; y: number; toX: number; toY: number };

export default function GameDeal({ batch, players, you, hand, enabled, ownTurn, root }: { batch: FxBatch | null; players: PublicPlayer[]; you: number | null; hand: CardId[]; enabled: boolean; ownTurn: boolean; root: RefObject<HTMLDivElement | null> }) {
  const reduced = useReducedMotion();
  const seen = useRef<number | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  useEffect(() => {
    const element = root.current;
    if (!element || !batch || batch.id === seen.current) return;
    const play = shouldDeal(batch.events, seen.current, batch.id, { enabled, hidden: document.hidden, reduced: !!reduced, ownTurn });
    seen.current = batch.id;
    if (!play) return;
    const origin = element.getBoundingClientRect();
    const draw = element.querySelector('[data-animation-region="draw"]')?.getBoundingClientRect();
    if (!draw) return;
    const plan = dealPlan(players, you, hand);
    setFlights(plan.flatMap(flight => {
      const target = element.querySelector(flight.player === you ? '[data-animation-region="hand"]' : `[data-animation-anchor="${flight.player}"]`)?.getBoundingClientRect();
      return target ? [{ ...flight, x: draw.x + draw.width / 2 - origin.x, y: draw.y - origin.y, toX: target.x + target.width / 2 - origin.x + (flight.player === you ? (flight.index - 1.5) * 28 : 0), toY: target.y + target.height / 2 - origin.y }] : [];
    }));
  }, [batch, players, you, hand, enabled, reduced, ownTurn, root]);
  useEffect(() => {
    if (!enabled || reduced || ownTurn) setFlights([]);
  }, [enabled, reduced, ownTurn]);
  useEffect(() => {
    const cancel = () => setFlights([]);
    const element = root.current;
    element?.addEventListener('pointerdown', cancel, { capture: true });
    element?.addEventListener('keydown', cancel, { capture: true });
    document.addEventListener('visibilitychange', cancel);
    window.addEventListener('resize', cancel);
    return () => {
      element?.removeEventListener('pointerdown', cancel, { capture: true });
      element?.removeEventListener('keydown', cancel, { capture: true });
      document.removeEventListener('visibilitychange', cancel);
      window.removeEventListener('resize', cancel);
    };
  }, [root]);
  return <div className="game-deal" aria-hidden="true" data-deal-active={flights.length > 0}>{flights.map((flight, index) => {
    const face = flight.card === null ? null : cardFace(flight.card);
    return <m.div className="deal-card" key={`${flight.player}-${flight.index}`} data-ui-motion="deal" data-deal-player={flight.player} data-deal-face={face ? 'own' : 'back'}
      initial={{ x: flight.x, y: flight.y, opacity: 0, rotate: -8, scale: .7 }} animate={{ x: flight.toX, y: flight.toY, opacity: [0, 1, 1, 0], rotate: flight.player === you ? (flight.index - 1.5) * 4 : -8, scale: 1 }}
      transition={{ duration: DEAL_DURATION, delay: flight.delay, ease: 'easeOut', opacity: { duration: DEAL_DURATION, delay: flight.delay, times: [0, .1, .85, 1] } }}
      onAnimationComplete={index === flights.length - 1 ? () => setFlights([]) : undefined}>
      <img src={assetUrl(backFiles.card)} alt="" />
      {face && <m.img src={assetUrl(cardFiles[face.kind])} alt="" className="deal-front" initial={{ opacity: 0, rotateY: 90 }} animate={{ opacity: 1, rotateY: 0 }} transition={{ duration: .1, delay: flight.delay + DEAL_DURATION - .1 }} />}
    </m.div>;
  })}</div>;
}
