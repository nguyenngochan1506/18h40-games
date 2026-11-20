import { createBrowserRouter, redirect } from 'react-router';
import type { RouteObject } from 'react-router';
import App from './App';
import { roomRoute } from '../shared/lib/roomRoute';

// The layout owns the connection; changing its child URL must not remount it.
export const appRoutes: RouteObject[] = [{
  path: '/', Component: App, HydrateFallback: () => <p role="status">Đang mở sảnh…</p>,
  children: [
    { index: true, element: <></> },
    { path: 'r/:code', element: <></> },
    { path: '*', loader: ({ request }) => roomRoute(new URL(request.url).pathname).invalid ? null : redirect('/'), element: <></> },
  ],
}];

export function createAppRouter() { return createBrowserRouter(appRoutes); }
