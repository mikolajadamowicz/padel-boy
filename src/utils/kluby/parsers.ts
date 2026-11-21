// Parsers for public kluby.org HTML pages. Kluby.org has no public API, so we
// read the same server-rendered pages a visitor sees without logging in.
// Regex-based on purpose: runs the same in the browser, vitest and Node scripts.
// The schedule and participant parsers throw KlubyPageError when the page lacks
// the structure they expect, so a kluby.org redesign shows up as an error in the
// UI instead of a believable "nobody signed up".
import { CLUB_SLUG_PATTERN } from './proxyRoutes'

export class KlubyPageError extends Error {}

export interface KlubyClub {
  slug: string
  name: string
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
  /** kluby.org profile id, or `anon-<position>` for players without a public profile. */
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
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
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
  const itemRe = new RegExp(
    `<a href="/(${CLUB_SLUG_PATTERN})\\?popularne_kluby=[^"]*"[^>]*data-lista-wiersz-id="klub_\\d+"[^>]*>([\\s\\S]*?)</a>`,
    'g',
  )

  for (const [, slug, block] of html.matchAll(itemRe)) {
    if (clubs.has(slug) || !/REZERWUJ/.test(block)) continue

    const name = toText(block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/)?.[1] ?? '') || slug
    const addressHtml = block.match(/<p[^>]*list-group-item-text[^>]*>([\s\S]*?)(?:<br|<\/p>)/)?.[1] ?? ''
    const address = toText(addressHtml).replace(/\s*\([\d.,\s]+km\)\s*$/, '')

    clubs.set(slug, { slug, name, address })
  }

  return [...clubs.values()]
}

/** kluby.org shows this notice instead of the grid for days past the club's booking window. */
const BEYOND_BOOKING_WINDOW = /można rezerwować na \d+ dni do przodu/

/** Club schedule page: /{club}/grafik?dyscyplina=4&data_grafiku=YYYY-MM-DD */
export function parseSchedule(html: string, clubSlug: string): KlubyEvent[] {
  if (!/id="grafik"/.test(html)) {
    if (BEYOND_BOOKING_WINDOW.test(html)) return []
    throw new KlubyPageError('Schedule grid not found on the kluby.org page')
  }

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
  const heading = html.match(/Lista uczestnik[\s\S]{0,40}?<span[^>]*badge[^>]*>([\s\S]*?)<\/span>/)
  if (!heading || heading.index === undefined) {
    throw new KlubyPageError('Participant list not found on the kluby.org page')
  }

  // Players with a public profile are <a href="/gracze/@id" class="list-group-item">;
  // players without one are plain <div class="list-group-item"> with a muted name.
  const section = html.slice(heading.index)
  const itemStartRe = /<(?:a href="\/gracze\/@([^"?]+)[^"]*"[^>]*|div)\s+class="list-group-item(?:\s[^"]*)?"[^>]*>/g
  const starts = [...section.matchAll(itemStartRe)]

  const participants: KlubyParticipant[] = []
  const seen = new Set<string>()
  starts.forEach((start, position) => {
    const end = starts[position + 1]?.index ?? section.length
    const block = section.slice(start.index, end)
    const nameHtml = block.match(/<h4[^>]*(?:nazwa_klubu|text-muted)[^>]*>([\s\S]*?)<\/h4>/)?.[1]
    const name = nameHtml ? toText(nameHtml) : ''
    const id = start[1] ?? `anon-${position}`
    if (!name || seen.has(id)) return
    seen.add(id)
    participants.push({ id, name })
  })

  return { participants, capacity: parseCount(heading[1]).capacity }
}
