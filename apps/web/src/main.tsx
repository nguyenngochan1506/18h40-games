import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { createAppRouter } from './app/router';
import { loadDemo } from './games/registry';
import './style.css';

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('demo') === 'bang') {
  void loadDemo().then(({ default: GameDemo }) => root.render(<GameDemo />));
} else {
  const router = createAppRouter();
  root.render(<RouterProvider router={router} />);
}
