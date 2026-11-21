// Turns kluby.org participants into app players. kluby.org lists players as
// "Surname Firstname" (or "Surname F." without a public profile); the app wants
// short names (max MAX_PLAYER_NAME_LENGTH) that are unique within a tournament.
import { MAX_PLAYERS, MAX_PLAYER_NAME_LENGTH } from '../../schemas/tournament'
import type { KlubyParticipant } from './parsers'

/** "Bocheńska-Szurek Iwona" -> { first: "Iwona", last: "Bocheńska-Szurek" } */
export function splitKlubyName(raw: string): { first: string; last: string } {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { first: parts[0] ?? '', last: '' }
  return { first: parts[parts.length - 1], last: parts.slice(0, -1).join(' ') }
}

/** Names to try, best first: "First Last", then "First L.", "First Lo.", ... */
function nameCandidates(raw: string): string[] {
  const trimmed = raw.trim().replace(/\s+/g, ' ')
  // Already abbreviated by kluby.org ("Broner F."): keep it as shown there.
  if (/\s\p{L}\.$/u.test(trimmed)) return [trimmed]

  const { first, last } = splitKlubyName(trimmed)
  if (!last) return [first]

  const candidates = [`${first} ${last}`]
  for (let i = 1; i < last.length; i++) {
    candidates.push(`${first} ${last.slice(0, i)}.`)
  }
  return candidates
}

/** "Kowalski Jan" -> "Jan Kowalski", before any shortening. */
function fullPlayerName(raw: string): string {
  return nameCandidates(raw)[0]
}

/**
 * Convert kluby.org names to app player names: prefer "First Last", shorten to
 * "First L." when too long, and avoid clashing with `existing` or each other.
 */
export function toAppPlayerNames(rawNames: string[], existing: string[] = []): string[] {
  const taken = new Set(existing.map((name) => name.toLowerCase()))
  const isFree = (name: string) => !taken.has(name.toLowerCase())

  return rawNames.map((raw) => {
    const candidates = nameCandidates(raw)
    const fitting = candidates.filter((name) => name.length <= MAX_PLAYER_NAME_LENGTH)
    let picked = fitting.find(isFree)

    if (!picked) {
      const base = fitting[0] ?? candidates[0].slice(0, MAX_PLAYER_NAME_LENGTH).trim()
      picked = isFree(base) ? base : undefined
      for (let n = 2; !picked; n++) {
        const suffix = ` ${n}`
        const candidate = `${base.slice(0, MAX_PLAYER_NAME_LENGTH - suffix.length).trim()}${suffix}`
        if (isFree(candidate)) picked = candidate
      }
    }

    taken.add(picked.toLowerCase())
    return picked
  })
}

export interface KlubyImportPlan {
  /** Participants to add, with the app name each one gets. */
  toAdd: { participant: KlubyParticipant; name: string }[]
  /** Participants already on the player list (imported before, or same full name). */
  alreadyListed: KlubyParticipant[]
  /** Participants left out because the tournament is full. */
  overLimit: KlubyParticipant[]
}

/** kluby.org profile id -> app name, for participants added by earlier imports. */
export type ImportedPlayers = ReadonlyMap<string, string>

/** Players without a public profile only have a per-page position as id, so they can't be tracked. */
const hasStableId = (participant: KlubyParticipant) => !participant.id.startsWith('anon-')

/**
 * Decide which participants to add to `players`. A participant counts as
 * already listed when an earlier import added them and their name is still on
 * the list, or when the list holds their full name (e.g. typed in by hand).
 */
export function planKlubyImport(
  participants: KlubyParticipant[],
  players: string[],
  imported: ImportedPlayers = new Map(),
  maxPlayers: number = MAX_PLAYERS,
): KlubyImportPlan {
  const listed = new Set(players.map((name) => name.toLowerCase()))
  const isListed = (participant: KlubyParticipant) => {
    const importedAs = imported.get(participant.id)
    return (importedAs !== undefined && listed.has(importedAs.toLowerCase()))
      || listed.has(fullPlayerName(participant.name).toLowerCase())
  }

  const alreadyListed = participants.filter(isListed)
  const fresh = participants.filter((participant) => !isListed(participant))
  const room = Math.max(maxPlayers - players.length, 0)
  const fitting = fresh.slice(0, room)
  const names = toAppPlayerNames(fitting.map((participant) => participant.name), players)

  return {
    toAdd: fitting.map((participant, i) => ({ participant, name: names[i] })),
    alreadyListed,
    overLimit: fresh.slice(room),
  }
}

/** Remember which kluby.org profiles the plan added, for the next import. */
export function recordImport(imported: ImportedPlayers, plan: KlubyImportPlan): Map<string, string> {
  const next = new Map(imported)
  for (const { participant, name } of plan.toAdd) {
    if (hasStableId(participant)) next.set(participant.id, name)
  }
  return next
}
