// Cloudflare Worker wrapper around the shared kluby.org proxy handler, for
// static hosts (e.g. GitHub Pages) that can't run the proxy themselves.
// Deploy: see worker/README.md
import { handleKlubyProxy } from '../src/utils/kluby/proxyHandler'

interface Env {
  /** Comma-separated origins allowed to call this worker. */
  ALLOWED_ORIGINS?: string
}

export default {
  fetch(request: Request, env: Env, ctx: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url)
    return handleKlubyProxy(request, url.pathname, url.searchParams, {
      allowedOrigins: (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
      cache: (caches as unknown as { default: Cache }).default,
      waitUntil: (promise) => ctx.waitUntil(promise),
    })
  },
}
