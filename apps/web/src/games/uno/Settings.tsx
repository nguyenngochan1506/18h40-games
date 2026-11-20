import type { GameSettingsProps } from '../types.ts';
import './styles.css';

export default function Settings({ settings }: GameSettingsProps) {
  // TODO: Build an editor for settings.payload ('uno' GameSettings in generated/protocol.ts); emit onChange with that tag.
  return <section className="game-uno" aria-label="Cài đặt UNO">
    <h3>Cài đặt UNO</h3>
    {settings.game === 'uno'
      ? <p className="uno-message" role="status">Game đang được xây dựng.</p>
      : <p role="alert">Cài đặt không thuộc UNO.</p>}
  </section>;
}
