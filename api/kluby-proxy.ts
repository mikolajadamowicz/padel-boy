// Vercel Function wrapper around the shared kluby.org proxy handler.
// vercel.json rewrites /kluby-proxy/<path> to /api/kluby-proxy?path=<path>.
// Imports need explicit .js extensions: Vercel compiles each file without bundling,
// and the package is ESM ("type": "module"), so Node won't resolve bare paths.
import { handleKlubyProxy } from '../src/utils/kluby/proxyHandler.js'
import { PROXY_PREFIX } from '../src/utils/kluby/proxyRoutes.js'

export function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const params = url.searchParams
  // Normally the rewrite passes the page as ?path=; fall back to the original URL if it didn't.
  const pathParam = params.get('path')
  params.delete('path')
  const pathname = pathParam !== null
    ? `/${pathParam.replace(/^\/+/, '')}`
    : url.pathname.replace(new RegExp(`^(${PROXY_PREFIX}|/api/kluby-proxy)`), '')
  return handleKlubyProxy(request, pathname, params)
}
