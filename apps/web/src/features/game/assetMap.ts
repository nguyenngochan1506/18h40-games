import type { BangRole, CardKind, Character } from '../../generated/protocol.ts';

export const ASSET_COMMIT = 'dc7c29abffc566629ab0fae3bb3386280a7ae52c';
export const ASSET_BASE_URL = `https://raw.githubusercontent.com/bangsalvoserver/bang-cards/${ASSET_COMMIT}/`;

export const cardFiles = {
  bang: 'main_deck/01_bang.webp', missed: 'main_deck/01_mancato.webp',
  beer: 'main_deck/01_birra.webp', panic: 'main_deck/01_panico.webp',
  cat_balou: 'main_deck/01_catbalou.webp', duel: 'main_deck/01_duello.webp',
  indians: 'main_deck/01_indiani.webp', general_store: 'main_deck/01_emporio.webp',
  gatling: 'main_deck/01_gatling.webp', saloon: 'main_deck/01_saloon.webp',
  stagecoach: 'main_deck/01_diligenza.webp', wells_fargo: 'main_deck/01_wellsfargo.webp',
  barrel: 'main_deck/01_barile.webp', dynamite: 'main_deck/01_dinamite.webp',
  jail: 'main_deck/01_prigione.webp', mustang: 'main_deck/01_mustang.webp',
  scope: 'main_deck/01_mirino.webp', volcanic: 'main_deck/01_volcanic.webp',
  schofield: 'main_deck/01_schofield.webp', remington: 'main_deck/01_remington.webp',
  rev_carabine: 'main_deck/01_carabine.webp', winchester: 'main_deck/01_winchester.webp',
} satisfies Record<CardKind, string>;

export const characterFiles = {
  bart_cassidy: 'character/01_bartcassidy.webp', black_jack: 'character/01_blackjack.webp',
  calamity_janet: 'character/01_calamityjanet.webp', el_gringo: 'character/01_elgringo.webp',
  jesse_jones: 'character/01_jessejones.webp', jourdonnais: 'character/01_jourdonnais.webp',
  kit_carlson: 'character/01_kitcarlson.webp', lucky_duke: 'character/01_luckyduke.webp',
  paul_regret: 'character/01_paulregret.webp', pedro_ramirez: 'character/01_pedroramirez.webp',
  rose_doolan: 'character/01_rosedoolan.webp', sid_ketchum: 'character/01_sidketchum.webp',
  slab_the_killer: 'character/01_slab.webp', suzy_lafayette: 'character/01_suzylafayette.webp',
  vulture_sam: 'character/01_vulturesam.webp', willy_the_kid: 'character/01_willythekid.webp',
} satisfies Record<Character, string>;

export const roleFiles = {
  sheriff: 'role/sheriff.webp', deputy: 'role/deputy.webp',
  outlaw: 'role/outlaw.webp', renegade: 'role/renegade.webp',
} satisfies Record<BangRole, string>;
export const backFiles = { card: 'backface/main_deck.webp', role: 'backface/role.webp' };
export const assetFiles = [...Object.values(cardFiles), ...Object.values(characterFiles), ...Object.values(roleFiles), ...Object.values(backFiles)];
export const assetUrl = (file: string) => `/bang/${file}`;

export const sceneFiles = {
  background: '/scene/saloon-bg.webp', table: '/scene/table.webp',
  cowboy: '/scene/cowboy.webp', ghost: '/scene/ghost.webp',
} as const;

export const landscapeScenes = {
  4: '/scene/scene4-landscape.webp', 5: '/scene/scene5-landscape.webp',
  6: '/scene/scene6-landscape.webp', 7: '/scene/scene-landscape.webp',
} as const;

// Optional art is supplied independently; missing files use the original actor or CSS FX.
export const optionalSceneFiles = {
  cowboyB: '/scene/cowboy-b.webp', cowboyC: '/scene/cowboy-c.webp', cowboyD: '/scene/cowboy-d.webp', cowboyE: '/scene/cowboy-e.webp', cowboyF: '/scene/cowboy-f.webp',
  dynamite: '/scene/fx/fx-dynamite.webp',
} as const;

export const fxFiles = {
  muzzle: '/scene/fx/fx-muzzle-flash.webp', smokeA: '/scene/fx/fx-smoke-a.webp', smokeB: '/scene/fx/fx-smoke-b.webp', bullet: '/scene/fx/fx-bullet.webp', impact: '/scene/fx/fx-impact.webp', explosion: '/scene/fx/fx-explosion.webp', jail: '/scene/fx/fx-jail-bars.webp', sparkle: '/scene/fx/fx-sparkle.webp',
} as const;
declare const __SCENE_FILES__: string[];
export const availableSceneFiles: readonly string[] = typeof __SCENE_FILES__ === 'undefined' ? [] : __SCENE_FILES__;
export const cowboyVariants = [sceneFiles.cowboy, optionalSceneFiles.cowboyB, optionalSceneFiles.cowboyC, optionalSceneFiles.cowboyD, optionalSceneFiles.cowboyE, optionalSceneFiles.cowboyF];
export function cowboyFile(playerId: number, available: readonly string[] = availableSceneFiles) {
  const variant = cowboyVariants[Math.abs(Math.trunc(playerId)) % cowboyVariants.length];
  return available.includes(variant) ? variant : sceneFiles.cowboy;
}

export type SeatView = 'front' | 'q3front' | 'side' | 'q3back';
export const seatViews = ['q3front', 'side', 'q3back'] as const;
export const seatActorFiles = [
  ...['a', 'b', 'c', 'd', 'e', 'f'].flatMap(style => seatViews.map(view => `/scene/seat/cowboy-${style}-${view}.webp`)),
  ...seatViews.map(view => `/scene/seat/ghost-${view}.webp`),
];

// Angled portraits are required assets; only the original front variants are optional.
export function seatActorFile(playerId: number, view: SeatView, ghost = false, available: readonly string[] = availableSceneFiles) {
  if (view === 'front') return ghost ? sceneFiles.ghost : cowboyFile(playerId, available);
  const style = 'abcdef'[Math.abs(Math.trunc(playerId)) % 6];
  return `/scene/seat/${ghost ? 'ghost' : `cowboy-${style}`}-${view}.webp`;
}
