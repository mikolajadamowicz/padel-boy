import { defineConfig } from 'vitest/config'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { handleKlubyProxy } from './src/utils/kluby/proxyHandler'
import { PROXY_PREFIX } from './src/utils/kluby/proxyRoutes'

/**
 * Where the app sends kluby.org requests (see src/utils/kluby/proxyHandler.ts):
 * - dev/preview and Vercel: same-origin PROXY_PREFIX (Vite middleware / api/kluby-proxy.ts)
 * - other hosts: VITE_KLUBY_PROXY_URL (the Cloudflare Worker URL); unset hides the import
 */
function klubyProxyUrl(command: 'build' | 'serve'): string {
  if (process.env.VITE_KLUBY_PROXY_URL) return process.env.VITE_KLUBY_PROXY_URL
  if (command === 'serve' || process.env.VERCEL) return PROXY_PREFIX
  return ''
}

/** Runs the shared kluby.org proxy handler on the dev and preview servers. */
function klubyProxyMiddleware(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use(PROXY_PREFIX, async (req, res) => {
      try {
        const url = new URL(`${PROXY_PREFIX}${req.url ?? '/'}`, `http://${req.headers.host ?? 'localhost'}`)
        const request = new Request(url, {
          method: req.method,
          headers: req.headers.origin ? { Origin: req.headers.origin } : {},
        })
        const response = await handleKlubyProxy(request, url.pathname.slice(PROXY_PREFIX.length), url.searchParams)
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(await response.text())
      } catch (error) {
        res.statusCode = 502
        res.end(`kluby.org proxy failed: ${String(error)}`)
      }
    })
  }
  return { name: 'kluby-proxy', configureServer: attach, configurePreviewServer: attach }
}

export default defineConfig(({ command }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    __KLUBY_PROXY_URL__: JSON.stringify(klubyProxyUrl(command)),
  },
  plugins: [
    react(),
    klubyProxyMiddleware(),
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
  test: {
    globals: true,
    environment: 'jsdom',
    watch: false,
  },
}))
