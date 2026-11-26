import type {
  GameSeat,
  WerewolfDeathCause,
  WerewolfEventKind,
  WerewolfNightStep,
  WerewolfPlayerView,
  WerewolfSpectatorView,
  WerewolfView,
  WerewolfWinner,
} from '../../generated/protocol.ts';
import type { GameFrame } from '../../shared/gameSync.ts';
import { ROLES } from './roles.ts';

export type WerewolfGameSnapshot = {
  seq: number;
  seats: GameSeat[];
  view: WerewolfView;
};

export type WerewolfLogEntry = {
  id: number;
  text: string;
  tone: 'neutral' | 'night' | 'day' | 'danger' | 'secret' | 'victory';
};

export type WerewolfClientState = {
  game: WerewolfGameSnapshot | null;
  log: WerewolfLogEntry[];
  nextLogId: number;
};

export const initialWerewolfState: WerewolfClientState = {
  game: null,
  log: [],
  nextLogId: 1,
};

export function selectSpectatorView(view: WerewolfView): WerewolfSpectatorView {
  return view.perspective === 'player' ? view.view.table : view.view;
}

export function selectPlayerView(view: WerewolfView): WerewolfPlayerView | null {
  return view.perspective === 'player' ? view.view : null;
}

export function seatName(seats: GameSeat[], playerId: number): string {
  return seats[playerId]?.nickname ?? `Người chơi #${playerId + 1}`;
}

export function nightStepLabel(step: WerewolfNightStep): string {
  switch (step) {
    case 'cupid': return 'Thần Tình Yêu ghép đôi';
    case 'bodyguard': return 'Bảo Vệ chọn người che chắn';
    case 'werewolves': return 'Bầy Sói săn mồi';
    case 'seer': return 'Tiên Tri soi danh tính';
    case 'sorcerer': return 'Pháp Sư Hắc Ám tìm Tiên Tri';
    case 'witch': return 'Phù Thủy pha thuốc';
  }
}

export function deathCauseLabel(cause: WerewolfDeathCause): string {
  switch (cause) {
    case 'werewolf_attack': return 'bị Ma Sói cắn chết';
    case 'witch_poison': return 'trúng độc của Phù Thủy';
    case 'village_lynch': return 'bị làng treo cổ';
    case 'hunter_shot': return 'bị Thợ Săn bắn hạ';
    case 'lover_heartbreak': return 'chết theo Tình Nhân';
  }
}

export function winnerLabel(winner: WerewolfWinner): string {
  switch (winner) {
    case 'village': return 'Phe Dân Làng chiến thắng!';
    case 'werewolves': return 'Bầy Ma Sói chiến thắng!';
    case 'lovers': return 'Cặp Tình Nhân chiến thắng!';
    case 'tanner': return 'Kẻ Chán Đời chiến thắng!';
    case 'draw': return 'Trận đấu hòa — không ai sống sót!';
  }
}

