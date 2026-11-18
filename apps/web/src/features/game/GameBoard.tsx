import { useRef, useState } from 'react';
import type { CardId, CardKind, GameSnapshot, PublicPlayer, RoomView, SpectatorView } from '../../generated/protocol';
import { assetUrl, backFiles, cardFiles, characterFiles, roleFiles } from './assetMap';
import { cardFace } from './cardCatalog';
import { cards, characters, roles } from './i18n';
import { selectGameView } from './state';
import './game.css';

function Artwork({ file, label }: { file: string; label: string }) {
  const [missing, setMissing] = useState(false);
  return <span className="game-art">{missing
    ? <span className="game-art-fallback"><small>BANG!</small><strong>{label}</strong></span>
    : <img src={assetUrl(file)} alt={label} onError={() => setMissing(true)} loading="lazy" />}</span>;
}

function Card({ id, inspect }: { id: CardId; inspect: (kind: CardKind, scroll?: boolean) => void }) {
  const face = cardFace(id);
  if (!face) return <span className="unknown-card">Lá bài chưa xác định</span>;
  const card = cards[face.kind];
  return <button type="button" className="game-card" aria-label={`Xem ${card.name}, ${face.rank}${face.suit}`} title={`${card.name}: ${card.effect}`}
    onMouseEnter={() => inspect(face.kind)} onFocus={() => inspect(face.kind)} onClick={() => inspect(face.kind, true)}>
    <Artwork file={cardFiles[face.kind]} label={card.name} />
    <span className={face.suit === '♥' || face.suit === '♦' ? 'card-face red-suit' : 'card-face'}>{face.rank}{face.suit}</span>
    <span className="card-name">{card.name}</span>
  </button>;
}

function waitText(table: SpectatorView, name: (id: number) => string): string {
  if (table.winner) {
    if (table.winner === 'sheriff_and_deputies') return 'Cảnh sát trưởng và Phó cảnh sát thắng';
    return table.winner === 'outlaws' ? 'Tội phạm thắng' : 'Kẻ phản bội thắng';
  }
  const decision = table.waiting;
  if (!decision) return 'Đang cập nhật bàn chơi';
  const who = `Đang chờ ${name(decision.player)}...`;
  switch (decision.kind.type) {
    case 'turn': return `${who} Lượt chơi.`;
    case 'attack_response': return `${who} ${decision.kind.kind === 'indians' ? 'Bỏ 1 BANG! hoặc mất 1 máu' : decision.kind.remaining > 1 ? `Cần thêm ${decision.kind.remaining} lá Missed! nữa` : 'Đỡ bằng Missed!, hoặc chịu đòn'}`;
    case 'duel': return `${who} Duel: bỏ 1 BANG! hoặc mất 1 máu.`;
    case 'dying': return `${who} Dùng Beer để sống, hoặc chấp nhận bị loại.${table.players.find((player) => player.id === decision.player)?.character === 'sid_ketchum' ? ' Hoặc bỏ 2 lá để hồi máu.' : ''}`;
    case 'general_store': return `${who} Chọn 1 lá.`;
    case 'draw_choice': return `${who} Chọn nơi rút lá đầu.`;
    case 'keep_cards': return `${who} Chọn ${decision.kind.keep} lá để giữ.`;
    case 'choose_draw_result': return `${who} Chọn 1 lá lật kiểm tra.`;
  }
}

function Seat({ player, nickname, own, turn, waiting, presence, inspect }: {
  player: PublicPlayer; nickname: string; own: boolean; turn: boolean; waiting: boolean; presence: string; inspect: (kind: CardKind, scroll?: boolean) => void;
}) {
  return <article className={`game-seat${!player.alive ? ' eliminated' : ''}${turn ? ' has-turn' : ''}${waiting ? ' is-waiting' : ''}`} aria-label={`${nickname}${own ? ', bạn' : ''}${!player.alive ? ', đã bị loại' : ''}`}>
    <div className="seat-heading"><div className="seat-name"><h3>{nickname}{own && <small> (bạn)</small>}</h3><span>{presence}</span></div>
      <span className="seat-badge">{!player.alive ? 'Đã bị loại' : waiting ? 'Đang chờ' : turn ? 'Đang có lượt' : 'Đang chơi'}</span></div>
    <div className="seat-character">
      <Artwork file={characterFiles[player.character]} label={characters[player.character].name} />
      <div className="character-copy"><h4>{characters[player.character].name}</h4><p title={characters[player.character].ability}>{characters[player.character].ability}</p></div>
    </div>
    <div className="seat-stats"><span className="health" aria-label={`${player.health} trên ${player.max_health} máu`}><span aria-hidden="true">♥</span> {player.health}/{player.max_health}</span><span>{player.hand_count} lá trên tay</span><span>Tầm {player.weapon_range}</span></div>
    <div className="seat-role"><Artwork key={player.role ?? 'hidden'} file={player.role ? roleFiles[player.role] : backFiles.role} label={player.role ? roles[player.role].name : 'Vai chưa lộ'} /><span>{player.role ? roles[player.role].name : 'Vai chưa lộ'}</span></div>
    <div className="in-play" aria-label={`Bài trước mặt ${nickname}`}>{player.in_play.length ? player.in_play.map((card) => <Card key={card} id={card} inspect={inspect} />) : <p>Chưa có bài trước mặt</p>}</div>
  </article>;
}

