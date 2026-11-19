import type { BangRole, CardKind, Character } from '../../generated/protocol.ts';

export const roles = {
  "sheriff": {
    "name": "Cảnh sát trưởng",
    "description": "Lộ vai từ đầu. Thắng khi mọi Tội phạm và Kẻ phản bội bị loại"
  },
  "deputy": {
    "name": "Phó cảnh sát",
    "description": "Giúp Cảnh sát trưởng, cùng phe thắng"
  },
  "outlaw": {
    "name": "Tội phạm",
    "description": "Muốn hạ Cảnh sát trưởng"
  },
  "renegade": {
    "name": "Kẻ phản bội",
    "description": "Muốn là người sống sót cuối cùng sau khi Cảnh sát trưởng bị loại"
  }
} satisfies Record<BangRole, { name: string, description: string }>;

export const cards = {
  "bang": {
    "name": "BANG!",
    "effect": "Bắn một người trong tầm. Họ phải đỡ bằng Missed! nếu không mất 1 máu. Mỗi lượt chỉ 1 lá"
  },
  "missed": {
    "name": "Missed!",
    "effect": "Hủy một phát bắn nhắm vào bạn. Dùng được ngoài lượt"
  },
  "beer": {
    "name": "Beer",
    "effect": "Hồi 1 máu. Không có tác dụng khi chỉ còn 2 người"
  },
  "panic": {
    "name": "Panic!",
    "effect": "Lấy 1 lá từ người ở khoảng cách tối đa 1"
  },
  "cat_balou": {
    "name": "Cat Balou",
    "effect": "Buộc một người bỏ 1 lá, không giới hạn khoảng cách"
  },
  "duel": {
    "name": "Duel",
    "effect": "Thách một người. Hai bên luân phiên bỏ BANG!, ai không bỏ được mất 1 máu"
  },
  "indians": {
    "name": "Indians!",
    "effect": "Mỗi người khác bỏ 1 BANG! hoặc mất 1 máu"
  },
  "general_store": {
    "name": "General Store",
    "effect": "Xáo úp theo người sống; chọn mù, bạn trước"
  },
  "gatling": {
    "name": "Gatling",
    "effect": "Bắn mọi người khác, không giới hạn khoảng cách. Không tính là lá BANG!"
  },
  "saloon": {
    "name": "Saloon",
    "effect": "Mọi người còn sống hồi 1 máu"
  },
  "stagecoach": {
    "name": "Stagecoach",
    "effect": "Rút 2 lá"
  },
  "wells_fargo": {
    "name": "Wells Fargo",
    "effect": "Rút 3 lá"
  },
  "barrel": {
    "name": "Barrel",
    "effect": "Khi bị bắn, bạn có thể bấm lật 1 lá: ♥ thì coi như đã Missed!"
  },
  "dynamite": {
    "name": "Dynamite",
    "effect": "Đầu lượt, bấm lật 1 lá: ♠ từ 2 đến 9 thì nổ, mất 3 máu. Không thì chuyền cho người kế"
  },
  "jail": {
    "name": "Jail",
    "effect": "Đặt lên người khác (không phải Cảnh sát trưởng). Đầu lượt họ bấm lật 1 lá: ♥ thì thoát, không thì mất lượt"
  },
  "mustang": {
    "name": "Mustang",
    "effect": "Người khác nhìn tới bạn xa thêm 1"
  },
  "scope": {
    "name": "Scope",
    "effect": "Bạn nhìn tới người khác gần hơn 1"
  },
  "volcanic": {
    "name": "Volcanic",
    "effect": "Tầm 1. Bắn BANG! không giới hạn số lá mỗi lượt"
  },
  "schofield": {
    "name": "Schofield",
    "effect": "Tầm 2"
  },
  "remington": {
    "name": "Remington",
    "effect": "Tầm 3"
  },
  "rev_carabine": {
    "name": "Rev. Carabine",
    "effect": "Tầm 4"
  },
  "winchester": {
    "name": "Winchester",
    "effect": "Tầm 5"
  }
} satisfies Record<CardKind, { name: string, effect: string }>;

export const characters = {
  "bart_cassidy": {
    "name": "Bart Cassidy",
    "ability": "Mỗi lần mất 1 máu, rút 1 lá"
  },
  "black_jack": {
    "name": "Black Jack",
    "ability": "Khi rút bài, lật lá thứ hai cho mọi người thấy. Nếu là ♥ hoặc ♦ thì rút thêm 1 lá"
  },
  "calamity_janet": {
    "name": "Calamity Janet",
    "ability": "Dùng BANG! như Missed! và ngược lại"
  },
  "el_gringo": {
    "name": "El Gringo",
    "ability": "Mỗi lần mất 1 máu do lá của người khác, lấy ngẫu nhiên 1 lá trên tay người đó. Dynamite không tính"
  },
  "jesse_jones": {
    "name": "Jesse Jones",
    "ability": "Khi rút bài, lá đầu có thể lấy ngẫu nhiên từ tay một người khác. Lá hai lấy từ bộ rút"
  },
  "jourdonnais": {
    "name": "Jourdonnais",
    "ability": "Có thể bấm lật kiểm tra như Barrel. Có thêm Barrel thật thì được lật thêm một lần"
  },
  "kit_carlson": {
    "name": "Kit Carlson",
    "ability": "Khi rút bài, xem 3 lá trên cùng, giữ 2, úp lá còn lại lên đỉnh bộ rút"
  },
  "lucky_duke": {
    "name": "Lucky Duke",
    "ability": "Bấm lật 2 lá khi kiểm tra, rồi chọn kết quả mình muốn"
  },
  "paul_regret": {
    "name": "Paul Regret",
    "ability": "Luôn có tác dụng như Mustang"
  },
  "pedro_ramirez": {
    "name": "Pedro Ramirez",
    "ability": "Khi rút bài, lá đầu có thể lấy từ đỉnh chồng bỏ. Lá hai lấy từ bộ rút"
  },
  "rose_doolan": {
    "name": "Rose Doolan",
    "ability": "Luôn có tác dụng như Scope"
  },
  "sid_ketchum": {
    "name": "Sid Ketchum",
    "ability": "Bất cứ lúc nào, bỏ 2 lá trên tay để hồi 1 máu"
  },
  "slab_the_killer": {
    "name": "Slab the Killer",
    "ability": "BANG! của bạn cần 2 lá Missed! mới đỡ được (không áp dụng cho Gatling)"
  },
  "suzy_lafayette": {
    "name": "Suzy Lafayette",
    "ability": "Ngay khi hết bài trên tay, rút 1 lá"
  },
  "vulture_sam": {
    "name": "Vulture Sam",
    "ability": "Khi người khác bị loại, nhận toàn bộ bài trên tay và trước mặt họ"
  },
  "willy_the_kid": {
    "name": "Willy the Kid",
    "ability": "Bắn BANG! không giới hạn số lá mỗi lượt"
  }
} satisfies Record<Character, { name: string, ability: string }>;
