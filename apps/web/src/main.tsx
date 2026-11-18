import { createRoot } from 'react-dom/client';
import App from './app/App';
import './style.css';

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === 'bang') {
  void import('./features/game/GameDemo').then(({ default: GameDemo }) => root.render(<GameDemo />));
} else {
  root.render(<App />);
}
