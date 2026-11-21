import clubsData from '../../data/klubyClubs.json'
import { KLUBY_PROXY_URL } from './availability'
import { parseParticipants, parseSchedule, type KlubyClub, type KlubyEvent, type KlubyParticipantList } from './parsers'
import { participantsPath, schedulePath } from './proxyRoutes'

export const klubyClubs: KlubyClub[] = clubsData.clubs

const REQUEST_TIMEOUT_MS = 15_000

async function fetchPage(path: string, signal: AbortSignal): Promise<string> {
  // Give up after REQUEST_TIMEOUT_MS so a hung proxy ends in the error state, not an endless spinner.
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, REQUEST_TIMEOUT_MS)
  signal.addEventListener('abort', abort)

  try {
    const response = await fetch(`${KLUBY_PROXY_URL}${path}`, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`kluby.org proxy (${KLUBY_PROXY_URL}) responded with ${response.status}: ${await response.text()}`)
    }
    return await response.text()
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase()
}

export function searchClubs(query: string, clubs: KlubyClub[] = klubyClubs): KlubyClub[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return clubs

  return clubs.filter((club) => {
    const haystack = normalize(`${club.name} ${club.address} ${club.slug}`)
    return terms.every((term) => haystack.includes(term))
  })
}

export async function fetchClubEvents(clubSlug: string, date: string, signal: AbortSignal): Promise<KlubyEvent[]> {
  return parseSchedule(await fetchPage(schedulePath(clubSlug, date), signal), clubSlug)
}

export async function fetchEventParticipants(clubSlug: string, eventId: string, signal: AbortSignal): Promise<KlubyParticipantList> {
  return parseParticipants(await fetchPage(participantsPath(clubSlug, eventId), signal))
}

export type { KlubyClub, KlubyEvent, KlubyParticipant, KlubyParticipantList } from './parsers'
