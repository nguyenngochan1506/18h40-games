import GameScope from './GameScope';
import type { GameSettingsProps } from '../types';
import { useState } from 'react';
import type { Expansion, GameConfig, RoleCounts } from '../../generated/protocol';
import { expansionPacks, maxPlayersFor, roleTotal, settingsError, standardRoles } from './settings';
import './settings.css';

const modes = [
  { id: 'classic', name: 'Gốc', description: 'Luật chính thức của BANG!.' },
  { id: 'club', name: '18h40', description: 'Dynamite đi 1 vòng, Jail tối đa 3 lượt mất; nhiều súng lấy tầm lớn nhất.' },
] as const;
const roles = [ ['deputy', 'Phó cảnh sát'], ['outlaw', 'Tội phạm'], ['renegade', 'Kẻ phản bội'] ] as const;

function SettingsEditor({ settings, players, maxPlayers, editable, onChange }: { settings: GameConfig; players: number; maxPlayers: number; editable: boolean; onChange: (settings: GameConfig) => void }) {
  // Below four seated players the room shows (and the server only accepts) the four-player preset,
  // even when the snapshot still holds the previous game's roles.
  const initial: GameConfig = players < 4 ? { ...settings, roles: standardRoles(4) } : settings;
  const [draft, setDraft] = useState<GameConfig>(initial);
  const seats = Math.max(4, players);
  const [error, setError] = useState<string | null>(null);
  const capacity = maxPlayersFor(draft.expansions);
  const issue = settingsError(draft.roles, seats, capacity);
  const seatIssue = players > capacity ? `Đang có ${players} người ngồi, nhiều hơn sức chứa ${capacity} người của cấu hình này. Có người rời ghế trước.` : null;
  function toggleExpansion(id: Expansion, on: boolean) {
    setError(null);
    const expansions = on ? [...new Set([...draft.expansions, id])] : draft.expansions.filter(item => item !== id);
    setDraft({ ...draft, expansions });
  }
  function changeRole(role: keyof RoleCounts, count: number) {
    setError(null);
    setDraft({ ...draft, roles: { ...draft.roles, [role]: count } });
  }
  return <form className="room-settings saloon-poster" aria-label="Cài đặt phòng" noValidate onSubmit={event => {
    event.preventDefault();
    if (!editable) return;
    if (seatIssue || issue) { setError(seatIssue ?? issue); return; }
    onChange(draft);
  }}>
    <fieldset disabled={!editable}>
      <legend>Chế độ</legend>
      <div className="room-mode-options">{modes.map(mode => <label key={mode.id} className={draft.mode === mode.id ? 'is-selected' : ''}>
        <input type="radio" name="game-mode" value={mode.id} checked={draft.mode === mode.id} onChange={() => { setError(null); setDraft({ ...draft, mode: mode.id }); }} />
        <span><strong>{mode.name}</strong><small>{mode.description}</small></span>
      </label>)}</div>
    </fieldset>
    <fieldset disabled={!editable}>
      <legend>Bản mở rộng</legend>
      <div className="room-mode-options">{expansionPacks.map(pack => <label key={pack.id} className={draft.expansions.includes(pack.id) ? 'is-selected' : ''}>
        <input type="checkbox" name="expansion" value={pack.id} checked={draft.expansions.includes(pack.id)} onChange={event => toggleExpansion(pack.id, event.target.checked)} />
        <span><strong>{pack.name}</strong><small>{pack.description}</small></span>
      </label>)}</div>
      <p className="settings-hint">Ghế chơi tối đa: {maxPlayers} người.</p>
    </fieldset>
    <fieldset disabled={!editable || players < 4} aria-describedby="role-total role-settings-hint">
      <legend>Phân vai</legend>
      <p className="fixed-sheriff">Cảnh sát trưởng <strong>1</strong></p>
      {roles.map(([role, label]) => <div className="room-role" key={role}>
        <label htmlFor={`role-${role}`}>{label}</label>
        <div className="role-stepper">
          <button type="button" aria-label={`Giảm ${label}`} disabled={draft.roles[role] <= 0} onClick={() => changeRole(role, Math.max(0, (draft.roles[role] || 0) - 1))}>−</button>
          <input id={`role-${role}`} type="number" min={0} max={seats - 1} step={1} value={Number.isFinite(draft.roles[role]) ? draft.roles[role] : ''} onFocus={() => setError(null)} onBlur={() => setError(settingsError(draft.roles, seats, capacity))} onChange={event => changeRole(role, event.target.valueAsNumber)} />
          <button type="button" aria-label={`Tăng ${label}`} disabled={draft.roles[role] >= seats - 1} onClick={() => changeRole(role, (draft.roles[role] || 0) + 1)}>+</button>
        </div>
      </div>)}
      <p id="role-total" className="role-total" role="status">Tổng: {Number.isFinite(roleTotal(draft.roles)) ? roleTotal(draft.roles) : '—'}/{players} người · {players < 4 ? 'Mặc định cho 4 người' : issue ? 'Cần điều chỉnh' : 'Hợp lệ'}</p>
      <button type="button" className="settings-reset" onClick={() => { setError(null); setDraft({ ...draft, roles: standardRoles(players) }); }}>Về mặc định</button>
    </fieldset>
    <p id="role-settings-hint" className="settings-hint">{players < 4 ? 'Chờ đủ 4 người; hiện phân vai mặc định cho 4 người.' : 'Số người chơi đổi thì phân vai về mặc định. Chế độ và bản mở rộng giữ nguyên.'}</p>
    {editable && JSON.stringify(draft) !== JSON.stringify(initial) && <p className="settings-hint" role="status">Thay đổi chưa áp dụng.</p>}
    {error && <p className="settings-error" role="alert">{error}</p>}
    {editable ? <button type="submit" className="western-button">Áp dụng cài đặt</button> : <p className="settings-hint">Chỉ chủ phòng sửa cài đặt khi đang chờ.</p>}
  </form>;
}

export default function Settings({ settings, players, maxPlayers, editable, onChange }: GameSettingsProps) {
  if (settings.game !== 'bang') return <p role="alert">Cài đặt không thuộc BANG!.</p>;
  return <GameScope><SettingsEditor settings={settings.payload} players={players} maxPlayers={maxPlayers} editable={editable} onChange={payload => onChange({ game: 'bang', payload })} /></GameScope>;
}
