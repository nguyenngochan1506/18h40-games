import type { WerewolfRole, WerewolfRoleDeck, WerewolfTeam } from '../../generated/protocol.ts';

export type RoleMeta = {
  id: WerewolfRole;
  name: string;
  englishName: string;
  team: WerewolfTeam;
  balance: number;
  image: string;
  summary: string;
  unique: boolean;
};

export const CARD_BACK_IMAGE = '/werewolf/cards/back.svg';

export const ROLE_ORDER: readonly WerewolfRole[] = [
  'werewolf',
  'alpha_wolf',
  'minion',
  'sorcerer',
  'seer',
  'bodyguard',
  'witch',
  'hunter',
  'cupid',
  'prince',
  'mayor',
  'diseased',
  'lycan',
  'cursed',
  'tanner',
  'villager',
];

export const ROLES: Record<WerewolfRole, RoleMeta> = {
  villager: {
    id: 'villager',
    name: 'Dân Làng',
    englishName: 'Villager',
    team: 'village',
    balance: 1,
    image: '/werewolf/cards/villager.svg',
    summary: 'Không có kỹ năng đêm. Ban ngày cùng làng suy luận và bỏ phiếu tìm Ma Sói.',
    unique: false,
  },
  werewolf: {
    id: 'werewolf',
    name: 'Ma Sói',
    englishName: 'Werewolf',
    team: 'werewolves',
    balance: -6,
    image: '/werewolf/cards/werewolf.svg',
    summary: 'Mỗi đêm cùng bầy Sói chọn một người ngoài bầy để cắn.',
    unique: false,
  },
  alpha_wolf: {
    id: 'alpha_wolf',
    name: 'Sói Trùm',
    englishName: 'Alpha Wolf',
    team: 'werewolves',
    balance: -9,
    image: '/werewolf/cards/alpha_wolf.svg',
    summary: 'Đi cắn cùng bầy Sói. Một lần cả ván có thể biến nạn nhân thành Ma Sói thay vì giết.',
    unique: true,
  },
  minion: {
    id: 'minion',
    name: 'Tay Sai',
    englishName: 'Minion',
    team: 'werewolves',
    balance: -6,
    image: '/werewolf/cards/minion.svg',
    summary: 'Thuộc phe Sói, biết ai là Ma Sói nhưng Sói không biết bạn. Tiên Tri soi ra không phải Sói.',
    unique: true,
  },
  sorcerer: {
    id: 'sorcerer',
    name: 'Pháp Sư Hắc Ám',
    englishName: 'Sorcerer',
    team: 'werewolves',
    balance: -3,
    image: '/werewolf/cards/sorcerer.svg',
    summary: 'Thuộc phe Sói. Mỗi đêm soi 1 người để tìm Tiên Tri.',
    unique: true,
  },
  seer: {
    id: 'seer',
    name: 'Tiên Tri',
    englishName: 'Seer',
    team: 'village',
    balance: 7,
    image: '/werewolf/cards/seer.svg',
    summary: 'Mỗi đêm soi 1 người để biết người đó có thuộc bầy Sói hay không.',
    unique: true,
  },
  bodyguard: {
    id: 'bodyguard',
    name: 'Bảo Vệ',
    englishName: 'Bodyguard',
    team: 'village',
    balance: 3,
    image: '/werewolf/cards/bodyguard.svg',
    summary: 'Mỗi đêm bảo vệ 1 người khỏi nanh Sói. Không được bảo vệ cùng 1 người 2 đêm liên tiếp.',
    unique: true,
  },
  witch: {
    id: 'witch',
    name: 'Phù Thủy',
    englishName: 'Witch',
    team: 'village',
    balance: 4,
    image: '/werewolf/cards/witch.svg',
    summary: 'Có 1 bình Cứu nạn nhân bị Sói cắn và 1 bình Độc giết 1 người bất kỳ (mỗi bình dùng 1 lần).',
    unique: true,
  },
  hunter: {
    id: 'hunter',
    name: 'Thợ Săn',
    englishName: 'Hunter',
    team: 'village',
    balance: 3,
    image: '/werewolf/cards/hunter.svg',
    summary: 'Khi bị loại, lập tức kéo theo 1 người chơi còn sống chết cùng.',
    unique: true,
  },
  cupid: {
    id: 'cupid',
    name: 'Thần Tình Yêu',
    englishName: 'Cupid',
    team: 'village',
    balance: -3,
    image: '/werewolf/cards/cupid.svg',
    summary: 'Đêm đầu tiên ghép đôi 2 người thành Tình Nhân. Một người chết, người kia chết theo.',
    unique: true,
  },
  lycan: {
    id: 'lycan',
    name: 'Người Hóa Sói',
    englishName: 'Lycan',
    team: 'village',
    balance: -1,
    image: '/werewolf/cards/lycan.svg',
    summary: 'Thuộc phe Dân Làng, nhưng bị Tiên Tri soi nhầm là Ma Sói.',
    unique: true,
  },
  cursed: {
    id: 'cursed',
    name: 'Kẻ Bị Nguyền',
    englishName: 'Cursed',
    team: 'village',
    balance: -3,
    image: '/werewolf/cards/cursed.svg',
    summary: 'Ban đầu thuộc phe Dân Làng; nếu bị Ma Sói cắn không ai cứu sẽ hóa thành Ma Sói.',
    unique: true,
  },
  diseased: {
    id: 'diseased',
    name: 'Người Bệnh',
    englishName: 'Diseased',
    team: 'village',
    balance: 3,
    image: '/werewolf/cards/diseased.svg',
    summary: 'Nếu bị Ma Sói cắn chết, bầy Sói bị nhiễm bệnh và mất lượt cắn đêm hôm sau.',
    unique: true,
  },
  prince: {
    id: 'prince',
    name: 'Hoàng Tử',
    englishName: 'Prince',
    team: 'village',
    balance: 3,
    image: '/werewolf/cards/prince.svg',
    summary: 'Nếu bị làng treo cổ ban ngày, lật bài miễn chết 1 lần và ngày kết thúc ngay.',
    unique: true,
  },
  mayor: {
    id: 'mayor',
    name: 'Thị Trưởng',
    englishName: 'Mayor',
    team: 'village',
    balance: 2,
    image: '/werewolf/cards/mayor.svg',
    summary: 'Lá phiếu treo cổ ban ngày của Thị Trưởng được tính là 2 phiếu.',
    unique: true,
  },
  tanner: {
    id: 'tanner',
    name: 'Kẻ Chán Đời',
    englishName: 'Tanner',
    team: 'tanner',
    balance: -2,
    image: '/werewolf/cards/tanner.svg',
    summary: 'Phe độc lập. Thắng một mình ngay lập tức nếu bị làng treo cổ ban ngày!',
    unique: true,
  },
};

