import type { CardId, CardKind, PublicPlayer } from '../../generated/protocol.ts';
import { cardFace } from './cardCatalog.ts';

const groups: Partial<Record<CardKind, number>> = {
  volcanic: 0, schofield: 0, remington: 0, rev_carabine: 0, winchester: 0,
  barrel: 1, scope: 2, mustang: 2, binocular: 2, hideout: 2, dynamite: 3, jail: 4,
};

export function orderedEquipment(cards: CardId[]) {
  return [...cards].sort((a, b) => (groups[cardFace(a)?.kind as CardKind] ?? 5) - (groups[cardFace(b)?.kind as CardKind] ?? 5));
}

export function equipmentLabel(player: Pick<PublicPlayer, 'weapon_range'>, own = false) {
  return own ? `Trước mặt bạn · Tầm bắn ${player.weapon_range}` : `Tầm ${player.weapon_range}`;
}

export function handCardWidth(viewportWidth: number, viewportHeight: number) {
  return Math.max(44, Math.min(84, viewportWidth * .04375, viewportHeight * .085));
}

export function ownEquipmentWidth(viewportWidth: number, viewportHeight: number) {
  return handCardWidth(viewportWidth, viewportHeight) * .6;
}

export function jailTurnsLabel(player: Pick<PublicPlayer, 'jail_turns_left'>, card: CardId) {
  if (cardFace(card)?.kind !== 'jail' || player.jail_turns_left == null) return null;
  return player.jail_turns_left === 0 ? 'Jail: đã chờ đủ 3 lượt, bỏ ở đầu lượt tiếp theo' : `Jail: còn ${player.jail_turns_left} lượt`;
}

export function equipmentStatus(player: Pick<PublicPlayer, 'weapon_range' | 'jail_turns_left'>, card: CardId) {
  return jailTurnsLabel(player, card) ?? (groups[cardFace(card)?.kind as CardKind] === 0 ? equipmentLabel(player) : undefined);
}

export type EquipmentPose = { rotate: number; curve: number; lift: number; own: boolean };
export function equipmentPose(slot: EquipmentPose, active: boolean, reduced: boolean) {
  return active && !reduced ? { rotate: 0, y: -slot.lift, scale: 1.35 } : { rotate: slot.rotate, y: slot.curve, scale: 1 };
}

export function equipmentFan(cards: CardId[], cardWidth: number, available: number, sceneWidth: number, own = false) {
  const ordered = orderedEquipment(cards), count = ordered.length;
  const angle = own ? 0 : (Math.max(0, count - 1) / 2) * 2.5;
  const cardHeight = cardWidth * 389 / 250;
  const padding = own ? 3 : cardHeight * Math.sin(angle * Math.PI / 180) + 3;
  const step = count < 2 ? 0 : Math.max(0, Math.min(cardWidth * (own ? 2.9 / 4.4 : 2 / 3.5), (available - cardWidth - 2 * padding) / (count - 1)));
  const curve = (index: number) => own ? 0 : (index - (count - 1) / 2) ** 2 * 2.5 * .024 * sceneWidth / 100;
  return {
    width: cardWidth + Math.max(0, count - 1) * step + 2 * padding,
    height: !own && !count ? 0 : cardHeight + Math.max(own ? 0 : sceneWidth * .008, count ? curve(0) : 0),
    step,
    slots: ordered.map((card, index) => ({ card, left: padding + index * step, rotate: own ? 0 : (index - (count - 1) / 2) * 2.5, curve: curve(index), lift: sceneWidth * .014, own })),
  };
}
