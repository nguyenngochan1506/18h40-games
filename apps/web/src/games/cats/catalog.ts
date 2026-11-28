import type { CatsCardKind, CatsSettings } from '../../generated/protocol.ts';

export type ExpansionId = 'base' | 'imploding' | 'streaking' | 'barking';

export type CardMeta = {
  name: string;
  effect: string;
  expansion: ExpansionId;
  image: string;
  playableSingle: boolean;
  comboCat: boolean;
};

export const cardBackUrl = '/cats/cards/card_back.png';

export const expansionLabels: Record<ExpansionId, string> = {
  base: 'Bản gốc',
  imploding: 'Imploding Kittens',
  streaking: 'Streaking Kittens',
  barking: 'Barking Kittens',
};

export const cardCatalog: Record<CatsCardKind, CardMeta> = {
  exploding: {
    name: 'Mèo Nổ',
    effect: 'Rút phải sẽ nổ ngay trừ khi bạn có Gỡ Bom (hoặc Mèo Chạy Rông bảo vệ).',
    expansion: 'base',
    image: '/cats/cards/exploding.jpg',
    playableSingle: false,
    comboCat: false,
  },
  defuse: {
    name: 'Gỡ Bom',
    effect: 'Tự động kích hoạt khi rút Mèo Nổ để vô hiệu hóa và nhét lại Mèo Nổ vào bộ rút.',
    expansion: 'base',
    image: '/cats/cards/defuse.jpg',
    playableSingle: false,
    comboCat: false,
  },
  nope: {
    name: 'Không! (Nope)',
    effect: 'Chặn đứng hành động vừa đánh (kể cả ngoài lượt). Có thể dùng Không! để chặn lại Không!.',
    expansion: 'base',
    image: '/cats/cards/nope.jpg',
    playableSingle: false,
    comboCat: false,
  },
  attack: {
    name: 'Tấn Công',
    effect: 'Kết thúc lượt không cần rút bài; người kế tiếp phải đi cộng dồn thêm 2 lượt.',
    expansion: 'base',
    image: '/cats/cards/attack.jpg',
    playableSingle: true,
    comboCat: false,
  },
  skip: {
    name: 'Bỏ Lượt',
    effect: 'Kết thúc ngay 1 lượt hiện tại mà không cần rút bài.',
    expansion: 'base',
    image: '/cats/cards/skip.jpg',
    playableSingle: true,
    comboCat: false,
  },
  shuffle: {
    name: 'Xáo Bài',
    effect: 'Xáo trộn toàn bộ bộ bài rút.',
    expansion: 'base',
    image: '/cats/cards/shuffle.jpg',
    playableSingle: true,
    comboCat: false,
  },
  see_future: {
    name: 'Nhìn Tương Lai 3x',
    effect: 'Xem bí mật 3 lá trên cùng của bộ bài rút.',
    expansion: 'base',
    image: '/cats/cards/see_future.jpg',
    playableSingle: true,
    comboCat: false,
  },
  favour: {
    name: 'Xin Bài',
    effect: 'Chọn 1 người chơi khác; họ bắt buộc chọn 1 lá trên tay để đưa cho bạn.',
    expansion: 'base',
    image: '/cats/cards/favour.jpg',
    playableSingle: true,
    comboCat: false,
  },
  cat_taco: {
    name: 'Mèo Taco',
    effect: 'Lá Mèo dùng ghép combo: 2 lá cướp ngẫu nhiên, 3 lá gọi tên lá, 5 lá khác loại lấy từ chồng bỏ.',
    expansion: 'base',
    image: '/cats/cards/cat_taco.jpg',
    playableSingle: false,
    comboCat: true,
  },
  cat_rainbow: {
    name: 'Mèo Cầu Vồng',
    effect: 'Lá Mèo dùng ghép combo: 2 lá cướp ngẫu nhiên, 3 lá gọi tên lá, 5 lá khác loại lấy từ chồng bỏ.',
    expansion: 'base',
    image: '/cats/cards/cat_rainbow.jpg',
    playableSingle: false,
    comboCat: true,
  },
  cat_beard: {
    name: 'Mèo Râu',
    effect: 'Lá Mèo dùng ghép combo: 2 lá cướp ngẫu nhiên, 3 lá gọi tên lá, 5 lá khác loại lấy từ chồng bỏ.',
    expansion: 'base',
    image: '/cats/cards/cat_beard.jpg',
    playableSingle: false,
    comboCat: true,
  },
  cat_potato: {
    name: 'Mèo Khoai Tây',
    effect: 'Lá Mèo dùng ghép combo: 2 lá cướp ngẫu nhiên, 3 lá gọi tên lá, 5 lá khác loại lấy từ chồng bỏ.',
    expansion: 'base',
    image: '/cats/cards/cat_potato.jpg',
    playableSingle: false,
    comboCat: true,
  },
  cat_cattermelon: {
    name: 'Mèo Dưa Hấu',
    effect: 'Lá Mèo dùng ghép combo: 2 lá cướp ngẫu nhiên, 3 lá gọi tên lá, 5 lá khác loại lấy từ chồng bỏ.',
    expansion: 'base',
    image: '/cats/cards/cat_cattermelon.jpg',
    playableSingle: false,
    comboCat: true,
  },
  imploding: {
    name: 'Mèo Sập (Imploding)',
    effect: 'Lần đầu rút sẽ lật ngửa và nhét lại vào bộ rút. Lần sau rút khi đang ngửa sẽ nổ ngay, KHÔNG thể Gỡ Bom!',
    expansion: 'imploding',
    image: '/cats/cards/imploding.jpg',
    playableSingle: false,
    comboCat: false,
  },
  reverse: {
    name: 'Đảo Chiều',
    effect: 'Đảo ngược chiều vòng chơi và kết thúc 1 lượt mà không cần rút bài.',
    expansion: 'imploding',
    image: '/cats/cards/reverse.jpg',
    playableSingle: true,
    comboCat: false,
  },
  draw_bottom: {
    name: 'Rút Đáy',
    effect: 'Kết thúc lượt bằng cách rút lá dưới cùng của bộ rút thay vì lá đỉnh.',
    expansion: 'imploding',
    image: '/cats/cards/draw_bottom.jpg',
    playableSingle: true,
    comboCat: false,
  },
  feral_cat: {
    name: 'Mèo Hoang (Wild)',
    effect: 'Lá Mèo đa năng: thay thế được cho bất kỳ loại Mèo thường nào khi ghép combo 2, 3 hoặc 5 lá.',
    expansion: 'imploding',
    image: '/cats/cards/feral_cat.jpg',
    playableSingle: false,
    comboCat: true,
  },
  alter_future: {
    name: 'Đổi Tương Lai 3x',
    effect: 'Xem bí mật và sắp xếp lại thứ tự 3 lá trên cùng của bộ rút.',
    expansion: 'imploding',
    image: '/cats/cards/alter_future.jpg',
    playableSingle: true,
    comboCat: false,
  },
  targeted_attack: {
    name: 'Tấn Công Chỉ Định',
    effect: 'Chọn bất kỳ người chơi nào để chuyển lượt và cộng dồn thêm 2 lượt rút cho họ.',
    expansion: 'imploding',
    image: '/cats/cards/targeted_attack.jpg',
    playableSingle: true,
    comboCat: false,
  },
  streaking: {
    name: 'Mèo Chạy Rông',
    effect: 'Hiệu ứng thụ động: cho phép giữ bí mật tối đa 1 lá Mèo Nổ trên tay mà không bị nổ.',
    expansion: 'streaking',
    image: '/cats/cards/streaking.jpg',
    playableSingle: false,
    comboCat: false,
  },
  super_skip: {
    name: 'Siêu Bỏ Lượt',
    effect: 'Kết thúc TOÀN BỘ số lượt đang bị cộng dồn ngay lập tức mà không cần rút bài.',
    expansion: 'streaking',
    image: '/cats/cards/super_skip.jpg',
    playableSingle: true,
    comboCat: false,
  },
  see_future5: {
    name: 'Nhìn Tương Lai 5x',
    effect: 'Xem bí mật 5 lá trên cùng của bộ bài rút.',
    expansion: 'streaking',
    image: '/cats/cards/see_future_5.jpg',
    playableSingle: true,
    comboCat: false,
  },
  swap_top_bottom: {
    name: 'Đổi Đầu Đuôi',
    effect: 'Hoán đổi lá trên cùng và lá dưới cùng của bộ rút mà không xem.',
    expansion: 'streaking',
    image: '/cats/cards/swap_top_bottom.jpg',
    playableSingle: true,
    comboCat: false,
  },
  garbage_collection: {
    name: 'Thu Gom Rác',
    effect: 'Mỗi người chơi còn sống chọn 1 lá trên tay bỏ lại vào bộ rút, sau đó xáo toàn bộ rút.',
    expansion: 'streaking',
    image: '/cats/cards/garbage_collection.jpg',
    playableSingle: true,
    comboCat: false,
  },
  catomic_bomb: {
    name: 'Bom Nguyên Tử Mèo',
    effect: 'Kéo toàn bộ Mèo Nổ ra, xáo phần còn lại rồi đặt tất cả Mèo Nổ ngửa lên đỉnh bộ rút và kết thúc lượt.',
    expansion: 'streaking',
    image: '/cats/cards/catomic_bomb.jpg',
    playableSingle: true,
    comboCat: false,
  },
  alter_future5: {
    name: 'Đổi Tương Lai 5x',
    effect: 'Xem bí mật và sắp xếp lại thứ tự 5 lá trên cùng của bộ rút.',
    expansion: 'streaking',
    image: '/cats/cards/alter_future_5.jpg',
    playableSingle: true,
    comboCat: false,
  },
  mark: {
    name: 'Đánh Dấu',
    effect: 'Chọn 1 đối thủ; lật ngửa ngẫu nhiên 1 lá trên tay họ cho cả bàn cùng thấy cho đến khi lá đó rời tay.',
    expansion: 'streaking',
    image: '/cats/cards/mark.jpg',
    playableSingle: true,
    comboCat: false,
  },
  curse_cat_butt: {
    name: 'Lời Nguyền Mông Mèo',
    effect: 'Nguyền 1 đối thủ phải úp và xáo tay bài (chơi mù) cho đến khi họ rút thành công 1 lá bài.',
    expansion: 'streaking',
    image: '/cats/cards/curse_cat_butt.jpg',
    playableSingle: true,
    comboCat: false,
  },
  personal_attack: {
    name: 'Tự Tấn Công',
    effect: 'Tự cộng thêm 2 lượt liên tiếp cho chính mình (tổng 3 lượt nếu đang có 1 lượt).',
    expansion: 'barking',
    image: '/cats/cards/personal_attack.jpg',
    playableSingle: true,
    comboCat: false,
  },
  share_future: {
    name: 'Chia Sẻ Tương Lai',
    effect: 'Xem và sắp xếp lại 3 lá trên cùng, sau đó cho người chơi kế tiếp cùng xem thứ tự mới.',
    expansion: 'barking',
    image: '/cats/cards/share_future.jpg',
    playableSingle: true,
    comboCat: false,
  },
  bury: {
    name: 'Chôn Bài',
    effect: 'Rút lá đỉnh xem bí mật rồi chôn lại vào bất kỳ vị trí nào trong bộ rút và kết thúc lượt.',
    expansion: 'barking',
    image: '/cats/cards/bury.jpg',
    playableSingle: true,
    comboCat: false,
  },
  potluck: {
    name: 'Góp Tiệc',
    effect: 'Lần lượt mỗi người chơi đặt 1 lá trên tay lên đỉnh bộ rút theo chiều vòng chơi.',
    expansion: 'barking',
    image: '/cats/cards/potluck.jpg',
    playableSingle: true,
    comboCat: false,
  },
  barking_kitten: {
    name: 'Mèo Sủa',
    effect: 'Không thể Nope! Đặt ngửa trước mặt; nếu người khác có lá Mèo Sủa thứ hai thì họ buộc phải Gỡ Bom hoặc nổ ngay (cầm cả 2 lá được chọn mục tiêu bất kỳ).',
    expansion: 'barking',
    image: '/cats/cards/barking_kitten.jpg',
    playableSingle: true,
    comboCat: false,
  },
  ill_take_that: {
    name: 'Tớ Lấy Nhé',
    effect: 'Đặt trước mặt 1 đối thủ; lá kế tiếp họ rút từ bộ rút sẽ thuộc về bạn (nếu là Mèo Nổ thì bạn phải Gỡ Bom hoặc nổ!).',
    expansion: 'barking',
    image: '/cats/cards/ill_take_that.jpg',
    playableSingle: true,
    comboCat: false,
  },
  tower_of_power: {
    name: 'Tháp Quyền Lực',
    effect: 'Đội vương miện bảo vệ tay bài bằng kho Stash 6 lá úp; mọi lượt cướp bài nhắm vào bạn phải bốc mù từ Stash thay vì tay bạn.',
    expansion: 'barking',
    image: '/cats/cards/tower_of_power.jpg',
    playableSingle: true,
    comboCat: false,
  },
  alter_future_now: {
    name: 'Đổi Tương Lai NGAY',
    effect: 'Xem bí mật và sắp xếp lại 3 lá đỉnh bộ rút BẤT CỨ LÚC NÀO, kể cả ngoài lượt của bạn!',
    expansion: 'barking',
    image: '/cats/cards/alter_future_now.jpg',
    playableSingle: true,
    comboCat: false,
  },
};