export function emptyRoleDeck(): WerewolfRoleDeck {
  return {
    villager: 0,
    werewolf: 0,
    alpha_wolf: 0,
    minion: 0,
    sorcerer: 0,
    seer: 0,
    bodyguard: 0,
    witch: 0,
    hunter: 0,
    cupid: 0,
    lycan: 0,
    cursed: 0,
    diseased: 0,
    prince: 0,
    mayor: 0,
    tanner: 0,
  };
}

export function standardRoleDeck(players: number): WerewolfRoleDeck {
  const deck = emptyRoleDeck();
  if (players <= 5) {
    deck.werewolf = 1; deck.seer = 1; deck.bodyguard = 1; deck.villager = 2;
  } else if (players === 6) {
    deck.werewolf = 1; deck.seer = 1; deck.bodyguard = 1; deck.witch = 1; deck.villager = 2;
  } else if (players === 7) {
    deck.werewolf = 2; deck.seer = 1; deck.bodyguard = 1; deck.witch = 1; deck.hunter = 1; deck.villager = 1;
  } else if (players === 8) {
    deck.werewolf = 2; deck.seer = 1; deck.bodyguard = 1; deck.witch = 1; deck.hunter = 1; deck.cupid = 1; deck.villager = 1;
  } else if (players === 9) {
    deck.werewolf = 2; deck.seer = 1; deck.bodyguard = 1; deck.witch = 1; deck.hunter = 1; deck.cupid = 1; deck.tanner = 1; deck.villager = 1;
  } else if (players === 10) {
    deck.werewolf = 2; deck.minion = 1; deck.seer = 1; deck.bodyguard = 1; deck.witch = 1; deck.hunter = 1; deck.cupid = 1; deck.mayor = 1; deck.villager = 1;
  } else if (players === 11) {
    deck.werewolf = 2; deck.minion = 1; deck.seer = 1; deck.bodyguard = 1; deck.witch = 1; deck.hunter = 1; deck.cupid = 1; deck.prince = 1; deck.lycan = 1; deck.villager = 1;
  } else if (players === 12) {
    deck.werewolf = 2; deck.alpha_wolf = 1; deck.sorcerer = 1; deck.seer = 1; deck.bodyguard = 1; deck.witch = 1; deck.hunter = 1; deck.cupid = 1; deck.diseased = 1; deck.prince = 1; deck.villager = 1;
  } else if (players === 13) {
    deck.werewolf = 2; deck.alpha_wolf = 1; deck.sorcerer = 1; deck.seer = 1; deck.bodyguard = 1; deck.witch = 1; deck.hunter = 1; deck.cupid = 1; deck.diseased = 1; deck.prince = 1; deck.cursed = 1; deck.tanner = 1;
  } else if (players === 14) {
    deck.werewolf = 3; deck.alpha_wolf = 1; deck.sorcerer = 1; deck.seer = 1; deck.bodyguard = 1; deck.witch = 1; deck.hunter = 1; deck.cupid = 1; deck.diseased = 1; deck.prince = 1; deck.cursed = 1; deck.mayor = 1;
  } else if (players === 15) {
    deck.werewolf = 2; deck.alpha_wolf = 1; deck.minion = 1; deck.sorcerer = 1; deck.seer = 1; deck.bodyguard = 1; deck.witch = 1; deck.hunter = 1; deck.cupid = 1; deck.diseased = 1; deck.prince = 1; deck.cursed = 1; deck.mayor = 1; deck.lycan = 1;
  } else {
    deck.werewolf = 2; deck.alpha_wolf = 1; deck.minion = 1; deck.sorcerer = 1; deck.seer = 1; deck.bodyguard = 1; deck.witch = 1; deck.hunter = 1; deck.cupid = 1; deck.diseased = 1; deck.prince = 1; deck.cursed = 1; deck.mayor = 1; deck.lycan = 1; deck.tanner = 1;
  }
  return deck;
}

