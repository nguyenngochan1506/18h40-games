import type {
  CatsCardView,
  CatsEventKind,
  CatsPlayedAction,
  CatsPlayerView,
  CatsSpectatorView,
  GameSeat,
  GameSnapshot,
  GameView,
} from '../../generated/protocol.ts';
import type { GameFrame } from '../../shared/gameSync.ts';
import { cardCatalog } from './catalog.ts';

export type CatsLogEntry = {
  id: number;
  text: string;
  tone: 'normal' | 'danger' | 'private' | 'winner';
};

export type CatsClientState = {
  game: GameSnapshot | null;
  log: CatsLogEntry[];
  futurePreview: CatsCardView[] | null;
  nextLogId: number;
};

export const initialCatsState: CatsClientState = {
  game: null,
  log: [],
  futurePreview: null,
  nextLogId: 1,
};

export type UnwrappedCatsView = {
  you: number | null;
  hand: CatsCardView[];
  previewCards: CatsCardView[];
  table: CatsSpectatorView;
};

export function selectCatsView(view: GameView): UnwrappedCatsView | null {
  if (view.game !== 'cats') return null;
  if (view.payload.perspective === 'player') {
    const own: CatsPlayerView = view.payload.view;
    return {
      you: own.you,
      hand: own.hand,
      previewCards: own.preview_cards,
      table: own.table,
    };
  }
  return {
    you: null,
    hand: [],
    previewCards: [],
    table: view.payload.view,
  };
}

export function describePlayedAction(played: CatsPlayedAction): string {
  switch (played.type) {
    case 'card':
      return cardCatalog[played.kind].name;
    case 'combo':
      return `Combo ${played.count} lá ${cardCatalog[played.kind].name}`;
    case 'five':
      return 'Combo 5 Mèo khác loại';
    case 'nope':
      return 'Không! (Nope)';
  }
}

function seatName(seats: readonly GameSeat[], playerId: number, you: number | null): string {
  const nick = seats.find(seat => seat.player_id === playerId)?.nickname ?? `Ghế ${playerId + 1}`;
  return playerId === you ? `${nick} (bạn)` : nick;
}