export const stealableKinds = (Object.keys(cardCatalog) as CatsCardKind[]).filter(
  kind => kind !== 'exploding' && kind !== 'imploding',
);

export function activeExpansionNames(settings: CatsSettings): string[] {
  const list: string[] = [];
  if (settings.imploding) list.push('Imploding');
  if (settings.streaking) list.push('Streaking');
  if (settings.barking) list.push('Barking');
  return list;
}

export function canPlayComboPair(kinds: CatsCardKind[]): boolean {
  if (kinds.length !== 2 || !kinds.every(k => cardCatalog[k].comboCat)) return false;
  const nonWild = kinds.filter(k => k !== 'feral_cat');
  return nonWild.length <= 1 || nonWild[0] === nonWild[1];
}

export function canPlayComboTriple(kinds: CatsCardKind[]): boolean {
  if (kinds.length !== 3 || !kinds.every(k => cardCatalog[k].comboCat)) return false;
  const nonWild = kinds.filter(k => k !== 'feral_cat');
  return nonWild.every(k => k === nonWild[0]);
}

export function canPlayComboFive(kinds: CatsCardKind[]): boolean {
  if (kinds.length !== 5 || !kinds.every(k => cardCatalog[k].comboCat)) return false;
  const nonWild = kinds.filter(k => k !== 'feral_cat');
  return new Set(nonWild).size === nonWild.length;
}
