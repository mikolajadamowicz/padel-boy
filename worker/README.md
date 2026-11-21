# kluby.org proxy

The "Import from kluby.org" button on the Create page reads two public kluby.org
pages: a club's schedule and an event's participant list. kluby.org sends no
CORS headers, so the browser can't fetch them directly. Every deployment runs
the same handler, `src/utils/kluby/proxyHandler.ts`. It only forwards those two
pages (`src/utils/kluby/proxyRoutes.ts`), identifies itself as padel-boy and
never forwards the browser's cookies or headers.

| Where | What runs the proxy | Setup |
| --- | --- | --- |
| `npm run dev` / `npm run preview` | Vite middleware (`vite.config.ts`) | None |
| Vercel | `api/kluby-proxy.ts`, reached through the `vercel.json` rewrite | None |
| GitHub Pages or any other static host | This Cloudflare Worker | See below |

If a production build has no proxy (not on Vercel and `VITE_KLUBY_PROXY_URL`
unset), the import button is hidden.

## Deploy the Cloudflare Worker

1. Set `ALLOWED_ORIGINS` in `wrangler.toml` to the origin your app is served
   from, e.g. `https://<user>.github.io`. Requests from any other origin get a
   403 that names the origin.
2. Deploy:

   ```bash
   cd worker
   npx wrangler login
   npx wrangler deploy
   # -> https://padel-boy-kluby-proxy.<your-subdomain>.workers.dev
   ```

3. Build the app with the worker URL. For GitHub Pages, add `VITE_KLUBY_PROXY_URL`
   as a repository variable (Settings → Secrets and variables → Actions →
   Variables); the deploy workflow already passes it to the build. Locally:

   ```bash
   VITE_KLUBY_PROXY_URL=https://padel-boy-kluby-proxy.<your-subdomain>.workers.dev npm run build
   ```

The worker caches kluby.org responses for 60 seconds, but only on a custom
domain or route. Cloudflare's Cache API does nothing on `*.workers.dev`.

## Club list

Club search uses the bundled `src/data/klubyClubs.json`, which lists padel clubs
with online booking. Refresh it with `npm run kluby:clubs`.