function formatEvent(event: WerewolfEventKind, seats: GameSeat[]): { text: string; tone: WerewolfLogEntry['tone'] } | null {
  switch (event.type) {
    case 'game_started':
      return { text: `Ván Ma Sói bắt đầu với ${event.player_count} người chơi.`, tone: 'neutral' };
    case 'role_assigned':
      return { text: `Vai trò bí mật của bạn: ${ROLES[event.role].name} (${ROLES[event.role].englishName}).`, tone: 'secret' };
    case 'night_started':
      return { text: `Đêm thứ ${event.night} buông xuống. Cả làng chìm vào giấc ngủ…`, tone: 'night' };
    case 'night_step_started':
      return { text: `Đêm ${event.night}: ${nightStepLabel(event.step)}.`, tone: 'night' };
    case 'lovers_linked':
      return { text: `Tình Nhân được ghép đôi: ${seatName(seats, event.first)} ♥ ${seatName(seats, event.second)}.`, tone: 'secret' };
    case 'bodyguard_protected':
      return { text: `Bạn đã bảo vệ ${seatName(seats, event.target)} trong đêm nay.`, tone: 'secret' };
    case 'wolf_voted':
      return {
        text: `${seatName(seats, event.wolf)} chọn cắn ${seatName(seats, event.target)}${event.infect ? ' (kèm biến đổi Sói Trùm)' : ''}.`,
        tone: 'secret',
      };
    case 'wolves_sick_skipped':
      return { text: `Đêm ${event.night}: Bầy Sói bị nhiễm bệnh từ Người Bệnh nên không thể cắn ai!`, tone: 'secret' };
    case 'seer_inspected':
      return {
        text: `Kết quả Tiên Tri: ${seatName(seats, event.target)} ${event.is_wolf ? 'LÀ MA SÓI!' : 'không phải Ma Sói.'}`,
        tone: 'secret',
      };
    case 'sorcerer_inspected':
      return {
        text: `Kết quả Pháp Sư: ${seatName(seats, event.target)} ${event.is_seer ? 'LÀ TIÊN TRI!' : 'không phải Tiên Tri.'}`,
        tone: 'secret',
      };
    case 'witch_used_heal':
      return { text: `Bạn đã dùng bình Cứu cho ${seatName(seats, event.target)}.`, tone: 'secret' };
    case 'witch_used_poison':
      return { text: `Bạn đã dùng bình Độc lên ${seatName(seats, event.target)}.`, tone: 'secret' };
    case 'player_turned_wolf':
      return { text: `${seatName(seats, event.player)} đã gia nhập bầy Ma Sói!`, tone: 'secret' };
    case 'dawn_peaceful':
      return { text: `Bình minh ngày ${event.day}: Đêm qua bình yên, không ai bị hại!`, tone: 'day' };
    case 'player_died': {
      const roleText = event.revealed_role ? ` (Vai: ${ROLES[event.revealed_role].name})` : '';
      return { text: `${seatName(seats, event.player)} đã ${deathCauseLabel(event.cause)}${roleText}.`, tone: 'danger' };
    }
    case 'day_started':
      return { text: `Ngày thứ ${event.day} bắt đầu. Hãy thảo luận và bỏ phiếu treo cổ!`, tone: 'day' };
    case 'day_voted': {
      const weightText = event.weight > 1 ? ` (×${event.weight} Thị Trưởng)` : '';
      const targetText = event.target === null ? 'bỏ phiếu trắng' : `bỏ phiếu treo cổ ${seatName(seats, event.target)}`;
      return { text: `${seatName(seats, event.voter)} ${targetText}${weightText}.`, tone: 'day' };
    }
    case 'prince_revealed':
      return { text: `${seatName(seats, event.player)} lật bài Hoàng Tử, miễn án treo cổ!`, tone: 'day' };
    case 'day_no_lynch':
      return { text: `Ngày ${event.day} kết thúc — không ai bị treo cổ.`, tone: 'day' };
    case 'hunter_triggered':
      return { text: `Thợ Săn ${seatName(seats, event.hunter)} đang giương nỏ kéo theo một người!`, tone: 'danger' };
    case 'game_over':
      return { text: winnerLabel(event.winner), tone: 'victory' };
  }
}

export function receiveFrame(current: WerewolfClientState, frame: GameFrame): WerewolfClientState {
  if (frame.game.view.game !== 'werewolf') return current;
  const game: WerewolfGameSnapshot = {
    seq: frame.game.seq,
    seats: frame.game.seats,
    view: frame.game.view.payload,
  };
  let log = frame.reset ? [] : [...current.log];
  let nextLogId = frame.reset ? 1 : current.nextLogId;
  const events = frame.update?.game === 'werewolf' ? frame.update.events : [];
  for (const event of events) {
    const formatted = formatEvent(event, game.seats);
    if (formatted) {
      log.push({ id: nextLogId++, ...formatted });
    }
  }
  if (log.length > 120) {
    log = log.slice(log.length - 120);
  }
  return { game, log, nextLogId };
}
