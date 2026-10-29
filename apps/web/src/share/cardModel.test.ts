// @vitest-environment jsdom
import type { AnalysisResult } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import { describe, expect, it } from 'vitest'
import type { AthleteSettings, EffortCheck, Sport } from '@rca/core/types'
import type { Period } from '@rca/core/period'
import type { BalanceGap } from '../ui/balanceGap'
import { energyReading, gapReading } from '../ui/components/balanceScale'
import { makeActivity, makeResult } from '../ui/components/fixtures'
import { balanceTitle, leadSentence } from '../ui/components/headlineText'
import type { GradeOutcome } from '../ui/grades'
import { SPORT_ORDER } from '../ui/sports'
import { buildShareCard, shareableHost } from './cardModel'

/** The card for these inputs: a weight is entered, and there is no heart-rate effort or grade gap unless given. */
/** A period of the given days, or all time for null, with no dates: the card's own tests pass days. */
function periodOfDays(days: number | null): Period {
  return { choice: days ?? 'all', startMs: null, endMs: null, days, fellBack: false }
}

function cardFor(
  result: AnalysisResult,
  settings: AthleteSettings,
  units: UnitSystem,
  days: number | null,
  isSample: boolean,
  effort: EffortCheck | null = null,
  weightKnown = true,
  gap: BalanceGap | null = null,
  grades: Record<Sport, GradeOutcome | null> = NO_GRADES,
  name: string | null = null,
) {
  return buildShareCard(
    result,
    settings,
    units,
    periodOfDays(days),
    isSample,
    effort,
    weightKnown,
    gap,
    grades,
    name,
  )
}

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const LOW_EFFORT: EffortCheck = { durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 }
const NO_GRADES: Record<Sport, GradeOutcome | null> = { run: null, ride: null }
/** A run graded Local at 64%, as the page grades it. */
const RUN_GRADE: GradeOutcome = {
  kind: 'graded',
  age: 37,
  grade: { centre: { grade: 0.64, level: 'Local' }, range: null },
}
/** A ride graded through its running equivalent: Recreational to Local, 61%, range 55 to 67%. */
const RIDE_GRADE: GradeOutcome = {
  kind: 'graded',
  age: 37,
  grade: {
    centre: { grade: 0.61, level: 'Recreational' },
    range: { low: { grade: 0.55, level: 'Recreational' }, high: { grade: 0.67, level: 'Local' } },
  },
}
const GRADED_FOOTNOTE = 'Graded on the USATF road standards. A level, not a ranking.'
const ESTIMATE_FOOTNOTE = 'Estimated from your files. Not a ranking.'

