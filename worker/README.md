# kluby.org proxy

The "Import from kluby.org" button on the Create page reads public kluby.org
pages (club schedule and event participant list). kluby.org sends no CORS
headers, so the browser can't fetch them directly from the app.

- **Dev:** `npm run dev` proxies `/kluby-proxy/*` to kluby.org through Vite, so nothing to set up.
- **Prod:** deploy this Cloudflare Worker and point the app at it.

The worker only forwards the two public page shapes the feature uses, adds CORS
headers for the origins in `ALLOWED_ORIGINS`, and caches responses for 60 s.

## Deploy

```bash
cd worker
npx wrangler login
npx wrangler deploy
# -> https://padel-boy-kluby-proxy.<your-subdomain>.workers.dev
```

Then build the app with the worker URL:

```bash
VITE_KLUBY_PROXY_URL=https://padel-boy-kluby-proxy.<your-subdomain>.workers.dev npm run build
```

For GitHub Pages, add `VITE_KLUBY_PROXY_URL` as a repository variable
(Settings → Secrets and variables → Actions → Variables). The deploy workflow
already passes it to the build. If it's not set, the import button is hidden in
production builds.

## Club list

Club search uses the bundled `src/data/klubyClubs.json` (padel clubs with online
booking). Refresh it with `npm run kluby:clubs`.
