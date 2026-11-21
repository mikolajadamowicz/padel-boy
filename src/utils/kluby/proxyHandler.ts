// Read-only proxy for the kluby.org pages in proxyRoutes.ts. kluby.org sends no
// CORS headers, so the browser can't fetch them directly. Every deployment runs
// this same handler:
//   - dev:        Vite middleware (vite.config.ts)
//   - Vercel:     api/kluby-proxy.ts (vercel.json rewrites /kluby-proxy/* to it)
//   - Cloudflare: worker/kluby-proxy.ts (for static hosts such as GitHub Pages)
// Browser headers (cookies, user agent, referer) are never forwarded.
import { KLUBY_USER_AGENT, toUpstreamUrl } from './proxyRoutes.js'

export interface KlubyProxyOptions {
  /** Origins allowed to call the proxy cross-origin. Same-origin calls are always allowed. */
  allowedOrigins?: string[]
  /** Optional response cache (Cloudflare `caches.default`). */
  cache?: Cache
  /** Lets the cache write finish after the response is sent (Cloudflare `ctx.waitUntil`). */
  waitUntil?: (promise: Promise<unknown>) => void
}

const CACHE_SECONDS = 60

export async function handleKlubyProxy(
  request: Request,
  pathname: string,
  searchParams: URLSearchParams,
  { allowedOrigins = [], cache, waitUntil }: KlubyProxyOptions = {},
): Promise<Response> {
  const origin = request.headers.get('Origin')
  const isSameOrigin = !origin || origin === new URL(request.url).origin
  const isAllowedOrigin = isSameOrigin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)
  const cors: Record<string, string> = origin && isAllowedOrigin
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' }
    : {}

  if (!isAllowedOrigin) {
    return new Response(`Origin ${origin} is not in ALLOWED_ORIGINS`, { status: 403 })
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors })

  const upstreamUrl = toUpstreamUrl(pathname, searchParams)
  if (!upstreamUrl) return new Response('Not a proxied kluby.org page', { status: 404, headers: cors })

  const cacheKey = new Request(upstreamUrl.toString())
  let html = cache ? await (await cache.match(cacheKey))?.text() : undefined

  if (html === undefined) {
    const upstream = await fetch(upstreamUrl, {
      headers: { 'User-Agent': KLUBY_USER_AGENT, Accept: 'text/html' },
    })
    if (!upstream.ok) {
      return new Response(`kluby.org responded with ${upstream.status}`, { status: 502, headers: cors })
    }
    html = await upstream.text()

    if (cache) {
      const cached = new Response(html, { headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } })
      const write = cache.put(cacheKey, cached)
      if (waitUntil) waitUntil(write)
      else await write
    }
  }

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors } })
}
