import { useState } from 'react';
import type { WerewolfRole, WerewolfSettings } from '../../generated/protocol.ts';
import type { GameSettingsProps } from '../types.ts';
import { balanceLabel, deckBalance, deckError, deckTotal, ROLE_ORDER, ROLES, standardRoleDeck } from './roles.ts';
import './styles.css';

function SettingsEditor({
  settings,
  players,
  editable,
  onChange,
}: {
  settings: WerewolfSettings;
  players: number;
  editable: boolean;
  onChange: (next: WerewolfSettings) => void;
}) {
  const [draft, setDraft] = useState<WerewolfSettings>(settings);
  const [error, setError] = useState<string | null>(null);

  const effectivePlayers = Math.max(5, players);
  const total = deckTotal(draft.roles);
  const balance = deckBalance(draft.roles);
  const issue = deckError(draft.roles, effectivePlayers);

  function setRoleCount(role: WerewolfRole, next: number) {
    const meta = ROLES[role];
    const max = meta.unique ? 1 : effectivePlayers;
    const clamped = Math.max(0, Math.min(max, Number.isFinite(next) ? Math.trunc(next) : 0));
    setError(null);
    setDraft(current => ({
      ...current,
      roles: { ...current.roles, [role]: clamped },
    }));
  }

  return (
    <form
      className="ww-settings saloon-poster"
      aria-label="Cài đặt Ma Sói"
      noValidate
      onSubmit={event => {
        event.preventDefault();
        if (!editable) return;
        if (issue) {
          setError(issue);
          return;
        }
        onChange(draft);
      }}
    >
      <header className="ww-settings-header">
        <h3>Bộ bài Ma Sói</h3>
        <div className="ww-settings-stats" role="status">
          <span className={total === effectivePlayers ? 'ww-stat-ok' : 'ww-stat-warn'}>
            Tổng bài: <strong>{total}/{effectivePlayers}</strong>
          </span>
          <span className="ww-stat-balance">
            Cân bằng: <strong>{balanceLabel(balance)}</strong>
          </span>
        </div>
      </header>

      <label className="ww-toggle">
        <input
          type="checkbox"
          disabled={!editable}
          checked={draft.reveal_role_on_death}
          onChange={event => {
            setError(null);
            setDraft(current => ({ ...current, reveal_role_on_death: event.target.checked }));
          }}
        />
        <span>Lật vai trò khi người chơi bị loại</span>
      </label>

      <fieldset className="ww-role-grid" disabled={!editable}>
        <legend>Chọn lá bài vai trò (16 vai)</legend>
        <div className="ww-role-list">
          {ROLE_ORDER.map(roleId => {
            const meta = ROLES[roleId];
            const count = draft.roles[roleId];
            const max = meta.unique ? 1 : effectivePlayers;
            return (
              <div key={roleId} className={`ww-role-option ww-team-${meta.team} ${count > 0 ? 'is-active' : ''}`}>
                <img src={meta.image} alt={meta.name} className="ww-role-thumb" loading="lazy" />
                <div className="ww-role-info">
                  <div className="ww-role-heading">
                    <strong>{meta.name}</strong>
                    <span className="ww-role-bal">{meta.balance > 0 ? `+${meta.balance}` : meta.balance}</span>
                  </div>
                  <small>{meta.summary}</small>
                </div>
                <div className="ww-stepper">
                  <button
                    type="button"
                    aria-label={`Giảm ${meta.name}`}
                    disabled={count <= 0}
                    onClick={() => setRoleCount(roleId, count - 1)}
                  >
                    −
                  </button>
                  <span className="ww-stepper-val" aria-live="polite">{count}</span>
                  <button
                    type="button"
                    aria-label={`Tăng ${meta.name}`}
                    disabled={count >= max}
                    onClick={() => setRoleCount(roleId, count + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      <p className="ww-settings-subtitle">
        {players < 5
          ? 'Đang chỉnh bộ bài cho 5 người (tối thiểu); nếu phòng vượt 5 người sẽ tự chuyển sang bộ chuẩn mới.'
          : 'Khi số người chơi đổi, bộ bài sẽ tự đưa về bộ chuẩn cân bằng.'}
      </p>

      <div className="ww-settings-status">
        {error ? (
          <p className="ww-error" role="alert">{error}</p>
        ) : editable && JSON.stringify(draft) !== JSON.stringify(settings) ? (
          <p className="ww-hint" role="status">Thay đổi chưa được áp dụng.</p>
        ) : (
          <p className="ww-hint ww-hint-placeholder" aria-hidden="true">&nbsp;</p>
        )}
      </div>

      <div className="ww-settings-actions">
        {editable ? (
          <>
            <button
              type="button"
              className="ww-settings-reset"
              onClick={() => {
                setError(null);
                setDraft(current => ({ ...current, roles: standardRoleDeck(effectivePlayers) }));
              }}
            >
              Về bộ chuẩn ({effectivePlayers} người)
            </button>
            <button type="submit" className="western-button">
              Áp dụng cài đặt
            </button>
          </>
        ) : (
          <p className="ww-hint">Chỉ chủ phòng mới có thể chỉnh cài đặt khi phòng đang chờ.</p>
        )}
      </div>
    </form>
  );
}

export default function Settings({ settings, players, editable, onChange }: GameSettingsProps) {
  return (
    <section className="game-werewolf" aria-label="Cài đặt Ma Sói">
      {settings.game === 'werewolf' ? (
        <SettingsEditor
          settings={settings.payload}
          players={players}
          editable={editable}
          onChange={payload => onChange({ game: 'werewolf', payload })}
        />
      ) : (
        <p role="alert">Cài đặt không thuộc Ma Sói.</p>
      )}
    </section>
  );
}
