import type { WerewolfRole } from '../../generated/protocol.ts';
import { CARD_BACK_IMAGE, ROLES } from './roles.ts';

type RoleCardProps = {
  role: WerewolfRole | null;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showSummary?: boolean;
  className?: string;
};

export default function RoleCard({ role, faceDown = false, size = 'md', showSummary = false, className = '' }: RoleCardProps) {
  if (faceDown || !role) {
    return (
      <div className={`ww-card ww-card-${size} ww-card-back ${className}`.trim()} aria-label="Lá bài úp">
        <div className="ww-card-art-frame">
          <img src={CARD_BACK_IMAGE} alt="Mặt sau lá bài Ma Sói" className="ww-card-img" loading="lazy" />
        </div>
        <div className="ww-card-footer">
          <span className="ww-card-title">Ma Sói</span>
          <span className="ww-card-subtitle">Ẩn danh</span>
        </div>
      </div>
    );
  }

  const meta = ROLES[role];
  const balanceText = meta.balance > 0 ? `+${meta.balance}` : `${meta.balance}`;

  return (
    <div className={`ww-card ww-card-${size} ww-team-${meta.team} ${className}`.trim()}>
      <span className="ww-card-balance" title="Điểm cân bằng Ultimate Werewolf">{balanceText}</span>
      <div className="ww-card-art-frame">
        <img src={meta.image} alt={`${meta.name} (${meta.englishName})`} className="ww-card-img" loading="lazy" />
      </div>
      <div className="ww-card-footer">
        <span className="ww-card-title">{meta.name}</span>
        <span className="ww-card-subtitle">{meta.englishName}</span>
        {showSummary && <p className="ww-card-summary">{meta.summary}</p>}
      </div>
    </div>
  );
}