export function formatCatsEvent(
  event: CatsEventKind,
  seats: readonly GameSeat[],
  you: number | null,
): { text: string; tone: CatsLogEntry['tone'] } | null {
  const who = (id: number) => seatName(seats, id, you);
  switch (event.type) {
    case 'game_started':
      return { text: `Ván mới bắt đầu! ${who(event.starting_player)} đi trước.`, tone: 'normal' };
    case 'turn_started':
      return {
        text: `Đến lượt ${who(event.player)}${event.turns_left > 1 ? ` (${event.turns_left} lượt liên tiếp)` : ''}.`,
        tone: 'normal',
      };
    case 'direction_reversed':
      return {
        text: `Đảo chiều vòng chơi (${event.direction >= 0 ? 'xuôi chiều kim đồng hồ' : 'ngược chiều kim đồng hồ'}).`,
        tone: 'normal',
      };
    case 'card_played':
      return { text: `${who(event.player)} đánh ${cardCatalog[event.kind].name}.`, tone: 'normal' };
    case 'combo_played':
      return {
        text: `${who(event.player)} đánh bộ ${event.count} lá ${cardCatalog[event.kind].name}.`,
        tone: 'normal',
      };
    case 'five_played':
      return { text: `${who(event.player)} đánh bộ 5 Mèo khác loại để lấy bài từ chồng bỏ.`, tone: 'normal' };
    case 'target_chosen':
      return { text: `${who(event.actor)} nhắm vào ${who(event.target)}.`, tone: 'normal' };
    case 'cards_drawn':
      return { text: `${who(event.player)} rút ${event.count} lá bài.`, tone: 'normal' };
    case 'card_drawn':
      return {
        text: `Bạn vừa rút được: ${cardCatalog[event.card.kind].name}.`,
        tone: event.card.kind === 'exploding' ? 'danger' : 'private',
      };
    case 'deck_shuffled':
      return { text: `Bộ rút (${event.count} lá) đã được xáo lại.`, tone: 'normal' };
    case 'deck_reshuffled':
      return { text: `Chồng bỏ (${event.count} lá) được xáo lại thành bộ rút.`, tone: 'normal' };
    case 'deck_swapped':
      return { text: 'Lá đỉnh và lá đáy bộ rút đã đổi chỗ cho nhau.', tone: 'normal' };
    case 'deck_empty':
      return { text: 'Bộ rút đã hết bài.', tone: 'normal' };
    case 'future_seen':
      return {
        text: `Tương lai (${event.cards.length} lá kế): ${event.cards.map(c => cardCatalog[c.kind].name).join(' → ')}.`,
        tone: 'private',
      };
    case 'future_altered':
      return { text: `${who(event.player)} đã sắp xếp lại ${event.count} lá trên cùng.`, tone: 'normal' };
    case 'future_shared':
      return {
        text: `${who(event.actor)} đã chia sẻ thứ tự ${event.count} lá đỉnh với ${who(event.target)}.`,
        tone: 'normal',
      };
    case 'card_buried':
      return { text: `${who(event.player)} đã chôn 1 lá vào bộ rút.`, tone: 'normal' };
    case 'card_put_in_deck':
      return {
        text: `${who(event.player)} đặt 1 lá vào bộ rút${event.shuffled ? ' (Thu Gom Rác)' : ' (Góp Tiệc)'}.`,
        tone: 'normal',
      };
    case 'catomic_bomb_triggered':
      return {
        text: `${who(event.player)} kích hoạt Bom Nguyên Tử Mèo! ${event.exploding_count} Mèo Nổ lên đỉnh bộ rút!`,
        tone: 'danger',
      };
    case 'exploding_drawn':
      return { text: `💣 ${who(event.player)} rút phải Mèo Nổ!`, tone: 'danger' };
    case 'imploding_drawn':
      return {
        text: event.face_up
          ? `💥 ${who(event.player)} rút phải Mèo Sập đang ngửa — KHÔNG THỂ GỠ BOM!`
          : `⚠️ ${who(event.player)} rút phải Mèo Sập úp và lật ngửa nó!`,
        tone: 'danger',
      };
    case 'imploding_placed':
      return { text: `${who(event.player)} đã nhét Mèo Sập (ngửa) lại vào bộ rút.`, tone: 'danger' };
    case 'defused':
      return { text: `🛡️ ${who(event.player)} gỡ bom thành công và nhét Mèo Nổ lại vào bộ rút.`, tone: 'normal' };
    case 'player_eliminated':
      return { text: `💀 ${who(event.player)} đã nổ tung và bị loại!`, tone: 'danger' };
    case 'favour_asked':
      return { text: `${who(event.actor)} xin 1 lá bài từ ${who(event.target)}.`, tone: 'normal' };
    case 'favour_skipped':
      return { text: `${who(event.target)} không còn bài để đưa cho ${who(event.actor)}.`, tone: 'normal' };
    case 'favour_completed':
      return { text: `${who(event.target)} đã đưa 1 lá bài cho ${who(event.actor)}.`, tone: 'normal' };
    case 'card_received':
      return {
        text: `Bạn nhận được ${cardCatalog[event.card.kind].name} từ ${who(event.from)}.`,
        tone: 'private',
      };
    case 'card_given':
      return {
        text: `Bạn đã đưa ${cardCatalog[event.card.kind].name} cho ${who(event.to)}.`,
        tone: 'private',
      };
    case 'random_steal':
      return {
        text: event.found
          ? `${who(event.actor)} cướp ngẫu nhiên 1 lá từ ${who(event.target)}.`
          : `${who(event.target)} hết bài, ${who(event.actor)} không cướp được lá nào.`,
        tone: 'normal',
      };
    case 'named_steal':
      return {
        text: event.found
          ? `${who(event.actor)} gọi trúng ${cardCatalog[event.kind].name} và cướp từ ${who(event.target)}!`
          : `${who(event.actor)} gọi ${cardCatalog[event.kind].name} nhưng ${who(event.target)} không có.`,
        tone: 'normal',
      };
    case 'five_taken':
      return {
        text: `${who(event.player)} lấy ${cardCatalog[event.card.kind].name} từ chồng bỏ.`,
        tone: 'normal',
      };
    case 'nope_played':
      return { text: `🚫 ${who(event.player)} chặn đứng hành động bằng Không! (Nope)!`, tone: 'danger' };
    case 'action_undone':
      return { text: `Hành động của ${who(event.actor)} đã bị vô hiệu hóa.`, tone: 'normal' };
    case 'winner':
      return { text: `🏆 ${who(event.player)} là người sống sót cuối cùng và chiến thắng!`, tone: 'winner' };
    case 'decision_changed':
      return null;
  }
}

export function receiveCatsFrame(
  current: CatsClientState,
  frame: GameFrame,
  viewer: number | null,
): CatsClientState {
  const baseLog = frame.reset ? [] : current.log;
  const events = frame.update?.game === 'cats' ? frame.update.events : [];
  let nextLogId = frame.reset ? 1 : current.nextLogId;
  const added: CatsLogEntry[] = [];
  let futurePreview = frame.reset ? null : current.futurePreview;

  const seenFuture = events.find(
    (event): event is Extract<CatsEventKind, { type: 'future_seen' }> =>
      event.type === 'future_seen' && (viewer === null || event.player === viewer),
  );
  if (seenFuture) {
    futurePreview = seenFuture.cards;
  } else if (events.some(event => event.type === 'cards_drawn' || event.type === 'deck_shuffled' || event.type === 'deck_swapped' || event.type === 'future_altered')) {
    futurePreview = null;
  }

  for (const event of events) {
    const formatted = formatCatsEvent(event, frame.game.seats, viewer);
    if (formatted) {
      added.push({ id: nextLogId++, text: formatted.text, tone: formatted.tone });
    }
  }

  const combined = [...baseLog, ...added].slice(-60);
  return {
    game: frame.game,
    log: combined,
    futurePreview,
    nextLogId,
  };
}
