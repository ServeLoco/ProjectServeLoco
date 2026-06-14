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
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2,ttf,json}'],
        runtimeCaching: [
          {
            // Cache uploaded product/category/offer images so repeat visits
            // don't re-download. 30-day retention, 500 entries cap.
            urlPattern: /^https?:\/\/.*\/(uploads|images)\/.*\.(png|jpg|jpeg|webp|gif|svg|avif)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
