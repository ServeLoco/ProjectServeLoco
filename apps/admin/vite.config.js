import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // admin doesn't need PWA install prompt
      manifest: {
        name: 'VillKro Admin',
        short_name: 'VK Admin',
        description: 'VillKro store administration panel',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2,ttf,json}'],
        runtimeCaching: [
          {
            // Cache uploaded product/category/offer images so repeat admin
            // sessions don't re-download. 30-day retention, 500 entries.
            urlPattern: /^https?:\/\/.*\/(uploads|images)\/.*\.(png|jpg|jpeg|webp|gif|svg|avif)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'admin-images',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
