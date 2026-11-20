import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  define: { __SOUND_FILES__: JSON.stringify(readdirSync(fileURLToPath(new URL('../../assets/', import.meta.url)), { recursive: true }).filter(file => typeof file === 'string' && file.endsWith('.mp3')).map(file => `/${file}`)), __SCENE_FILES__: JSON.stringify(readdirSync(fileURLToPath(new URL('../../assets/scene/', import.meta.url)), { recursive: true }).filter(file => typeof file === 'string' && file.endsWith('.webp')).map(file => `/scene/${file}`)) },
  build: { manifest: true, rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'router', test: /[\\/]node_modules[\\/]react-router[\\/]/ }] } } } },
  publicDir: '../../assets',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/ws': { target: 'http://127.0.0.1:3000', ws: true },
      '/healthz': { target: 'http://127.0.0.1:3000' },
    },
  },
});
