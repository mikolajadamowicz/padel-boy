// Kluby.org lists players as "Surname Firstname". The app wants short names
// (max 16 chars) that are unique within a tournament.

export const MAX_PLAYER_NAME_LENGTH = 16

/** "Bocheńska-Szurek Iwona" -> { first: "Iwona", last: "Bocheńska-Szurek" } */
export function splitKlubyName(raw: string): { first: string; last: string } {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { first: parts[0] ?? '', last: '' }
  return { first: parts[parts.length - 1], last: parts.slice(0, -1).join(' ') }
}

function nameCandidates(raw: string): string[] {
  const { first, last } = splitKlubyName(raw)
  if (!last) return [first]

  const candidates = [`${first} ${last}`]
  // "Iwona B.", "Iwona Bo.", ... - progressively longer surname initials
  for (let i = 1; i < last.length; i++) {
    candidates.push(`${first} ${last.slice(0, i)}.`)
  }
  return [...new Set(candidates)]
}

/**
 * Convert kluby.org names to app player names: prefer "First Last", shorten
 * to "First L." when too long, and avoid clashing with `existing` names.
 */
export function toAppPlayerNames(rawNames: string[], existing: string[] = []): string[] {
  const taken = new Set(existing.map((name) => name.toLowerCase()))
  const result: string[] = []

  for (const raw of rawNames) {
    // Candidates go full name first, then "First L.", "First Lo.", ...
    const fitting = nameCandidates(raw).filter((name) => name.length <= MAX_PLAYER_NAME_LENGTH)
    let picked = fitting.find((name) => !taken.has(name.toLowerCase()))

    if (!picked) {
      const base = (fitting[0] ?? raw.trim()).slice(0, MAX_PLAYER_NAME_LENGTH - 2).trim()
      for (let n = 2; !picked; n++) {
        const candidate = `${base} ${n}`
        if (!taken.has(candidate.toLowerCase())) picked = candidate
      }
    }

    taken.add(picked.toLowerCase())
    result.push(picked)
  }

  return result
}
