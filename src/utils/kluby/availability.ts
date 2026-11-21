// Kept apart from client.ts so checking availability doesn't pull the bundled
// club list into the page. The URL is chosen in vite.config.ts.
export const KLUBY_PROXY_URL = __KLUBY_PROXY_URL__.replace(/\/+$/, '')

/** False on builds with no kluby.org proxy; the import button is hidden then. */
export const isKlubyImportAvailable = KLUBY_PROXY_URL.length > 0