export default function GameBoard({ game, room }: { game: GameSnapshot; room: RoomView }) {
  const { table, you, hand, choices } = selectGameView(game.view);
  const [selected, setSelected] = useState<CardKind | null>(null);
  const detail = useRef<HTMLElement>(null);
  const inspect = (kind: CardKind, scroll = false) => {
    setSelected(kind);
    if (scroll && window.matchMedia('(max-width: 1050px)').matches) detail.current?.scrollIntoView({ block: 'nearest' });
  };
  const name = (id: number) => `${game.seats.find((seat) => seat.player_id === id)?.nickname ?? `Ghế ${id + 1}`}${id === you ? ' (bạn)' : ''}`;
  const status = waitText(table, name);
  return <section className="bang-board" aria-label="Bàn chơi BANG!">
    <header className="board-heading"><div><p className="game-eyebrow">Bộ gốc · {table.players.filter((player) => player.alive).length}/{table.players.length} người còn sống</p><h2>BANG!</h2></div><span className="view-label">{you === null ? 'Góc nhìn khán giả' : 'Góc nhìn của bạn'}</span></header>
    <div className={`game-wait${table.winner ? ' game-finished' : ''}`} role="status" aria-live="polite"><span aria-hidden="true">{table.winner ? '★' : '●'}</span><p>{status}</p></div>
    <p className="view-only-note">Bàn chơi chỉ để xem. Chạm vào lá bài để đọc hiệu ứng.</p>
    <div className="board-layout"><div className="board-main">
      <div className="game-arena">
        {table.players.map((player, i) => {
          const seat = game.seats.find((seat) => seat.player_id === player.id);
          const member = room.members.find((member) => member.id === seat?.member_id);
          return <div className={`seat-position seat-${i}`} key={player.id}><Seat player={player} nickname={seat?.nickname ?? `Ghế ${player.id + 1}`} own={player.id === you} turn={!table.winner && table.turn.player === player.id} waiting={table.waiting?.player === player.id} presence={member ? member.online ? 'Đang kết nối' : 'Mất kết nối' : 'Đã rời phòng'} inspect={inspect} /></div>;
        })}
        <section className="table-center" aria-label="Bộ rút và chồng bỏ"><p className="game-eyebrow">Giữa bàn</p><div className="pile-row"><div className="draw-pile"><Artwork file={backFiles.card} label="Bộ rút" /><strong>{table.draw_count} lá</strong><span>Bộ rút</span></div><div className="discard-pile">{table.discard_top !== null ? <Card id={table.discard_top} inspect={inspect} /> : <span className="empty-pile">{table.discard_count ? 'Lá đỉnh được giữ kín' : 'Chưa có lá bỏ'}</span>}<strong>{table.discard_count} lá</strong><span>Chồng bỏ</span></div></div></section>
      </div>
      {you !== null && <section className="own-hand" aria-label="Bài trên tay của bạn"><div className="section-heading"><h3>Bài trên tay của bạn</h3><span>{hand.length} lá</span></div><div className="hand-cards">{hand.map((id) => <Card key={id} id={id} inspect={inspect} />)}{!hand.length && <p>Bạn chưa có bài trên tay.</p>}</div></section>}
      {!!table.store_pool.length && <section className="own-hand"><h3>General Store · Bài công khai</h3><div className="hand-cards">{table.store_pool.map((id) => <Card key={id} id={id} inspect={inspect} />)}</div></section>}
      {!!choices.length && <section className="own-hand"><h3>Bài đang xem riêng</h3><p>Chỉ bạn thấy các lá này. Bước này chưa hỗ trợ lựa chọn.</p><div className="hand-cards">{choices.map((id) => <Card key={id} id={id} inspect={inspect} />)}</div></section>}
    </div><aside className="card-detail" ref={detail} aria-label="Chi tiết lá bài"><p className="game-eyebrow">Chi tiết lá bài</p>{selected ? <><Artwork key={selected} file={cardFiles[selected]} label={cards[selected].name} /><h3>{cards[selected].name}</h3><p>{cards[selected].effect}</p></> : <><h3>Khám phá các lá bài</h3><p>Chạm, đưa chuột hoặc dùng phím Tab tới một lá bài để đọc hiệu ứng tiếng Việt.</p><span className="detail-mark" aria-hidden="true">♠ ♥ ♣ ♦</span></>}</aside></div>
  </section>;
}
