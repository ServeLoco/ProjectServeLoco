import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,       // we manage manifest.json manually in /public
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/your-backend\.com\/api\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', expiration: { maxAgeSeconds: 60 } }
          }
        ]
      }
    })
  ]
});
