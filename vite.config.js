import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// base: './' — относительные пути: сборка работает на GitHub Pages (…github.io/podvorye/)
// и позже внутри Android-приложения (Capacitor).
export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      // Новая версия ставится сама при следующем открытии приложения.
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'Рационы подворья',
        short_name: 'Подворье',
        description: 'Рационы, запасы кормов, журнал надоев и яиц, помощник по хозяйству.',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#3A8A3C',
        background_color: '#FFFEF7',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // В кэш — только файлы приложения: оно открывается без интернета.
        // Данные хозяйства хранятся в телефоне отдельно и отправляются в Supabase при связи.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,woff2}'],
        globIgnores: ['**/pwa-512x512.png', '**/maskable-512x512.png'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        // Шрифты Google — в кэш при первом открытии, чтобы и без сети было красиво.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
})
