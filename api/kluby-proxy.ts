// Vercel Function wrapper around the shared kluby.org proxy handler.
// vercel.json rewrites /kluby-proxy/<path> to /api/kluby-proxy?path=<path>.
import { handleKlubyProxy } from '../src/utils/kluby/proxyHandler'

export function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  const pathname = `/${params.get('path') ?? ''}`
  params.delete('path')
  return handleKlubyProxy(request, pathname, params)
}
