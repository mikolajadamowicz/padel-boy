// Cloudflare Worker: read-only CORS proxy for the public kluby.org pages the
// "Import from kluby.org" feature needs. kluby.org sends no CORS headers, so the
// static app can't fetch these pages directly from the browser.
//
// Only two page shapes are forwarded, both public without login:
//   /{club}/grafik?dyscyplina=4&data_grafiku=YYYY-MM-DD   (club schedule)
//   /{club}/rezerwacje/{id}/uczestnicy                   (event participants)
//
// Deploy: see worker/README.md

const UPSTREAM = 'https://kluby.org'
const CACHE_SECONDS = 60

const ALLOWED_PATHS = [
  /^\/[a-z0-9-]+\/grafik$/,
  /^\/[a-z0-9-]+\/rezerwacje\/\d+\/uczestnicy$/,
]
const ALLOWED_QUERY_KEYS = new Set(['dyscyplina', 'data_grafiku'])

function corsHeaders(origin, allowedOrigins) {
  const allowed = allowedOrigins.includes('*') || allowedOrigins.includes(origin)
  return allowed
    ? { 'Access-Control-Allow-Origin': origin || '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' }
    : {}
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || ''
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean)
    const cors = corsHeaders(origin, allowedOrigins)

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors })
    if (!ALLOWED_PATHS.some((re) => re.test(url.pathname))) return new Response('Not found', { status: 404, headers: cors })

    const upstreamUrl = new URL(url.pathname, UPSTREAM)
    for (const [key, value] of url.searchParams) {
      if (ALLOWED_QUERY_KEYS.has(key)) upstreamUrl.searchParams.set(key, value)
    }

    const cache = caches.default
    const cacheKey = new Request(upstreamUrl.toString())
    let upstream = await cache.match(cacheKey)

    if (!upstream) {
      const fetched = await fetch(upstreamUrl.toString(), {
        headers: { 'User-Agent': 'padel-boy (kluby.org participant import)', Accept: 'text/html' },
      })
      if (!fetched.ok) return new Response(`Upstream error ${fetched.status}`, { status: 502, headers: cors })

      upstream = new Response(await fetched.text(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` },
      })
      ctx.waitUntil(cache.put(cacheKey, upstream.clone()))
    }

    return new Response(upstream.body, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...cors },
    })
  },
}