describe('buildShareCard', () => {
  it('uses the app name as the title', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.title).toBe('Running Cycling Analysis')
  })

  it('states the headline exactly as the results page does, and the balance it leans to', () => {
    const result = makeResult()
    const card = cardFor(result, SETTINGS, 'metric', 42, false)
    const point = result.comparison.prior[0]
    expect(point).toBeDefined()
    if (!point) return
    expect(card?.headline).toBe(balanceTitle(energyReading(point.ratio)))
    expect(card?.headline).toBe('Your balance leans toward running')
    expect(card?.meter).toEqual(energyReading(point.ratio))
  })

  it('states the headline and the meter from the grade gap when there is one', () => {
    const result = makeResult()
    const gap: BalanceGap = { centre: -6, low: -10, high: -2, lean: 'ride' }
    const card = cardFor(result, SETTINGS, 'metric', 42, false, null, true, gap)
    expect(card?.headline).toBe('Your balance leans toward cycling')
    expect(card?.meter).toEqual(gapReading(gap))
  })

  it('lists the heroes in the order the sport order gives, so the columns match the meter', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.heroes.map((hero) => hero.sport)).toEqual([...SPORT_ORDER])
  })

  it('has no card while the sports cannot be compared, so no "needs harder efforts" card is shared', () => {
    const card = cardFor(
      makeResult({ comparison: { prior: [], calibrated: null } }),
      SETTINGS,
      'metric',
      42,
      false,
      null,
      true,
    )
    expect(card).toBeNull()
  })

  it('gives a one-line effort caveat when the heart-rate check found a low effort', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false, LOW_EFFORT)
    expect(card?.caveat).toBe('Best efforts over 20 min did not reach a hard heart rate.')
  })

  it('has no effort caveat without an effort check or when the efforts were high', () => {
    expect(cardFor(makeResult(), SETTINGS, 'metric', 42, false)?.caveat).toBeNull()
    const high: EffortCheck = { durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.95 }
    expect(cardFor(makeResult(), SETTINGS, 'metric', 42, false, high)?.caveat).toBeNull()
  })

  it('uses the page units for the running threshold pace', () => {
    const metric = cardFor(makeResult(), SETTINGS, 'metric', 42, false)
    const imperial = cardFor(makeResult(), SETTINGS, 'imperial', 42, false)
    expect(metric?.heroes[0]).toMatchObject({
      label: 'Threshold flat pace, estimated from your best 3 to 20 min',
      figure: { number: '23:23', unit: '/km' },
    })
    expect(imperial?.heroes[0]?.figure).toEqual({ number: '37:38', unit: '/mi' })
  })

  it('names each threshold as estimated from the best 3 to 20 min efforts, a run as flat pace', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.heroes.map((hero) => hero.label)).toEqual([
      'Threshold flat pace, estimated from your best 3 to 20 min',
      'Threshold power, estimated from your best 3 to 20 min',
    ])
  })

  it('shows the cycling threshold power in watts, with W/kg for the body mass in the settings', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.heroes[1]).toMatchObject({
      label: 'Threshold power, estimated from your best 3 to 20 min',
      figure: { number: '48', unit: 'W' },
      sub: '0.6 W/kg',
    })
  })

  it('shows both sports in running then cycling order', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.heroes.map((hero) => hero.sport)).toEqual(['run', 'ride'])
  })

  it('has no card when the run has no threshold, even with a comparison, so no image asks for more', () => {
    expect(cardFor(makeResult({ runCp: null }), SETTINGS, 'metric', 42, false)).toBeNull()
  })

  it('has no card when the ride has no threshold, even with a comparison, so no image asks for more', () => {
    expect(cardFor(makeResult({ rideCp: null }), SETTINGS, 'metric', 42, false)).toBeNull()
  })

  it('has no card while only one sport is on file, so no one-sport card is shared', () => {
    const card = cardFor(
      makeResult({
        activities: [makeActivity({ id: 'run-1', sport: 'run' })],
        comparison: { prior: [], calibrated: null },
        rideCp: null,
      }),
      SETTINGS,
      'metric',
      42,
      false,
      null,
      true,
    )
    expect(card).toBeNull()
  })

  it('has no card when both sports are on file but no balance can be stated yet', () => {
    const card = cardFor(
      makeResult({ comparison: { prior: [], calibrated: null } }),
      SETTINGS,
      'metric',
      42,
      false,
    )
    expect(card).toBeNull()
  })

  it('names each sport level and whole percent on its hero, as the grade line does', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false, null, true, null, {
      run: RUN_GRADE,
      ride: RIDE_GRADE,
    })
    expect(card?.heroes.map((hero) => hero.grade)).toEqual([
      'Local · 64% on best 20 min',
      'Recreational · 61% on best 20 min',
    ])
  })

  it('leaves a grade off its hero while the page holds it, and the level line empty', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false, null, true, null, {
      run: RUN_GRADE,
      ride: null,
    })
    expect(card?.heroes.map((hero) => hero.grade)).toEqual(['Local · 64% on best 20 min', null])
  })

  it('carries the balance as a magnitude line in points, with its range', () => {
    const gap: BalanceGap = { centre: 6, low: 4, high: 8, lean: 'run' }
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false, null, true, gap)
    expect(card?.magnitude).toBe('Running grades 6 points higher than cycling')
    // The page's meter reads its lead with the same helper, so the card and the page agree.
    expect(card?.magnitude).toBe(leadSentence(gapReading(gap)))
  })

  it('has no magnitude line for a balance in range, where the headline already says so', () => {
    const gap: BalanceGap = { centre: 1, low: -2, high: 4, lean: 'even' }
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false, null, true, gap)
    expect(card?.magnitude).toBeNull()
  })

  it('returns nothing when there is no comparison and no threshold, so the button is hidden', () => {
    const card = cardFor(
      makeResult({
        activities: [makeActivity({ sport: 'run' })],
        comparison: { prior: [], calibrated: null },
        runCp: null,
        rideCp: null,
      }),
      SETTINGS,
      'metric',
      42,
      false,
      null,
      true,
    )
    expect(card).toBeNull()
  })

  it('dates the period on the card and says what it counts', () => {
    const period: Period = {
      choice: 42,
      startMs: new Date(2025, 4, 12, 12).getTime(),
      endMs: new Date(2025, 7, 3, 12).getTime(),
      days: 42,
      fellBack: false,
    }
    const result = makeResult({
      activities: [1, 2, 3].flatMap((n) => [
        makeActivity({ id: `run-${n}` }),
        makeActivity({ id: `ride-${n}`, sport: 'ride' }),
      ]),
    })
    expect(
      buildShareCard(result, SETTINGS, 'metric', period, false, null, true, null, NO_GRADES)
        ?.period,
    ).toBe('Based on 12 May – 3 Aug 2025, 3 runs, 3 rides')
  })

  it('carries the name the card is given, and none when there is no name', () => {
    const result = makeResult()
    expect(
      cardFor(result, SETTINGS, 'metric', 42, false, null, true, null, NO_GRADES, 'Bryce Capuano')
        ?.name,
    ).toBe('Bryce Capuano')
    expect(cardFor(result, SETTINGS, 'metric', 42, false)?.name).toBeNull()
  })

  it('carries a sample badge only for sample data', () => {
    expect(cardFor(makeResult(), SETTINGS, 'metric', 42, true)?.badge).toBe('Sample athlete')
    expect(cardFor(makeResult(), SETTINGS, 'metric', 42, false)?.badge).toBeNull()
  })

  it('says the card is graded, and a level and not a ranking, once a grade is on it', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false, null, true, null, {
      run: RUN_GRADE,
      ride: null,
    })
    expect(card?.footnote).toBe(GRADED_FOOTNOTE)
  })

  it('says the figures are estimated from your files when no grade is on the card', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.footnote).toBe(ESTIMATE_FOOTNOTE)
  })

  it('uses one voice on the card, with no first person and no comparison claim', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false, null, true, null, {
      run: RUN_GRADE,
      ride: RIDE_GRADE,
    })
    const text = JSON.stringify(card)
    expect(text).not.toMatch(/\bmy\b|\bI\b|\bme\b/)
    expect(text).not.toMatch(/Compares/)
  })

  it('has exactly these keys, so no account, file or activity field can be added unnoticed', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, true, LOW_EFFORT)
    // The name is the one the visitor types for the card, kept on this device; it is no account data.
    expect(Object.keys(card ?? {}).sort()).toEqual(
      [
        'badge',
        'caveat',
        'footnote',
        'headline',
        'heroes',
        'magnitude',
        'meter',
        'name',
        'origin',
        'period',
        'title',
      ].sort(),
    )
  })

  it('contains no name, email, file name, activity name or date', () => {
    const result = makeResult({
      activities: [
        makeActivity({ id: 'run-1', name: 'Ada Lovelace morning run', sport: 'run' }),
        makeActivity({ id: 'ride-1', name: 'ada@example.com hill ride', sport: 'ride' }),
      ],
    })
    const card = cardFor(result, SETTINGS, 'metric', 42, false, LOW_EFFORT)
    const json = JSON.stringify(card)
    expect(json).not.toMatch(/Ada|Lovelace|example\.com|@|\.fit|\.gpx|\.tcx|morning run|hill ride/)
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(json).not.toMatch(/\d{4}\/\d{2}\/\d{2}/)
  })
})

