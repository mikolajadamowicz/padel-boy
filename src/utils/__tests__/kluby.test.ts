import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import clubsData from '../../data/klubyClubs.json'
import { decodeEntities, KlubyPageError, parseClubList, parseParticipants, parseSchedule } from '../kluby/parsers'
import { planKlubyImport, recordImport, splitKlubyName, toAppPlayerNames } from '../kluby/playerNames'
import { fetchClubEvents, fetchEventParticipants, searchClubs } from '../kluby/client'
import { handleKlubyProxy } from '../kluby/proxyHandler'
import { participantsPath, PROXY_PREFIX, schedulePath, toUpstreamUrl } from '../kluby/proxyRoutes'
import { MAX_PLAYER_NAME_LENGTH } from '../../schemas/tournament'

// Fixtures mirror kluby.org markup, with made-up names.

const clubItem = (slug: string, id: number, name: string, address: string, bookable = true) => `
  <a href="/${slug}?popularne_kluby=licznik_zapisana_lokalizacja&amp;portal_dyscyplina=4" class="list-group-item " style="padding:10px" data-lista-wiersz-id="klub_${id}">
    <table width="100%"><tr><td><img src="/upload/kluby/${id}/logo_small.jpg"></td><td>
      ${bookable ? '<span class="text-success pull-right"><i class="fa fa-square2 fa-fw"></i>REZERWUJ</span>' : ''}
      <h3 class="list-group-item-heading2 m-top-0 m-bot-5 ">
        ${name}						</h3>
      <p class="list-group-item-text ">
        ${address}
         (18,4 km)							<br>
        <span class="label label-default">6x Padel</span></p>
    </td></tr></table>
  </a>`

const clubListHtml = `
  ${clubItem('zatoka-test', 984, 'Zatoka Test', 'Gdańsk, Bysewska 30')}
  ${clubItem('zatoka-test', 984, 'Zatoka Test', 'Gdańsk, Bysewska 30')}
  ${clubItem('no-booking', 986, 'No Booking Club', 'Gdynia, Pucka 3', false)}
`

const scheduleHtml = `
  <table class="table table-bordered table-condensed table-hover table-grafik" id="grafik">
  <tr><td class="bg-gray text-muted">8:00</td>
    <td rowspan="2" class="kolor kolor-11">
      <a href="/zatoka-test/rezerwacje/17038270?powrot=grafik"> Trening indywidualny <br>08:00 - 09:00&nbsp;&nbsp;<span class="badge bg-yellow">1</span> </a>
    </td>
    <td rowspan="2" class="active rezerwacja_obca2"> Zarezerwowane <br>08:00 - 09:00 </td>
  </tr>
  <tr><td>
      <a href="/zatoka-test/rezerwacje/17031027?powrot=grafik"> Americano &amp; Mixt <br>7:30 - 9:30&nbsp;&nbsp;<span class="badge bg-yellow">8/8</span> </a>
  </td></tr>
  <a href="/zatoka-test/rezerwacje/17031027?powrot=grafik"> duplicate </a>
  <a href="/other-club/rezerwacje/1?powrot=grafik"> Other club <br>10:00 - 11:00</a>
  </table>
`

const beyondWindowHtml = '<div class="alert">W tym klubie można rezerwować na 14 dni do przodu. Przeniesiono do dnia ostatniego.</div>'

const linkedParticipant = (id: string, name: string) => `
  <a href="/gracze/@${id}?powrot=%2Fzatoka-test%2Frezerwacje%2F17031027%2Fuczestnicy" class="list-group-item ">
    <table><tr><td class="vert-align text-center" width="72px"><div class="gracz-avatar"><img src="/images_new/anonim.jpg" class="img-circle gracz-zdjecie"></div></td>
    <td class="vert-align"><h4 class="text-black nazwa_klubu m-top-0 m-bot-5">
      ${name}
    </h4><span class="text-muted text-nowrap"><i class="fa fa-map-marker fa-fw"></i> Gdańsk</span></td></tr></table>
  </a>`

