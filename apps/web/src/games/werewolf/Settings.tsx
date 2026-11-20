import type { GameSettingsProps } from '../types.ts';
import './styles.css';

export default function Settings({ settings }: GameSettingsProps) {
  // TODO: Build an editor for settings.payload ('werewolf' GameSettings in generated/protocol.ts); emit onChange with that tag.
  return <section className="game-werewolf" aria-label="Cài đặt Ma Sói">
    <h3>Cài đặt Ma Sói</h3>
    {settings.game === 'werewolf'
      ? <p className="werewolf-message" role="status">Game đang được xây dựng.</p>
      : <p role="alert">Cài đặt không thuộc Ma Sói.</p>}
  </section>;
}
