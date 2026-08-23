import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['mailmind-mark.svg'],
      manifest: {
        name: 'MailMind',
        short_name: 'MailMind',
        description: 'Votre boîte Gmail enfin claire.',
        theme_color: '#101b19',
        background_color: '#f6f7f1',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/mailmind-mark.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
});