const profilelessParticipant = (name: string) => `
  <div class="list-group-item ">
    <table width="100%" border="0"><tr>
      <td class="vert-align text-center" width="30px">7.</td>
      <td class="vert-align text-center" width="72px"><div class="gracz-avatar"><img src="/images_new/anonim.jpg" class="img-circle gracz-zdjecie"></div></td>
      <td class="vert-align"><h4 class="text-muted m-top-0 m-bot-0">${name}</h4></td>
    </tr></table>
  </div>`

const participantsHtml = `
  <a href="/gracze" class="list-group-item">Gracze</a>
  <h4>Lista uczestników <span class="badge bg-yellow">5/8</span>	</h4>
  <div class="list-group">
    ${linkedParticipant('u1', 'Kowalski Jan')}
    ${profilelessParticipant('Broner F.')}
    ${linkedParticipant('AnnaNW', 'Nowak-Wiśniewska Anna')}
    ${linkedParticipant('u3', 'Zieli&#324;ski Piotr')}
    ${linkedParticipant('u1', 'Kowalski Jan')}
  </div>
  <div class="list-group-item-text">Not a participant</div>`

describe('kluby parsers', () => {
  it('decodes HTML entities and leaves invalid code points alone', () => {
    expect(decodeEntities('A &amp; B&nbsp;&#324;&#x142;')).toBe('A & B ńł')
    expect(decodeEntities('x&#99999999;y&#x110000;')).toBe('x&#99999999;y&#x110000;')
  })

  it('parses bookable clubs, deduplicated', () => {
    expect(parseClubList(clubListHtml)).toEqual([
      { slug: 'zatoka-test', name: 'Zatoka Test', address: 'Gdańsk, Bysewska 30' },
    ])
  })

  it('parses schedule events for the given club, sorted by start', () => {
    expect(parseSchedule(scheduleHtml, 'zatoka-test')).toEqual([
      { id: '17031027', title: 'Americano & Mixt', start: '07:30', end: '09:30', participants: 8, capacity: 8 },
      { id: '17038270', title: 'Trening indywidualny', start: '08:00', end: '09:00', participants: 1, capacity: null },
    ])
  })

  it('treats days past the booking window as empty', () => {
    expect(parseSchedule(beyondWindowHtml, 'zatoka-test')).toEqual([])
  })

  it('parses participants, including players without a public profile', () => {
    expect(parseParticipants(participantsHtml)).toEqual({
      capacity: 8,
      participants: [
        { id: 'u1', name: 'Kowalski Jan' },
        { id: 'anon-1', name: 'Broner F.' },
        { id: 'AnnaNW', name: 'Nowak-Wiśniewska Anna' },
        { id: 'u3', name: 'Zieliński Piotr' },
      ],
    })
  })

  it('throws on pages without the expected structure instead of returning nothing', () => {
    expect(() => parseSchedule('<html>Zaloguj się</html>', 'zatoka-test')).toThrow(KlubyPageError)
    expect(() => parseParticipants('<html>Zaloguj się</html>')).toThrow(KlubyPageError)
  })
})

describe('kluby player names', () => {
  it('splits "Surname First" names', () => {
    expect(splitKlubyName('Nowak-Wiśniewska Anna')).toEqual({ first: 'Anna', last: 'Nowak-Wiśniewska' })
    expect(splitKlubyName('Van Der Berg Tom')).toEqual({ first: 'Tom', last: 'Van Der Berg' })
    expect(splitKlubyName('Madonna')).toEqual({ first: 'Madonna', last: '' })
  })

  it('uses "First Last" when it fits, else "First L.", and keeps kluby.org abbreviations', () => {
    expect(toAppPlayerNames(['Kowalski Jan', 'Nowak-Wiśniewska Anna', 'Broner F.'])).toEqual([
      'Jan Kowalski',
      'Anna N.',
      'Broner F.',
    ])
  })

  it('avoids clashes with existing and imported names', () => {
    expect(toAppPlayerNames(['Nowak-Wiśniewska Anna', 'Nowakowska-Lis Anna'], ['anna n.'])).toEqual([
      'Anna No.',
      'Anna Now.',
    ])
    expect(toAppPlayerNames(['Kowalski Jan'], ['Jan Kowalski'])).toEqual(['Jan K.'])
  })

  it('falls back to a truncated "First Last" name, numbered only on clashes', () => {
    expect(toAppPlayerNames(['Cdefghijklmnop Abcdefghijklmnopq'])).toEqual(['Abcdefghijklmnop'])
    expect(toAppPlayerNames(['Aleksandrowiczowna'])).toEqual(['Aleksandrowiczow'])
    expect(toAppPlayerNames(['Bartholomew', 'Bartholomew'])).toEqual(['Bartholomew', 'Bartholomew 2'])
  })

  it('never exceeds the name length limit, even past nine clashes', () => {
    const names = toAppPlayerNames(Array.from({ length: 12 }, () => 'Aleksandrowiczowna'))
    expect(new Set(names).size).toBe(12)
    expect(names[11]).toBe('Aleksandrowic 12')
    names.forEach((name) => expect(name.length).toBeLessThanOrEqual(MAX_PLAYER_NAME_LENGTH))
  })
})

