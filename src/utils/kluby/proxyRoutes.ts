// The one owner of the kluby.org proxy contract: which public pages the app
// reads and how their URLs look. Used by the client (to build requests), the
// club-list parser (slug shape) and the proxy handler (to allow requests).

export const KLUBY_ORIGIN = 'https://kluby.org'
export const KLUBY_USER_AGENT = 'padel-boy (kluby.org participant import)'

/** URL prefix the app calls on its own origin (dev server, Vercel). */
export const PROXY_PREFIX = '/kluby-proxy'

/** Club slugs as kluby.org uses them, e.g. "zatoka-padla". */
export const CLUB_SLUG_PATTERN = '[a-z0-9-]+'

/** kluby.org sport filter for schedules; 4 = padel. */
const PADEL_DISCIPLINE = '4'

const ALLOWED_PATHS = [
  new RegExp(`^/${CLUB_SLUG_PATTERN}/grafik$`),
  new RegExp(`^/${CLUB_SLUG_PATTERN}/rezerwacje/\\d+/uczestnicy$`),
]
const ALLOWED_QUERY_KEYS = new Set(['dyscyplina', 'data_grafiku'])

/** Club schedule for one day: /{club}/grafik?dyscyplina=4&data_grafiku=YYYY-MM-DD */
export function schedulePath(clubSlug: string, date: string): string {
  const params = new URLSearchParams({ dyscyplina: PADEL_DISCIPLINE, data_grafiku: date })
  return `/${encodeURIComponent(clubSlug)}/grafik?${params}`
}

/** Public participant list: /{club}/rezerwacje/{id}/uczestnicy */
export function participantsPath(clubSlug: string, eventId: string): string {
  return `/${encodeURIComponent(clubSlug)}/rezerwacje/${encodeURIComponent(eventId)}/uczestnicy`
}

/**
 * Maps a proxied path + query to the kluby.org URL to fetch, or null when the
 * path is not one of the allowed pages. Unknown query keys are dropped.
 */
export function toUpstreamUrl(pathname: string, searchParams: URLSearchParams): URL | null {
  if (!ALLOWED_PATHS.some((re) => re.test(pathname))) return null

  const upstream = new URL(pathname, KLUBY_ORIGIN)
  for (const [key, value] of searchParams) {
    if (ALLOWED_QUERY_KEYS.has(key)) upstream.searchParams.set(key, value)
  }
  return upstream
}
