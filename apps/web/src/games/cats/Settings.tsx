import type { CatsSettings } from '../../generated/protocol.ts';
import type { GameSettingsProps } from '../types.ts';
import './styles.css';

const packs: Array<{
  key: keyof CatsSettings;
  title: string;
  summary: string;
}> = [
  {
    key: 'imploding',
    title: 'Imploding Kittens',
    summary: 'Thêm Mèo Sập (không thể Gỡ Bom khi ngửa), Đảo Chiều, Rút Đáy, Mèo Hoang (Wild), Đổi Tương Lai 3x, Tấn Công Chỉ Định.',
  },
  {
    key: 'streaking',
    title: 'Streaking Kittens',
    summary: 'Thêm Mèo Chạy Rông (ôm kín 1 Mèo Nổ), Siêu Bỏ Lượt, Nhìn Tương Lai 5x, Đổi Đầu Đuôi, Thu Gom Rác, Bom Nguyên Tử Mèo.',
  },
  {
    key: 'barking',
    title: 'Barking Kittens',
    summary: 'Thêm Đổi Tương Lai 5x, Tự Tấn Công (3 lượt), Chia Sẻ Tương Lai, Chôn Bài, Góp Tiệc.',
  },
];

export default function Settings({ settings, editable, onChange }: GameSettingsProps) {
  if (settings.game !== 'cats') {
    return (
      <section className="game-cats cats-settings" aria-label="Cài đặt Mèo Nổ">
        <p role="alert">Cài đặt không thuộc Mèo Nổ.</p>
      </section>
    );
  }

  const payload = settings.payload;
  const toggle = (key: keyof CatsSettings) => {
    if (!editable) return;
    onChange({
      game: 'cats',
      payload: { ...payload, [key]: !payload[key] },
    });
  };

  return (
    <section className="game-cats cats-settings" aria-label="Cài đặt Mèo Nổ">
      <fieldset className="cats-expansion-list" disabled={!editable}>
        <legend>Bản mở rộng Exploding Kittens</legend>
        {packs.map(pack => (
          <label key={pack.key} className="cats-expansion-option">
            <input
              type="checkbox"
              checked={payload[pack.key]}
              onChange={() => toggle(pack.key)}
            />
            <span>
              <strong>{pack.title}</strong>
              <small>{pack.summary}</small>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
