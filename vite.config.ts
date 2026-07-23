import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        bookmarks: 'bookmarks.html',
        sidepanel: 'sidepanel.html',
        offscreenTheme: 'offscreen-theme.html',
      },
    },
  },
  server: { port: 5173, strictPort: true },
});
