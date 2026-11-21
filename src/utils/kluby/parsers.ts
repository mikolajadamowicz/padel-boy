// Parsers for public kluby.org HTML pages. Kluby.org has no public API, so we
// read the same server-rendered pages a visitor sees without logging in.
// Regex-based on purpose: runs the same in the browser, vitest and Node scripts.

export interface KlubyClub {
  slug: string
  name: string
  city: string
  address: string
}

export interface KlubyEvent {
  id: string
  title: string
  start: string
  end: string
  participants: number | null
  capacity: number | null
}

export interface KlubyParticipant {
  id: string
  name: string
}

export interface KlubyParticipantList {
  participants: KlubyParticipant[]
  capacity: number | null
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

function toText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function parseCount(text: string | undefined): { count: number | null; capacity: number | null } {
  const match = text?.match(/(\d+)\s*(?:\/\s*(\d+))?/)
  if (!match) return { count: null, capacity: null }
  return {
    count: Number(match[1]),
    capacity: match[2] ? Number(match[2]) : null,
  }
}

/** Club listing pages, e.g. /padel/kluby/pomorskie. Only clubs with online booking are returned. */
export function parseClubList(html: string): KlubyClub[] {
  const clubs = new Map<string, KlubyClub>()
  const itemRe = /<a href="\/([a-z0-9-]+)\?popularne_kluby=[^"]*"[^>]*data-lista-wiersz-id="klub_\d+"[^>]*>([\s\S]*?)<\/a>/g

  for (const [, slug, block] of html.matchAll(itemRe)) {
    if (clubs.has(slug) || !/REZERWUJ/.test(block)) continue

    const name = toText(block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? '') || slug
    const addressHtml = block.match(/<p[^>]*list-group-item-text[^>]*>([\s\S]*?)(?:<br|<\/p>)/)?.[1] ?? ''
    const address = toText(addressHtml).replace(/\s*\([\d.,\s]+km\)\s*$/, '')
    const city = address.split(',')[0]?.trim() ?? ''

    clubs.set(slug, { slug, name, city, address })
  }

  return [...clubs.values()]
}

/** Club schedule page: /{club}/grafik?dyscyplina=4&data_grafiku=YYYY-MM-DD */
export function parseSchedule(html: string, clubSlug: string): KlubyEvent[] {
  const events = new Map<string, KlubyEvent>()
  const escapedSlug = clubSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const linkRe = new RegExp(`<a href="/${escapedSlug}/rezerwacje/(\\d+)\\?powrot=grafik"[^>]*>([\\s\\S]*?)</a>`, 'g')

  for (const [, id, inner] of html.matchAll(linkRe)) {
    if (events.has(id)) continue

    const [titleHtml = '', restHtml = ''] = inner.split(/<br\s*\/?>/i)
    const time = toText(restHtml).match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
    const { count, capacity } = parseCount(restHtml.match(/<span[^>]*badge[^>]*>([\s\S]*?)<\/span>/)?.[1])

    events.set(id, {
      id,
      title: toText(titleHtml),
      start: time?.[1].padStart(5, '0') ?? '',
      end: time?.[2].padStart(5, '0') ?? '',
      participants: count,
      capacity,
    })
  }

  return [...events.values()].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
}

/** Public participant list: /{club}/rezerwacje/{id}/uczestnicy */
export function parseParticipants(html: string): KlubyParticipantList {
  const participants: KlubyParticipant[] = []
  const seen = new Set<string>()
  const itemRe = /<a href="\/gracze\/@([^"?]+)[^"]*"[^>]*class="list-group-item[^"]*"[^>]*>([\s\S]*?)<\/a>/g

  for (const [, id, block] of html.matchAll(itemRe)) {
    if (seen.has(id)) continue
    const name = toText(block.match(/<h4[^>]*nazwa_klubu[^>]*>([\s\S]*?)<\/h4>/)?.[1] ?? '')
    if (!name) continue
    seen.add(id)
    participants.push({ id, name })
  }

  const badge = html.match(/Lista uczestnik[\s\S]{0,40}?<span[^>]*badge[^>]*>([\s\S]*?)<\/span>/)?.[1]
  return { participants, capacity: parseCount(badge).capacity }
}
