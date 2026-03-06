import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const { version } = JSON.parse(
  readFileSync(resolve(__dirname, '../package.json'), 'utf-8'),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy REST API calls to the Express server
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      // Proxy WebSocket upgrade requests
      '/ws': {
        target: 'ws://localhost:4000',
        ws: true,
      },
    },
  },
});
