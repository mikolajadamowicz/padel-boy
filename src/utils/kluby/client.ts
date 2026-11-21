import clubsData from '../../data/klubyClubs.json'
import {
  parseParticipants,
  parseSchedule,
  type KlubyClub,
  type KlubyEvent,
  type KlubyParticipantList,
} from './parsers'

// kluby.org sends no CORS headers, so the browser has to go through a proxy:
// - dev: Vite's dev-server proxy (see vite.config.ts)
// - prod: the Cloudflare Worker in /worker, configured via VITE_KLUBY_PROXY_URL
const PROXY_BASE = (import.meta.env.DEV
  ? '/kluby-proxy'
  : import.meta.env.VITE_KLUBY_PROXY_URL ?? ''
).replace(/\/+$/, '')

export const isKlubyImportAvailable = PROXY_BASE.length > 0

/** Sport filter used by kluby.org schedules; 4 = padel. */
const PADEL_DISCIPLINE = 4

export const klubyClubs: KlubyClub[] = clubsData.clubs

export class KlubyError extends Error {}

async function fetchPage(path: string, signal?: AbortSignal): Promise<string> {
  if (!isKlubyImportAvailable) throw new KlubyError('kluby.org import is not configured')

  const response = await fetch(`${PROXY_BASE}${path}`, { signal })
  if (!response.ok) throw new KlubyError(`kluby.org responded with ${response.status}`)
  return response.text()
}

function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase()
}

export function searchClubs(query: string, clubs: KlubyClub[] = klubyClubs): KlubyClub[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return clubs

  return clubs.filter((club) => {
    const haystack = normalize(`${club.name} ${club.address} ${club.slug}`)
    return terms.every((term) => haystack.includes(term))
  })
}

export async function fetchClubEvents(clubSlug: string, date: string, signal?: AbortSignal): Promise<KlubyEvent[]> {
  const params = new URLSearchParams({ dyscyplina: String(PADEL_DISCIPLINE), data_grafiku: date })
  const html = await fetchPage(`/${encodeURIComponent(clubSlug)}/grafik?${params}`, signal)
  return parseSchedule(html, clubSlug)
}

export async function fetchEventParticipants(
  clubSlug: string,
  eventId: string,
  signal?: AbortSignal,
): Promise<KlubyParticipantList> {
  const html = await fetchPage(`/${encodeURIComponent(clubSlug)}/rezerwacje/${encodeURIComponent(eventId)}/uczestnicy`, signal)
  return parseParticipants(html)
}

export type { KlubyClub, KlubyEvent, KlubyParticipant, KlubyParticipantList } from './parsers'
