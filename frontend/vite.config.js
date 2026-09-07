import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Keep imports stable as UI styles are added and screens move around.
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
    },
  },
  server: {
    /**
     * 5174, not Vite's default 5173.
     *
     * 5173 belongs to a sibling project on this machine that is usually already running, and
     * Vite's silent fallback to the next free port means the URL moves between runs — which
     * breaks the backend's CORS allow-list without saying why. Pinning it keeps the origin
     * stable, and backend CORS_ORIGINS lists both ports so either works.
     */
    port: 5174,
    open: true,
  },
});