describe('kluby import plan', () => {
  const jan = { id: 'u1', name: 'Kowalski Jan' }
  const annaA = { id: 'u2', name: 'Nowak-Wiśniewska Anna' }
  const annaB = { id: 'u3', name: 'Nowakowska-Lis Anna' }

  it('adds everyone to an empty list', () => {
    const plan = planKlubyImport([jan, annaA], [])
    expect(plan.toAdd.map((a) => a.name)).toEqual(['Jan Kowalski', 'Anna N.'])
    expect(plan.alreadyListed).toEqual([])
    expect(plan.overLimit).toEqual([])
  })

  it('skips people added by an earlier import, matched by kluby.org id', () => {
    const first = planKlubyImport([annaA], [])
    const imported = recordImport(new Map(), first)
    const players = first.toAdd.map((a) => a.name)

    const again = planKlubyImport([annaA, jan], players, imported)
    expect(again.alreadyListed).toEqual([annaA])
    expect(again.toAdd.map((a) => a.name)).toEqual(['Jan Kowalski'])
  })

  it('keeps a different person whose short name clashes, and renames them', () => {
    const imported = recordImport(new Map(), planKlubyImport([annaB], []))
    const plan = planKlubyImport([annaA], ['Anna N.'], imported)
    expect(plan.alreadyListed).toEqual([])
    expect(plan.toAdd.map((a) => a.name)).toEqual(['Anna No.'])
  })

  it('treats a typed-in full name as the same person', () => {
    expect(planKlubyImport([jan], ['jan kowalski']).alreadyListed).toEqual([jan])
  })

  it('re-imports someone whose name was removed from the list', () => {
    const imported = recordImport(new Map(), planKlubyImport([jan], []))
    expect(planKlubyImport([jan], [], imported).toAdd.map((a) => a.name)).toEqual(['Jan Kowalski'])
  })

  it('stops at the player limit', () => {
    const plan = planKlubyImport([jan, annaA, annaB], ['A', 'B'], new Map(), 3)
    expect(plan.toAdd.map((a) => a.participant)).toEqual([jan])
    expect(plan.overLimit).toEqual([annaA, annaB])
  })

  it('does not remember players without a stable kluby.org id', () => {
    const plan = planKlubyImport([{ id: 'anon-3', name: 'Broner F.' }], [])
    expect(recordImport(new Map(), plan).size).toBe(0)
  })
})

describe('kluby club search', () => {
  const clubs = [
    { slug: 'zatoka-padla', name: 'Zatoka Padla', address: 'Gdańsk, Bysewska 30' },
    { slug: 'lodz-padel', name: 'Padel Łódź', address: 'Łódź, Piotrkowska 1' },
  ]

  it('matches name or address, ignoring case and Polish diacritics', () => {
    expect(searchClubs('zatoka', clubs).map((c) => c.slug)).toEqual(['zatoka-padla'])
    expect(searchClubs('gdansk', clubs).map((c) => c.slug)).toEqual(['zatoka-padla'])
    expect(searchClubs('LODZ padel', clubs).map((c) => c.slug)).toEqual(['lodz-padel'])
    expect(searchClubs('  ', clubs)).toHaveLength(2)
  })
})

