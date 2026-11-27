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
    "effect": "Lấy 1 lá từ người ở khoảng cách tối đa 1; chọn mù theo ô nếu lấy trên tay"
  },
  "cat_balou": {
    "name": "Cat Balou",
    "effect": "Buộc một người bỏ 1 lá, không giới hạn khoảng cách; chọn mù theo ô nếu bỏ từ tay"
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
  },
  "binocular": {
    "name": "Binocular",
    "effect": "Bạn nhìn tới người khác gần hơn 1"
  },
  "hideout": {
    "name": "Hideout",
    "effect": "Người khác nhìn tới bạn xa thêm 1"
  },
  "punch": {
    "name": "Punch",
    "effect": "BANG! vào người ở khoảng cách 1 (tính cả Scope/Mustang), không tính giới hạn BANG!"
  },
  "rag_time": {
    "name": "Rag Time",
    "effect": "Bỏ thêm 1 lá; lấy 1 lá từ tay (chọn mù) hoặc trước mặt bất kỳ người nào, không giới hạn khoảng cách"
  },
  "brawl": {
    "name": "Brawl",
    "effect": "Bỏ thêm 1 lá; mỗi người khác bỏ 1 lá do bạn chọn, từ tay hoặc trước mặt"
  },
  "dodge": {
    "name": "Dodge",
    "effect": "Dùng như Missed! khi bị bắn, rồi rút 1 lá; không đánh được trong lượt"
  },
  "springfield": {
    "name": "Springfield",
    "effect": "Bỏ thêm 1 lá; BANG! vào bất kỳ ai, không giới hạn tầm"
  },
  "tequila": {
    "name": "Tequila",
    "effect": "Bỏ thêm 1 lá; một người tùy chọn (kể cả bạn) hồi 1 máu"
  },
  "whisky": {
    "name": "Whisky",
    "effect": "Bỏ thêm 1 lá; hồi 2 máu"
  },
  "bible": {
    "name": "Bible",
    "effect": "Viền xanh lá, dùng từ lượt sau: bỏ để có Missed! và rút 1 lá"
  },
  "canteen": {
    "name": "Canteen",
    "effect": "Viền xanh lá, dùng từ lượt sau: bỏ để hồi 1 máu"
  },
  "can_can": {
    "name": "Can Can",
    "effect": "Viền xanh lá, dùng từ lượt sau: bỏ để bắt bất kỳ người nào bỏ 1 lá, từ tay hoặc trước mặt"
  },
  "ten_gallon_hat": {
    "name": "Ten Gallon Hat",
    "effect": "Viền xanh lá, dùng từ lượt sau: bỏ để có Missed!"
  },
  "conestoga": {
    "name": "Conestoga",
    "effect": "Viền xanh lá, dùng từ lượt sau: bỏ để lấy 1 lá từ tay hoặc trước mặt bất kỳ người nào"
  },
  "derringer": {
    "name": "Derringer",
    "effect": "Viền xanh lá, dùng từ lượt sau: bỏ để BANG! vào người ở khoảng cách 1 và rút 1 lá"
  },
  "buffalo_rifle": {
    "name": "Buffalo Rifle",
    "effect": "Viền xanh lá, dùng từ lượt sau: bỏ để BANG! vào bất kỳ ai, không giới hạn tầm"
  },
  "howitzer": {
    "name": "Howitzer",
    "effect": "Viền xanh lá, dùng từ lượt sau: bỏ để BANG! vào tất cả người chơi khác"
  },
  "pepperbox": {
    "name": "Pepperbox",
    "effect": "Viền xanh lá, dùng từ lượt sau: bỏ để BANG! vào người trong tầm vũ khí đang trang bị"
  },
  "iron_plate": {
    "name": "Iron Plate",
    "effect": "Viền xanh lá, dùng từ lượt sau: bỏ để có Missed!"
  },
  "pony_express": {
    "name": "Pony Express",
    "effect": "Viền xanh lá, dùng từ lượt sau: bỏ để rút 3 lá"
  },
  "knife": {
    "name": "Knife",
    "effect": "Viền xanh lá, dùng từ lượt sau: bỏ để BANG! vào người ở khoảng cách 1"
  },
  "sombrero": {
    "name": "Sombrero",
    "effect": "Viền xanh lá, dùng từ lượt sau: bỏ để có Missed!"
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
  },
  "apache_kid": {
    "name": "Apache Kid",
    "ability": "Không bị ảnh hưởng bởi lá ♦ của người khác (trừ trong Duel)"
  },
  "belle_star": {
    "name": "Belle Star",
    "ability": "Trong lượt của cô, mọi lá trước mặt người khác mất hiệu lực"
  },
  "bill_noface": {
    "name": "Bill Noface",
    "ability": "Rút 1 lá, thêm 1 lá cho mỗi máu đã mất"
  },
  "chuck_wengam": {
    "name": "Chuck Wengam",
    "ability": "Trong lượt, mất 1 máu để rút 2 lá (không dùng máu cuối)"
  },
  "doc_holyday": {
    "name": "Doc Holyday",
    "ability": "Mỗi lượt 1 lần, bỏ 2 lá trên tay để BANG! vào người trong tầm; không tính giới hạn BANG!"
  },
  "elena_fuente": {
    "name": "Elena Fuente",
    "ability": "Dùng bất kỳ lá nào trên tay như Missed!"
  },
  "greg_digger": {
    "name": "Greg Digger",
    "ability": "Mỗi khi người khác bị loại, hồi 2 máu"
  },
  "herb_hunter": {
    "name": "Herb Hunter",
    "ability": "Mỗi khi người khác bị loại, rút thêm 2 lá"
  },
  "jose_delgado": {
    "name": "Jose Delgado",
    "ability": "Bỏ 1 lá xanh dương trên tay để rút 2 lá, tối đa 2 lần mỗi lượt"
  },
  "molly_stark": {
    "name": "Molly Stark",
    "ability": "Mỗi lần tự nguyện chơi hoặc bỏ Missed!, Beer, BANG! ngoài lượt, rút 1 lá"
  },
  "pat_brennan": {
    "name": "Pat Brennan",
    "ability": "Khi rút bài, có thể lấy 1 lá trước mặt bất kỳ người nào thay vì rút 2"
  },
  "pixie_pete": {
    "name": "Pixie Pete",
    "ability": "Rút 3 lá thay vì 2"
  },
  "sean_mallory": {
    "name": "Sean Mallory",
    "ability": "Giữ tối đa 10 lá cuối lượt"
  },
  "tequila_joe": {
    "name": "Tequila Joe",
    "ability": "Beer hồi 2 máu"
  },
  "vera_custer": {
    "name": "Vera Custer",
    "ability": "Đầu lượt, chọn một người chơi khác và có khả năng nhân vật của họ đến lượt sau"
  }
} satisfies Record<Character, { name: string, ability: string }>;
