// Rebuilds src/data/klubyClubs.json from kluby.org's public padel club listings.
// Run: npm run kluby:clubs
import fs from 'node:fs'
import path from 'node:path'

import { parseClubList, type KlubyClub } from '../parsers'

const REGIONS = [
  'dolnoslaskie', 'kujawsko-pomorskie', 'lubelskie', 'lubuskie', 'lodzkie', 'malopolskie',
  'mazowieckie', 'opolskie', 'podkarpackie', 'podlaskie', 'pomorskie', 'slaskie',
  'swietokrzyskie', 'warminsko-mazurskie', 'wielkopolskie', 'zachodniopomorskie',
]

const OUTPUT = path.resolve(import.meta.dirname, '../../../data/klubyClubs.json')

async function main() {
  const clubs = new Map<string, KlubyClub>()

  for (const region of REGIONS) {
    const response = await fetch(`https://kluby.org/padel/kluby/${region}`, {
      headers: { 'User-Agent': 'padel-boy club index' },
    })
    if (!response.ok) throw new Error(`${region}: HTTP ${response.status}`)

    const found = parseClubList(await response.text())
    for (const club of found) clubs.set(club.slug, club)
    console.log(`${region}: ${found.length}`)

    // Be polite: one request per second.
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  const sorted = [...clubs.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl'))
  fs.writeFileSync(OUTPUT, `${JSON.stringify({ clubs: sorted }, null, 2)}\n`)
  console.log(`Wrote ${sorted.length} clubs to ${path.relative(process.cwd(), OUTPUT)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
