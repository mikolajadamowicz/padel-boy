import { describe, expect, it } from 'vitest'

import { decodeEntities, parseClubList, parseParticipants, parseSchedule } from '../kluby/parsers'
import { splitKlubyName, toAppPlayerNames } from '../kluby/playerNames'
import { searchClubs } from '../kluby/client'

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
  ${clubItem('padel-&amp;-co', 985, 'Padel &amp; Co', 'Łódź, Piotrkowska 1')}
  ${clubItem('no-booking', 986, 'No Booking Club', 'Gdynia, Pucka 3', false)}
`

const scheduleHtml = `
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
`

const participant = (id: string, name: string) => `
  <a href="/gracze/@${id}?powrot=%2Fzatoka-test%2Frezerwacje%2F17031027%2Fuczestnicy" class="list-group-item ">
    <table><tr><td class="vert-align text-center" width="72px"><div class="gracz-avatar"><img src="/images_new/anonim.jpg" class="img-circle gracz-zdjecie"></div></td>
    <td class="vert-align"><h4 class="text-black nazwa_klubu m-top-0 m-bot-5">
      ${name}
    </h4><span class="text-muted text-nowrap"><i class="fa fa-map-marker fa-fw"></i> Gdańsk</span></td></tr></table>
  </a>`

const participantsHtml = `
  <a href="/gracze">Gracze</a>
  <h4>Lista uczestników <span class="badge bg-yellow">3/8</span>	</h4>
  <div class="list-group">
    ${participant('u1', 'Kowalski Jan')}
    ${participant('AnnaNW', 'Nowak-Wiśniewska Anna')}
    ${participant('u3', 'Zieli&#324;ski Piotr')}
    ${participant('u1', 'Kowalski Jan')}
  </div>`

describe('kluby parsers', () => {
  it('decodes HTML entities', () => {
    expect(decodeEntities('A &amp; B&nbsp;&#324;&#x142;')).toBe('A & B ńł'.replace(' ', ' '))
  })

  it('parses bookable clubs, deduplicated', () => {
    expect(parseClubList(clubListHtml)).toEqual([
      { slug: 'zatoka-test', name: 'Zatoka Test', city: 'Gdańsk', address: 'Gdańsk, Bysewska 30' },
    ])
  })

  it('parses schedule events for the given club, sorted by start', () => {
    expect(parseSchedule(scheduleHtml, 'zatoka-test')).toEqual([
      { id: '17031027', title: 'Americano & Mixt', start: '07:30', end: '09:30', participants: 8, capacity: 8 },
      { id: '17038270', title: 'Trening indywidualny', start: '08:00', end: '09:00', participants: 1, capacity: null },
    ])
  })

  it('parses participants and capacity', () => {
    expect(parseParticipants(participantsHtml)).toEqual({
      capacity: 8,
      participants: [
        { id: 'u1', name: 'Kowalski Jan' },
        { id: 'AnnaNW', name: 'Nowak-Wiśniewska Anna' },
        { id: 'u3', name: 'Zieliński Piotr' },
      ],
    })
  })

  it('returns empty results for unrelated pages', () => {
    expect(parseSchedule('<html></html>', 'zatoka-test')).toEqual([])
    expect(parseParticipants('<html></html>')).toEqual({ participants: [], capacity: null })
  })
})

describe('kluby player names', () => {
  it('splits "Surname First" names', () => {
    expect(splitKlubyName('Nowak-Wiśniewska Anna')).toEqual({ first: 'Anna', last: 'Nowak-Wiśniewska' })
    expect(splitKlubyName('Van Der Berg Tom')).toEqual({ first: 'Tom', last: 'Van Der Berg' })
    expect(splitKlubyName('Madonna')).toEqual({ first: 'Madonna', last: '' })
  })

  it('uses "First Last" when it fits, else "First L."', () => {
    expect(toAppPlayerNames(['Kowalski Jan', 'Nowak-Wiśniewska Anna'])).toEqual(['Jan Kowalski', 'Anna N.'])
  })

  it('avoids clashes with existing and imported names', () => {
    expect(toAppPlayerNames(['Nowak-Wiśniewska Anna', 'Nowakowska-Lis Anna'], ['anna n.'])).toEqual([
      'Anna No.',
      'Anna Now.',
    ])
    expect(toAppPlayerNames(['Kowalski Jan'], ['Jan Kowalski'])).toEqual(['Jan K.'])
  })

  it('falls back to a numeric suffix and never exceeds 16 chars', () => {
    const names = toAppPlayerNames(['Bartholomew', 'Bartholomew', 'Wolfeschlegelsteinhausen Maximilian'])
    expect(names).toEqual(['Bartholomew', 'Bartholomew 2', 'Maximilian W.'])
    names.forEach((name) => expect(name.length).toBeLessThanOrEqual(16))
  })
})

describe('kluby club search', () => {
  const clubs = [
    { slug: 'zatoka-padla', name: 'Zatoka Padla', city: 'Gdańsk', address: 'Gdańsk, Bysewska 30' },
    { slug: 'lodz-padel', name: 'Padel Łódź', city: 'Łódź', address: 'Łódź, Piotrkowska 1' },
  ]

  it('matches name or city, ignoring case and Polish diacritics', () => {
    expect(searchClubs('zatoka', clubs).map((c) => c.slug)).toEqual(['zatoka-padla'])
    expect(searchClubs('gdansk', clubs).map((c) => c.slug)).toEqual(['zatoka-padla'])
    expect(searchClubs('LODZ padel', clubs).map((c) => c.slug)).toEqual(['lodz-padel'])
    expect(searchClubs('  ', clubs)).toHaveLength(2)
  })
})
