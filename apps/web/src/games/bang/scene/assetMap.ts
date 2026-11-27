import type { BangRole, CardKind, Character } from '../../../generated/protocol.ts';
import { DODGE_CITY_FIRST_CARD } from '../cardCatalog.ts';

export const ASSET_COMMIT = 'dc7c29abffc566629ab0fae3bb3386280a7ae52c';
export const ASSET_BASE_URL = `https://raw.githubusercontent.com/bangsalvoserver/bang-cards/${ASSET_COMMIT}/`;

const baseCardFiles = {
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
} satisfies Partial<Record<CardKind, string>>;

const baseCharacterFiles = {
  bart_cassidy: 'character/01_bartcassidy.webp', black_jack: 'character/01_blackjack.webp',
  calamity_janet: 'character/01_calamityjanet.webp', el_gringo: 'character/01_elgringo.webp',
  jesse_jones: 'character/01_jessejones.webp', jourdonnais: 'character/01_jourdonnais.webp',
  kit_carlson: 'character/01_kitcarlson.webp', lucky_duke: 'character/01_luckyduke.webp',
  paul_regret: 'character/01_paulregret.webp', pedro_ramirez: 'character/01_pedroramirez.webp',
  rose_doolan: 'character/01_rosedoolan.webp', sid_ketchum: 'character/01_sidketchum.webp',
  slab_the_killer: 'character/01_slab.webp', suzy_lafayette: 'character/01_suzylafayette.webp',
  vulture_sam: 'character/01_vulturesam.webp', willy_the_kid: 'character/01_willythekid.webp',
} satisfies Partial<Record<Character, string>>;

// Dodge City art (`main_deck/03_*`, `character/03_*`, bang-cards@dc7c29a) is in assets/bang/. The pack has
// its own picture for every kind it contains, including kinds shared with the base deck (BANG!, Beer...):
// cards with an id from the pack (>= DODGE_CITY_FIRST_CARD) use it through `cardArt(id)`, while
// `cardFiles[kind]` keeps the base picture for shared kinds (tooltips and base cards).
const dodgeCityCardArt = {
  bang: 'main_deck/03_bang.webp', beer: 'main_deck/03_birra.webp', cat_balou: 'main_deck/03_cat_balou.webp', general_store: 'main_deck/03_emporio.webp',
  indians: 'main_deck/03_indiani.webp', missed: 'main_deck/03_mancato.webp', panic: 'main_deck/03_panico.webp',
  barrel: 'main_deck/03_barile.webp', dynamite: 'main_deck/03_dinamite.webp', mustang: 'main_deck/03_mustang.webp',
  remington: 'main_deck/03_remington.webp', rev_carabine: 'main_deck/03_rev_carabine.webp',
  binocular: 'main_deck/03_binocolo.webp', hideout: 'main_deck/03_riparo.webp', punch: 'main_deck/03_pugno.webp',
  rag_time: 'main_deck/03_rag_time.webp', brawl: 'main_deck/03_rissa.webp', dodge: 'main_deck/03_schivata.webp',
  springfield: 'main_deck/03_springfield.webp', tequila: 'main_deck/03_tequila.webp', whisky: 'main_deck/03_whisky.webp',
  bible: 'main_deck/03_bibbia.webp', canteen: 'main_deck/03_borraccia.webp', can_can: 'main_deck/03_can_can.webp',
  ten_gallon_hat: 'main_deck/03_cappello.webp', conestoga: 'main_deck/03_conestoga.webp', derringer: 'main_deck/03_derringer.webp',
  buffalo_rifle: 'main_deck/03_fucile_da_caccia.webp', howitzer: 'main_deck/03_howitzer.webp', pepperbox: 'main_deck/03_pepperbox.webp',
  iron_plate: 'main_deck/03_placca_di_ferro.webp', pony_express: 'main_deck/03_pony_express.webp', knife: 'main_deck/03_pugnale.webp',
  sombrero: 'main_deck/03_sombrero.webp',
} as const satisfies Partial<Record<CardKind, string>>;
const dodgeCityCharacterArt = {
  apache_kid: 'character/03_apache_kid.webp', belle_star: 'character/03_belle_star.webp', bill_noface: 'character/03_bill_noface.webp',
  chuck_wengam: 'character/03_chuck_wengam.webp', doc_holyday: 'character/03_doc_holyday.webp', elena_fuente: 'character/03_elena_fuente.webp',
  greg_digger: 'character/03_greg_digger.webp', herb_hunter: 'character/03_herb_hunter.webp', jose_delgado: 'character/03_jose_delgado.webp',
  molly_stark: 'character/03_molly_stark.webp', pat_brennan: 'character/03_pat_brennan.webp', pixie_pete: 'character/03_pixie_pete.webp',
  sean_mallory: 'character/03_sean_mallory.webp', tequila_joe: 'character/03_tequila_joe.webp', vera_custer: 'character/03_vera_custer.webp',
} as const satisfies Partial<Record<Character, string>>;
export const dodgeCityArt = { cards: dodgeCityCardArt, characters: dodgeCityCharacterArt };
// Kinds that exist only in the pack have no base picture, so their kind entry is the pack picture.
const packOnlyCards = Object.fromEntries(Object.entries(dodgeCityCardArt).filter(([kind]) => !(kind in baseCardFiles)));
export const cardFiles: Record<CardKind, string> = { ...baseCardFiles, ...packOnlyCards } as Record<CardKind, string>;
export const characterFiles: Record<Character, string> = { ...baseCharacterFiles, ...dodgeCityCharacterArt } as Record<Character, string>;
/** Picture for one physical card: pack cards (ids from `DODGE_CITY_FIRST_CARD`) use the pack's own art. */
export function cardArt(id: number, kind: CardKind): string {
  return id >= DODGE_CITY_FIRST_CARD ? dodgeCityCardArt[kind as keyof typeof dodgeCityCardArt] ?? cardFiles[kind] : cardFiles[kind];
}