describe('shareableHost', () => {
  it('names a public https host, without its scheme', () => {
    expect(shareableHost('https://running.example.workers.dev')).toBe('running.example.workers.dev')
  })

  it('drops the port, so a host with one names only the site', () => {
    expect(shareableHost('https://runningcyclinganalysis.app:8443')).toBe(
      'runningcyclinganalysis.app',
    )
  })

  it('prints a host only for https, so an http origin names nothing', () => {
    expect(shareableHost('http://runningcyclinganalysis.app')).toBe('')
  })

  it('omits localhost, loopback and IPv6 loopback', () => {
    expect(shareableHost('https://localhost:4319')).toBe('')
    expect(shareableHost('https://127.0.0.1:4319')).toBe('')
    expect(shareableHost('https://127.4.5.6')).toBe('')
    expect(shareableHost('https://[::1]:4319')).toBe('')
  })

  it('omits .local names and private IPv4 ranges', () => {
    expect(shareableHost('https://printer.local')).toBe('')
    expect(shareableHost('https://10.0.0.5:8080')).toBe('')
    expect(shareableHost('https://192.168.1.20')).toBe('')
    expect(shareableHost('https://172.16.0.1')).toBe('')
    expect(shareableHost('https://172.31.255.1')).toBe('')
  })

  it('omits the unspecified IPv4 address, 0.0.0.0', () => {
    expect(shareableHost('https://0.0.0.0:8080')).toBe('')
  })

  it('omits IPv6 unique local (fc00::/7) and link-local (fe80::/10) addresses', () => {
    expect(shareableHost('https://[fc00::1]')).toBe('')
    expect(shareableHost('https://[fd12:3456:789a::1]')).toBe('')
    expect(shareableHost('https://[fe80::1]')).toBe('')
    expect(shareableHost('https://[febf::1]:4319')).toBe('')
  })

  it('omits IPv4-mapped and IPv4-compatible IPv6 addresses, which can name a private IPv4 host', () => {
    // The browser writes these in hex (::ffff:127.0.0.1 is [::ffff:7f00:1]); the whole ::/8 block
    // is treated as private, so an embedded IPv4 address never slips through.
    expect(shareableHost('https://[::ffff:127.0.0.1]')).toBe('')
    expect(shareableHost('https://[::ffff:10.0.0.1]')).toBe('')
    expect(shareableHost('https://[::ffff:8.8.8.8]')).toBe('')
    expect(shareableHost('https://[::]')).toBe('')
  })

  it('omits carrier-grade NAT addresses (100.64.0.0/10), which a tailnet or mobile network uses', () => {
    expect(shareableHost('https://100.64.0.1')).toBe('')
    expect(shareableHost('https://100.127.255.254')).toBe('')
    expect(shareableHost('https://100.128.0.1')).toBe('100.128.0.1')
    expect(shareableHost('https://100.63.255.1')).toBe('100.63.255.1')
  })

  it('omits the private names a home or tailnet uses: .ts.net, .lan, .home.arpa and .internal', () => {
    expect(shareableHost('https://nas.tail1234.ts.net')).toBe('')
    expect(shareableHost('https://printer.lan')).toBe('')
    expect(shareableHost('https://router.home.arpa')).toBe('')
    expect(shareableHost('https://api.internal')).toBe('')
  })

  it('keeps a public name that only resembles a private one', () => {
    expect(shareableHost('https://tsnet.example.com')).toBe('tsnet.example.com')
    expect(shareableHost('https://lanes.example.com')).toBe('lanes.example.com')
  })

  it('keeps public IPv6 addresses next to those ranges, printed without brackets', () => {
    expect(shareableHost('https://[2001:db8::1]')).toBe('2001:db8::1')
    expect(shareableHost('https://[fec0::1]')).toBe('fec0::1')
    expect(shareableHost('https://[fbff::1]')).toBe('fbff::1')
  })

  it('omits the test, localdomain and corp names, which name no public site', () => {
    expect(shareableHost('https://app.test')).toBe('')
    expect(shareableHost('https://box.localdomain')).toBe('')
    expect(shareableHost('https://intranet.corp')).toBe('')
  })

  it('keeps public addresses next to the private ranges', () => {
    expect(shareableHost('https://8.8.8.8')).toBe('8.8.8.8')
    expect(shareableHost('https://172.32.0.1')).toBe('172.32.0.1')
    expect(shareableHost('https://11.0.0.1')).toBe('11.0.0.1')
  })

  it('gives an empty host for text that is not a URL', () => {
    expect(shareableHost('')).toBe('')
    expect(shareableHost('not a url')).toBe('')
  })

  it('reads the page host in buildShareCard and omits it when local', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.origin).toBe(shareableHost(window.location.origin))
  })
})

describe('buildShareCard while no weight is entered', () => {
  it('has no card, so neither the ride estimate nor the balance is shared', () => {
    expect(cardFor(makeResult(), SETTINGS, 'metric', 42, false, null, false)).toBeNull()
  })

  it('has no card for a grade gap either, since the gap is worked out from the ride', () => {
    const gap: BalanceGap = { centre: -6, low: -10, high: -2, lean: 'ride' }
    expect(cardFor(makeResult(), SETTINGS, 'metric', 42, false, null, false, gap)).toBeNull()
  })

  it('shows the ride estimate and the balance once a weight is entered', () => {
    const card = cardFor(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.heroes.find((hero) => hero.sport === 'ride')?.figure).not.toBeNull()
    expect(card?.meter).not.toBeNull()
  })
})