describe('kluby proxy contract', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('allows exactly the pages the client requests', () => {
    const schedule = new URL(schedulePath('zatoka-padla', '2026-11-21'), 'http://x')
    expect(toUpstreamUrl(schedule.pathname, schedule.searchParams)?.toString())
      .toBe('https://kluby.org/zatoka-padla/grafik?dyscyplina=4&data_grafiku=2026-11-21')
    expect(toUpstreamUrl(participantsPath('zatoka-padla', '17031027'), new URLSearchParams())?.toString())
      .toBe('https://kluby.org/zatoka-padla/rezerwacje/17031027/uczestnicy')
  })

  it('rejects other pages and drops unknown query keys', () => {
    expect(toUpstreamUrl('/logowanie', new URLSearchParams())).toBeNull()
    expect(toUpstreamUrl('/zatoka-padla/rezerwacje/17031027', new URLSearchParams())).toBeNull()
    expect(toUpstreamUrl('/zatoka-padla/rezerwacje/abc/uczestnicy', new URLSearchParams())).toBeNull()
    expect(toUpstreamUrl('/zatoka-padla/grafik', new URLSearchParams('evil=1&dyscyplina=4'))?.search).toBe('?dyscyplina=4')
  })

  it('accepts every bundled club slug', () => {
    const rejected = clubsData.clubs.filter((club) => !toUpstreamUrl(`/${club.slug}/grafik`, new URLSearchParams()))
    expect(rejected).toEqual([])
  })

  it('routes the client through the proxy prefix that vercel.json rewrites', async () => {
    const vercel = JSON.parse(readFileSync(`${process.cwd()}/vercel.json`, 'utf8')) as { rewrites: { source: string }[] }
    expect(vercel.rewrites.map((r) => r.source)).toContain(`${PROXY_PREFIX}/:path*`)

    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(participantsHtml))
    vi.stubGlobal('fetch', fetchMock)
    await fetchEventParticipants('zatoka-padla', '17031027', new AbortController().signal)
    await fetchClubEvents('zatoka-padla', '2026-11-21', new AbortController().signal).catch(() => {})
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      `${PROXY_PREFIX}/zatoka-padla/rezerwacje/17031027/uczestnicy`,
      `${PROXY_PREFIX}/zatoka-padla/grafik?dyscyplina=4&data_grafiku=2026-11-21`,
    ])
  })
})

describe('kluby proxy handler', () => {
  afterEach(() => vi.unstubAllGlobals())

  const call = (path: string, init: RequestInit = {}, options = {}) => {
    const url = new URL(path, 'https://app.example')
    return handleKlubyProxy(new Request(url, init), url.pathname, url.searchParams, options)
  }

  it('fetches allowed pages with its own user agent, never the browser headers', async () => {
    const fetchMock = vi.fn(async () => new Response('<html>ok</html>'))
    vi.stubGlobal('fetch', fetchMock)

    const response = await call('/zatoka-padla/grafik?dyscyplina=4&evil=1', { headers: { Cookie: 'secret=1' } })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('<html>ok</html>')

    const [upstreamUrl, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(String(upstreamUrl)).toBe('https://kluby.org/zatoka-padla/grafik?dyscyplina=4')
    expect(init.headers).toEqual({ 'User-Agent': 'padel-boy (kluby.org participant import)', Accept: 'text/html' })
  })

  it('answers 404 for other pages and 502 when kluby.org fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })))
    expect((await call('/logowanie')).status).toBe(404)
    const failed = await call('/zatoka-padla/rezerwacje/1/uczestnicy')
    expect(failed.status).toBe(502)
    expect(await failed.text()).toBe('kluby.org responded with 503')
  })

  it('allows listed and same-origin callers, and explains a rejected origin', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok')))
    const allowed = await call('/a/grafik', { headers: { Origin: 'https://site.example' } }, { allowedOrigins: ['https://site.example'] })
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://site.example')
    expect((await call('/a/grafik', { headers: { Origin: 'https://app.example' } })).status).toBe(200)

    const rejected = await call('/a/grafik', { headers: { Origin: 'https://other.example' } })
    expect(rejected.status).toBe(403)
    expect(await rejected.text()).toContain('ALLOWED_ORIGINS')
  })
})
