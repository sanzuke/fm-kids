import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev preview reaches the game backend (backend/) through its own dev server, so the page
// never needs a second address: it works on localhost and behind an HTTPS tunnel alike.
const backend = process.env.KFM_BACKEND_URL || 'http://127.0.0.1:8000';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/kfm/api': { target: backend, changeOrigin: true, rewrite: (path) => path.replace(/^\/kfm/, '') },
    },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
