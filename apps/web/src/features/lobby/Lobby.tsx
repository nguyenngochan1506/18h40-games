import { useEffect, useRef, useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import type { ClientMessage, GameKind } from '../../generated/protocol';
import { PROTOCOL_VERSION } from '../../generated/protocol';
import { SaloonBackdrop } from '../../shared/SaloonScene';
import { games, availableGames } from '../../games/registry';
import './lobby.css';
import { isValidRoomCode, normalizeRoomCode } from '../../shared/lib/roomRoute';

type Props = { disabled: boolean; send: (message: ClientMessage) => void; inviteCode?: string | null; previousRoom?: string; returnToRoom?: () => void; dismissInvite?: () => void };

export default function Lobby({ disabled, send, inviteCode, previousRoom, returnToRoom, dismissInvite }: Props) {
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState(inviteCode ?? '');
  const joinName = useRef<HTMLInputElement>(null);
  const joinCode = useRef<HTMLInputElement>(null);
  const [nameError, setNameError] = useState(false);
  const [codeError, setCodeError] = useState(false);
  useEffect(() => {
    if (!inviteCode) return;
    setRoomCode(inviteCode);
    // Focus after the parent scene's heading focus has run.
    const timer = setTimeout(() => joinName.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [inviteCode]);
  const [selectedGame, setSelectedGame] = useState<GameKind | null>(null);
  const reduced = useReducedMotion();
  const nameLength = Array.from(nickname.trim()).length;
  const validName = nameLength >= 1 && nameLength <= 20;
  const feedback = { whileHover: { scale: reduced || disabled ? 1 : 1.02 }, whileTap: { scale: reduced || disabled ? 1 : .98 }, transition: { duration: .1 } };
  const lobbyBackdrop = selectedGame ? availableGames[selectedGame]?.lobbyBackdrop : undefined;
  return (
    <section className="saloon-lobby" aria-label="Sảnh chọn game">
      <SaloonBackdrop src={lobbyBackdrop} />
      <header className="lobby-heading">
        <p className="saloon-eyebrow">18h40 games · Quán quen miền Tây</p>
        <h2 className="saloon-sign western-wood" data-scene-title tabIndex={-1}>18h40</h2>
        <p className="lobby-invitation">Hẹn nhau một ván</p>
      </header>
      <div className="lobby-posters game-lobby-posters">
        <form className="saloon-poster create-poster" aria-labelledby="create-heading" onSubmit={(event) => {
          event.preventDefault();
          if (validName && selectedGame && !disabled) send({ v: PROTOCOL_VERSION, type: 'create_room', nickname, game: selectedGame });
        }}>
          <span className="poster-star" aria-hidden="true">✦</span>
          <h3 id="create-heading">Chọn game, mở bàn</h3>
          <p className="poster-description">Mở bàn, gọi hội bạn vào chơi.</p>
          <div className="poster-fields">
            <label htmlFor="nickname">Tên của bạn</label>
            <input id="nickname" autoComplete="nickname" autoCapitalize="words" value={nickname} onChange={(event) => setNickname(event.target.value)} aria-describedby="nickname-hint" className="saloon-field" />
            <p id="nickname-hint" className="field-hint">Từ 1 đến 20 ký tự · {nameLength}/20</p>
          </div>
          <div className="game-options" role="group" aria-label="Chọn game để tạo phòng">{games.map(game => {
            const available = game.enabled && game.status === 'available';
            return <m.button key={game.id} type="button" className={`game-choice${selectedGame === game.id ? ' is-selected' : ''}${available ? '' : ' is-soon'}`} data-game-id={game.id}
              disabled={disabled || !available} aria-disabled={!available || disabled} aria-pressed={available ? selectedGame === game.id : undefined}
              onClick={() => { if (available) setSelectedGame(game.id); }} {...(available ? feedback : {})}>
              <span className="game-choice-art" aria-hidden="true">{typeof game.icon === 'string' ? game.icon : <svg viewBox={game.icon.viewBox} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{game.icon.paths.map(path => <path key={path} d={path} />)}</svg>}</span>
              <strong>{game.name}</strong><span className="game-choice-meta">{game.status === 'available' ? `${game.limits?.[0]}–${game.limits?.[1]} người` : 'Sắp có'}</span>
              <span className="game-choice-description">{game.description}</span>
              {available && <span className="game-choice-state" aria-hidden="true">{selectedGame === game.id ? 'Đã chọn' : 'Chọn game'}</span>}
            </m.button>;
          })}</div>
          <m.button {...feedback} className="western-button" disabled={disabled || !validName || !selectedGame} type="submit">Tạo phòng{selectedGame ? ` ${availableGames[selectedGame]?.name}` : ''} <span aria-hidden="true">✦</span></m.button>
        </form>
        <form className="saloon-poster join-poster" aria-labelledby="join-heading" onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          if (!validName) { joinName.current?.focus(); setNameError(true); return; }
          if (!isValidRoomCode(roomCode)) { joinCode.current?.focus(); setCodeError(true); return; }
          send({ v: PROTOCOL_VERSION, type: 'join_room', room_code: roomCode, nickname });
        }}>
          <span className="poster-star" aria-hidden="true">✦</span>
          <h3 id="join-heading">Vào phòng</h3>
          <p className="poster-description">Bạn bè đã đợi? Kéo ghế vào bàn.</p>
          {inviteCode && <p className="invite-notice">Bạn được mời vào phòng <strong>{inviteCode}</strong>. <button type="button" className="invite-action" onClick={() => { setRoomCode(''); dismissInvite?.(); }}>Bỏ lời mời</button></p>}
          {previousRoom && <p className="invite-notice">Bạn đang ở phòng {previousRoom}. <button type="button" className="invite-action" onClick={returnToRoom}>Về phòng {previousRoom}</button></p>}
          <div className="poster-fields">
            <label htmlFor="join-nickname">Tên của bạn</label>
            <input ref={joinName} id="join-nickname" autoComplete="nickname" autoCapitalize="words" value={nickname} onFocus={() => setNameError(false)} onBlur={() => setNameError(!validName)} onChange={(event) => { setNickname(event.target.value); setNameError(false); }} aria-invalid={nameError || undefined} aria-describedby="join-nickname-hint" className="saloon-field" />
            <p id="join-nickname-hint" className="field-hint" role={nameError ? 'alert' : undefined}>{nameError ? 'Nhập tên từ 1 đến 20 ký tự.' : `Từ 1 đến 20 ký tự · ${nameLength}/20`}</p>
            <label htmlFor="room-code">Mã phòng</label>
            <input ref={joinCode} id="room-code" autoComplete="off" autoCapitalize="characters" maxLength={32} value={roomCode} onFocus={() => setCodeError(false)} onBlur={() => setCodeError(!isValidRoomCode(roomCode))} onChange={(event) => { setRoomCode(normalizeRoomCode(event.target.value)); setCodeError(false); }} placeholder="ABCDE" aria-invalid={codeError || undefined} aria-describedby="room-code-hint" className="saloon-field room-code-input" />
            <p id="room-code-hint" className="field-hint" role={codeError ? 'alert' : undefined}>{codeError ? 'Mã phòng không hợp lệ' : 'Nhập mã 5 ký tự từ chủ phòng.'}</p>
          </div>
          <m.button {...feedback} className="western-button" disabled={disabled} type="submit">Vào phòng <span aria-hidden="true">→</span></m.button>
        </form>
      </div>
      <p className="lobby-footnote">Chọn game yêu thích <span aria-hidden="true">✦</span> Rủ bạn vào bàn</p>
    </section>
  );
}
