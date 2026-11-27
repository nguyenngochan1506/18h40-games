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
    "effect": "Viền xanh lá. Bỏ để rút 1 lá (dùng chủ động từ lượt sau của bạn), hoặc để đỡ như Missed! rồi rút 1 lá (từ lượt của người kế tiếp)"
  },
  "canteen": {
    "name": "Canteen",
    "effect": "Viền xanh lá. Từ lượt sau của bạn, bỏ để hồi 1 máu (không dùng ngoài lượt để cứu mạng)"
  },
  "can_can": {
    "name": "Can Can",
    "effect": "Viền xanh lá. Từ lượt sau của bạn, bỏ để buộc bất kỳ người nào bỏ 1 lá, từ tay (chọn mù theo ô) hoặc trước mặt"
  },
  "ten_gallon_hat": {
    "name": "Ten Gallon Hat",
    "effect": "Viền xanh lá. Từ lượt của người kế tiếp, bỏ để đỡ như Missed!. Không dùng chủ động trong lượt"
  },
  "conestoga": {
    "name": "Conestoga",
    "effect": "Viền xanh lá. Từ lượt sau của bạn, bỏ để lấy 1 lá từ tay (chọn mù theo ô) hoặc trước mặt bất kỳ người nào, không giới hạn khoảng cách"
  },
  "derringer": {
    "name": "Derringer",
    "effect": "Viền xanh lá. Từ lượt sau của bạn, bỏ để rút 1 lá rồi BANG! vào người ở khoảng cách 1 (tính cả Scope/Mustang); lá được rút trước khi người bị bắn đáp. Không tính giới hạn BANG!"
  },
  "buffalo_rifle": {
    "name": "Buffalo Rifle",
    "effect": "Viền xanh lá. Từ lượt sau của bạn, bỏ để BANG! vào một người chơi khác, không giới hạn tầm. Không tính giới hạn BANG!"
  },
  "howitzer": {
    "name": "Howitzer",
    "effect": "Viền xanh lá. Từ lượt sau của bạn, bỏ để BANG! vào mọi người chơi khác như Gatling, không giới hạn tầm. Không tính giới hạn BANG!"
  },
  "pepperbox": {
    "name": "Pepperbox",
    "effect": "Viền xanh lá. Từ lượt sau của bạn, bỏ để BANG! vào người trong tầm vũ khí đang trang bị. Không tính giới hạn BANG!"
  },
  "iron_plate": {
    "name": "Iron Plate",
    "effect": "Viền xanh lá. Từ lượt của người kế tiếp, bỏ để đỡ như Missed!. Không dùng chủ động trong lượt"
  },
  "pony_express": {
    "name": "Pony Express",
    "effect": "Viền xanh lá. Từ lượt sau của bạn, bỏ để rút 3 lá"
  },
  "knife": {
    "name": "Knife",
    "effect": "Viền xanh lá. Từ lượt sau của bạn, bỏ để BANG! vào người ở khoảng cách 1 (tính cả Scope/Mustang). Không tính giới hạn BANG!"
  },
  "sombrero": {
    "name": "Sombrero",
    "effect": "Viền xanh lá. Từ lượt của người kế tiếp, bỏ để đỡ như Missed!. Không dùng chủ động trong lượt"
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
    "ability": "Không bị ảnh hưởng bởi lá ♦ của người khác (trừ trong Duel). Không chặn Missed! ♦ của người khác đỡ BANG! của anh"
  },
  "belle_star": {
    "name": "Belle Star",
    "ability": "Trong lượt của cô, mọi lá trước mặt người khác (xanh dương và xanh lá) mất hiệu lực; khả năng nhân vật vẫn hoạt động"
  },
  "bill_noface": {
    "name": "Bill Noface",
    "ability": "Rút 1 lá, thêm 1 lá cho mỗi máu đã mất"
  },
  "chuck_wengam": {
    "name": "Chuck Wengam",
    "ability": "Trong lượt, mất 1 máu để rút 2 lá; dùng nhiều lần nhưng không được dùng máu cuối"
  },
  "doc_holyday": {
    "name": "Doc Holyday",
    "ability": "Mỗi lượt 1 lần, bỏ 2 lá trên tay để BANG! vào người trong tầm vũ khí; không tính giới hạn BANG!. Muốn trúng Apache Kid, ít nhất 1 trong 2 lá không phải ♦"
  },
  "elena_fuente": {
    "name": "Elena Fuente",
    "ability": "Dùng bất kỳ lá nào trên tay như Missed!, chỉ khi phải đáp Missed! (không dùng trong Duel hay Indians!)"
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
    "ability": "Mỗi lượt tối đa 2 lần, bỏ 1 lá xanh dương (trang bị không viền xanh lá) trên tay để rút 2 lá"
  },
  "molly_stark": {
    "name": "Molly Stark",
    "ability": "Mỗi lần tự nguyện chơi hoặc bỏ Missed!, Beer, BANG! ngoài lượt của mình, rút 1 lá. Duel: rút sau khi Duel kết thúc, mỗi BANG! đã bỏ 1 lá. Bị ép bỏ hay lá xanh lá không tính"
  },
  "pat_brennan": {
    "name": "Pat Brennan",
    "ability": "Khi rút bài, có thể lấy đúng 1 lá trước mặt bất kỳ người nào thay vì rút 2"
  },
  "pixie_pete": {
    "name": "Pixie Pete",
    "ability": "Rút 3 lá thay vì 2"
  },
  "sean_mallory": {
    "name": "Sean Mallory",
    "ability": "Cuối lượt được giữ tối đa 10 lá trên tay, bất kể máu"
  },
  "tequila_joe": {
    "name": "Tequila Joe",
    "ability": "Beer hồi 2 máu (cả khi cứu mạng); các lá hồi máu khác vẫn hồi 1"
  },
  "vera_custer": {
    "name": "Vera Custer",
    "ability": "Đầu lượt, trước khi rút, chọn một người chơi khác còn sống và có khả năng nhân vật của họ cho đến khi chọn lại ở lượt sau (mất ngay nếu cô bị Jail làm mất lượt)"
  }
} satisfies Record<Character, { name: string, ability: string }>;
