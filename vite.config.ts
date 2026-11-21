import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['padel-icon.svg', 'robots.txt', 'sitemap.xml'],
      manifest: {
        name: 'Padel Boy',
        short_name: 'Padel Boy',
        description: 'Create and manage padel tournaments in seconds.',
        theme_color: '#111827',
        background_color: '#111827',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/padel-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  // Always use root path - runtime detection in App.tsx handles basename routing
  base: '/',
  server: {
    proxy: {
      // kluby.org has no CORS headers; in dev we proxy it (prod uses worker/kluby-proxy.ts)
      '/kluby-proxy': {
        target: 'https://kluby.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/kluby-proxy/, ''),
        // Match the prod worker: identify as padel-boy, don't forward browser headers.
        headers: { 'User-Agent': 'padel-boy (kluby.org participant import)' },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            for (const header of ['cookie', 'origin', 'referer']) proxyReq.removeHeader(header)
          })
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    watch: false,
  },
})
