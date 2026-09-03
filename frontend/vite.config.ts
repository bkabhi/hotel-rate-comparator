import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The API is proxied rather than called cross-origin, so the frontend needs no
 * base-URL configuration and the browser never sees a preflight.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