export const roleFiles = {
  sheriff: 'role/sheriff.webp', deputy: 'role/deputy.webp',
  outlaw: 'role/outlaw.webp', renegade: 'role/renegade.webp',
} satisfies Record<BangRole, string>;
export const backFiles = { card: 'backface/main_deck.webp', role: 'backface/role.webp' };
export const assetFiles = [...Object.values(baseCardFiles), ...Object.values(baseCharacterFiles), ...Object.values(roleFiles), ...Object.values(backFiles), ...Object.values(dodgeCityCardArt), ...Object.values(dodgeCityCharacterArt)];
export const assetUrl = (file: string) => `/bang/${file}`;

export const sceneFiles = {
  background: '/platform/saloon-bg.webp', table: '/bang/scene/table.webp',
  cowboy: '/bang/scene/cowboy.webp', ghost: '/bang/scene/ghost.webp',
} as const;

export const landscapeScenes = {
  4: '/bang/scene/scene4-landscape.webp', 5: '/bang/scene/scene5-landscape.webp',
  6: '/bang/scene/scene6-landscape.webp', 7: '/platform/waiting-table.webp',
  // Eight seats reuse the seven-seat table; sceneSeats adds the extra chair.
  8: '/platform/waiting-table.webp',
} as const;

// Optional art is supplied independently; missing files use the original actor or CSS FX.
export const optionalSceneFiles = {
  cowboyB: '/bang/scene/cowboy-b.webp', cowboyC: '/bang/scene/cowboy-c.webp', cowboyD: '/bang/scene/cowboy-d.webp', cowboyE: '/bang/scene/cowboy-e.webp', cowboyF: '/bang/scene/cowboy-f.webp',
  dynamite: '/bang/scene/fx/fx-dynamite.webp',
} as const;

export const fxFiles = {
  muzzle: '/bang/scene/fx/fx-muzzle-flash.webp', smokeA: '/bang/scene/fx/fx-smoke-a.webp', smokeB: '/bang/scene/fx/fx-smoke-b.webp', bullet: '/bang/scene/fx/fx-bullet.webp', impact: '/bang/scene/fx/fx-impact.webp', explosion: '/bang/scene/fx/fx-explosion.webp', jail: '/bang/scene/fx/fx-jail-bars.webp', sparkle: '/bang/scene/fx/fx-sparkle.webp',
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
  ...['a', 'b', 'c', 'd', 'e', 'f'].flatMap(style => seatViews.map(view => `/platform/seat/cowboy-${style}-${view}.webp`)),
  ...seatViews.map(view => `/platform/seat/ghost-${view}.webp`),
];

// Angled portraits are required assets; only the original front variants are optional.
export function seatActorFile(playerId: number, view: SeatView, ghost = false, available: readonly string[] = availableSceneFiles) {
  if (view === 'front') return ghost ? sceneFiles.ghost : cowboyFile(playerId, available);
  const style = 'abcdef'[Math.abs(Math.trunc(playerId)) % 6];
  return `/platform/seat/${ghost ? 'ghost' : `cowboy-${style}`}-${view}.webp`;
}
