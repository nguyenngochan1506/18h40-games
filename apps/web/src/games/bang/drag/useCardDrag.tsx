import { useGamePortal } from '../GameScope';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import type { Action, CardId } from '../../../generated/protocol';
import type { BangSnapshot as GameSnapshot } from '../types.ts';
import type { ActionDraft } from '../actions';
import { playTargets } from '../actions';
import { dragDestination, dropAction, dropZoneAt, settleDrop } from './cardDrag';
import type { DropRect, DropZone, Point } from './cardDrag';
import { assetUrl, cardArt } from '../scene/assetMap';
import { cardFace } from '../cardCatalog';
import { tableSpring } from '../GameMotion';

type Flight = { card: CardId; seq: number; from: DropRect; home: DropRect; to: Point; phase: 'pending' | 'rollback' | 'accepted'; requestVersion: number; previousError: string | null };
export type CardDrag = { active: boolean; start: (home: DropRect) => void; move: (point: Point) => void; end: (point: Point, from: DropRect) => boolean };
export function useCardDrag({ root, game, draft, locked, ready, requestVersion, error, desktop, setDraft, send, clearDetail }: {
  root: RefObject<HTMLDivElement | null>; game: GameSnapshot; draft: ActionDraft; locked: boolean; ready: boolean; requestVersion: number; error: string | null; desktop: boolean;
  setDraft: (draft: ActionDraft) => void; send: (action: Action) => void; clearDetail: () => void;
}) {
  const portal = useGamePortal();
  const reduced = useReducedMotion();
  const [dragging, setDragging] = useState<CardId | null>(null), [over, setOver] = useState<number | 'table' | null>(null), [flight, setFlight] = useState<Flight | null>(null);
  const current = useRef<{ card: CardId; seq: number; home: DropRect; zones: DropZone[] } | null>(null);
  useEffect(() => {
    if (!flight || flight.phase !== 'pending') return;
    const phase = settleDrop(flight.card, flight.seq, game, { ready, failed: !!error && error !== flight.previousError, settled: requestVersion !== flight.requestVersion });
    if (phase !== 'pending') setFlight({ ...flight, phase });
  }, [game, ready, requestVersion, error, flight]);
  useEffect(() => {
    const cancel = () => { current.current = null; setDragging(null); setOver(null); };
    const resize = () => { cancel(); setFlight(null); };
    const hidden = () => { if (document.hidden) { cancel(); setFlight(null); } };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('resize', resize); window.addEventListener('blur', cancel); document.addEventListener('visibilitychange', hidden); document.addEventListener('keydown', escape);
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('blur', cancel); document.removeEventListener('visibilitychange', hidden); document.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => { if (!desktop) setFlight(null); if (!desktop || locked || (current.current && current.current.seq !== game.seq)) { current.current = null; setDragging(null); setOver(null); } }, [desktop, locked, game.seq]);
  const props = (card: CardId): CardDrag => ({
    active: dragging === card,
    start(home) {
      if (locked || !desktop || !root.current) return;
      const destination = dragDestination(game, draft, card, locked);
      if (!destination) return;
      const zones: DropZone[] = [];
      if (destination === 'player') {
        const players = playTargets(game, card).map(p => p.id);
        for (const node of root.current.querySelectorAll<HTMLElement>('[data-player-id] .seat-person')) {
          const player = Number(node.closest<HTMLElement>('[data-player-id]')?.dataset.playerId);
          if (players.includes(player)) zones.push({ player, rect: node.getBoundingClientRect() });
        }
        const faces = [...root.current.querySelectorAll<HTMLElement>('[data-player-id] .equipment-card')].reverse().map(node => ({ node, z: Number(getComputedStyle(node).zIndex) || 0 })).sort((a, b) => b.z - a.z);
        for (const { node } of faces) {
          const player = Number(node.closest<HTMLElement>('[data-player-id]')?.dataset.playerId);
          if (players.includes(player) && !node.closest('[inert]')) zones.push({ player, selection: { in_play: Number(node.dataset.cardId) }, rect: node.querySelector('.card-visual')!.getBoundingClientRect() });
        }
        for (const node of root.current.querySelectorAll<HTMLElement>('[data-scene-player], [data-player-id] .equipment-heading, [data-player-id] .equipment-rack')) {
          const player = Number(node.dataset.scenePlayer ?? node.closest<HTMLElement>('[data-player-id]')?.dataset.playerId);
          if (players.includes(player)) zones.push({ player, rect: node.getBoundingClientRect() });
        }
      }
      else { const table = root.current.querySelector('.table-center'); if (table) zones.push({ player: null, rect: table.getBoundingClientRect() }); }
      setFlight(null); current.current = { card, seq: game.seq, home, zones }; setDragging(card); clearDetail();
    },
    move(point) { const zone = current.current ? dropZoneAt(point, current.current.zones) : null; setOver(zone ? zone.player ?? 'table' : null); },
    end(point, from) {
      const drag = current.current; current.current = null; setDragging(null); setOver(null);
      if (!drag || drag.card !== card || drag.seq !== game.seq) return false;
      const zone = dropZoneAt(point, drag.zones), result = dropAction(game, draft, card, zone, locked);
      if (!result || !zone) return false;
      setDraft(result.draft); clearDetail();
      if (result.action) {
        setFlight({ card, seq: game.seq, from, home: drag.home, to: { x: zone.rect.x + zone.rect.width / 2, y: zone.rect.y + zone.rect.height / 2 }, phase: 'pending', requestVersion, previousError: error });
        send(result.action);
      }
      return true;
    },
  });
  const face = flight && cardFace(flight.card);
  const destination = flight ? { x: flight.to.x - flight.from.x - flight.from.width / 2, y: flight.to.y - flight.from.y - flight.from.height / 2, scale: .7 } : {};
  const overlay = portal ? createPortal(<AnimatePresence>{flight && face && <m.div key={`${flight.seq}:${flight.card}`} className="drag-flight" aria-hidden="true" data-flight-card={flight.card} data-drag-phase={flight.phase} style={{ left: flight.from.x, top: flight.from.y, width: flight.from.width, height: flight.from.height }}
    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} variants={{ pending: { ...destination, opacity: .85 }, accepted: { ...destination, opacity: 0 }, rollback: { x: flight.home.x - flight.from.x, y: flight.home.y - flight.from.y, opacity: 1, scale: 1 } }} animate={flight.phase}
    transition={reduced ? { duration: 0 } : tableSpring} onAnimationComplete={phase => { if (phase === flight.phase && phase !== 'pending') setFlight(current => current === flight ? null : current); }}><m.img src={assetUrl(cardArt(flight.card, face.kind))} alt="" draggable={false} animate={{ x: flight.phase === 'rollback' && !reduced ? [0, -4, 4, -2, 0] : 0 }} transition={{ delay: .12, duration: .2 }} /></m.div>}</AnimatePresence>, portal) : null;
  return { dragging, over, flight, props, overlay };
}