export function deckTotal(deck: WerewolfRoleDeck): number {
  return ROLE_ORDER.reduce((sum, id) => sum + (Number.isFinite(deck[id]) ? deck[id] : 0), 0);
}

export function deckBalance(deck: WerewolfRoleDeck): number {
  return ROLE_ORDER.reduce((sum, id) => sum + (Number.isFinite(deck[id]) ? deck[id] * ROLES[id].balance : 0), 0);
}

export function deckError(deck: WerewolfRoleDeck, players: number): string | null {
  for (const id of ROLE_ORDER) {
    const count = deck[id];
    if (!Number.isInteger(count) || count < 0) return 'Số lượng vai phải là số nguyên không âm.';
    if (ROLES[id].unique && count > 1) return `${ROLES[id].name} tối đa 1 lá.`;
  }
  const total = deckTotal(deck);
  if (total !== players) return `Tổng số vai (${total}) phải bằng số người chơi (${players}).`;
  const wolves = deck.werewolf + deck.alpha_wolf;
  if (wolves === 0) return 'Cần ít nhất 1 Ma Sói hoặc Sói Trùm.';
  if (wolves * 2 >= players) return 'Số Sói cắn đêm phải ít hơn một nửa số người chơi.';
  return null;
}

export function teamLabel(team: WerewolfTeam): string {
  switch (team) {
    case 'village': return 'Phe Dân Làng';
    case 'werewolves': return 'Phe Ma Sói';
    case 'lovers': return 'Phe Tình Nhân';
    case 'tanner': return 'Phe Độc Lập';
  }
}

export function balanceLabel(score: number): string {
  if (score === 0) return '0 (Cân bằng tuyệt đối)';
  const sign = score > 0 ? `+${score}` : `${score}`;
  if (score >= -2 && score <= 2) return `${sign} (Cân bằng)`;
  if (score > 2) return `${sign} (Nghiêng về Dân Làng)`;
  return `${sign} (Nghiêng về Ma Sói)`;
}
