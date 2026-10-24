// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { AthleteSettings, EffortCheck } from '@rca/core/types'
import { makeActivity, makeResult } from '../ui/components/fixtures'
import { HARDER_EFFORTS_TITLE, headlineText } from '../ui/components/headlineText'
import { buildShareCard, shareableOrigin } from './cardModel'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const LOW_EFFORT: EffortCheck = { durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 }
const FOOTNOTE = 'Estimated from my own files. Compares my two sports; not a ranking.'

describe('buildShareCard', () => {
  it('uses the app name as the title', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, true)
    expect(card?.title).toBe('RunningCyclingAnalysis')
  })

  it('states the headline exactly as the results page does, and the balance it leans to', () => {
    const result = makeResult()
    const card = buildShareCard(result, SETTINGS, 'metric', 42, false, null, true)
    const point = result.comparison.prior[0]
    expect(point).toBeDefined()
    if (!point) return
    expect(card?.headline).toBe(headlineText(point).title)
    expect(card?.headline).toBe('Your balance leans toward running')
    expect(card?.meter).toEqual({ lean: 'run', ratio: point.ratio })
  })

  it('has no meter, and says so in the headline, while the sports cannot be compared', () => {
    const card = buildShareCard(
      makeResult({ comparison: { prior: [], calibrated: null } }),
      SETTINGS,
      'metric',
      42,
      false,
      null,
      true,
    )
    expect(card?.meter).toBeNull()
    expect(card?.headline).toBe(HARDER_EFFORTS_TITLE)
  })

  it('states the missing-sport headline in the card wording, asking for nothing', () => {
    const card = buildShareCard(
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
    expect(card?.headline).toBe('Your running so far')
    expect(card?.headline).not.toMatch(/add/i)
  })

  it('gives a one-line effort caveat when the heart-rate check found a low effort', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, LOW_EFFORT, true)
    expect(card?.caveat).toBe('Best efforts over 20 min may not have been all-out.')
  })

  it('has no effort caveat without an effort check or when the efforts were high', () => {
    expect(
      buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, true)?.caveat,
    ).toBeNull()
    const high: EffortCheck = { durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.95 }
    expect(
      buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, high, true)?.caveat,
    ).toBeNull()
  })

  it('uses the page units for the running threshold pace', () => {
    const metric = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, true)
    const imperial = buildShareCard(makeResult(), SETTINGS, 'imperial', 42, false, null, true)
    expect(metric?.heroes[0]).toMatchObject({
      label: 'Running threshold pace, estimated',
      figure: { number: '23:23', unit: '/km' },
    })
    expect(imperial?.heroes[0]?.figure).toEqual({ number: '37:38', unit: '/mi' })
  })

  it('labels each estimate as estimated, the way the results page does', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, true)
    expect(card?.heroes.map((hero) => hero.label)).toEqual([
      'Running threshold pace, estimated',
      'Cycling threshold power, estimated',
    ])
  })

  it('shows the cycling threshold power in watts, with W/kg for the body mass in the settings', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, true)
    expect(card?.heroes[1]).toMatchObject({
      label: 'Cycling threshold power, estimated',
      figure: { number: '48', unit: 'W' },
      sub: '0.6 W/kg',
      prompt: null,
    })
  })

  it('shows both sports in running then cycling order, each with its sport', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, true)
    expect(card?.heroes.map((hero) => hero.sport)).toEqual(['run', 'ride'])
    expect(card?.heroes.every((hero) => hero.prompt === null)).toBe(true)
  })

  it('leaves a sport with no threshold as a figure-less hero, with no sub line', () => {
    const card = buildShareCard(
      makeResult({ runCp: null }),
      SETTINGS,
      'metric',
      42,
      false,
      null,
      true,
    )
    expect(card?.heroes[0]).toMatchObject({ figure: null, sub: null })
    expect(card?.heroes[1]?.figure).toEqual({ number: '48', unit: 'W' })
  })

  it('shows the one sport that has an estimate, and asks for the other, when only one sport is on file', () => {
    const card = buildShareCard(
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
    expect(card?.headline).toBe('Your running so far')
    expect(card?.meter).toBeNull()
    expect(card?.heroes[0]?.figure).toEqual({ number: '23:23', unit: '/km' })
    expect(card?.heroes[1]).toMatchObject({
      figure: null,
      prompt: 'Add rides to see the balance',
    })
  })

  it('asks for harder efforts, not first efforts, when a sport has activities but no threshold', () => {
    const card = buildShareCard(
      makeResult({
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
    expect(card?.heroes[1]?.prompt).toBe('Add harder rides to see the balance')
  })

  it('returns nothing when there is no comparison and no threshold, so the button is hidden', () => {
    const card = buildShareCard(
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

  it('names the selected period, and all time when no range is selected', () => {
    expect(buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, true)?.period).toBe(
      'Last 6 weeks',
    )
    expect(buildShareCard(makeResult(), SETTINGS, 'metric', null, false, null, true)?.period).toBe(
      'All time',
    )
  })

  it('carries a sample badge only for sample data', () => {
    expect(buildShareCard(makeResult(), SETTINGS, 'metric', 42, true, null, true)?.badge).toBe(
      'Sample data',
    )
    expect(
      buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, true)?.badge,
    ).toBeNull()
  })

  it('states the estimate and not-a-ranking footnote in the first person', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, true)
    expect(card?.footnote).toBe(FOOTNOTE)
  })

  it('has exactly these keys, so no account, file or activity field can be added unnoticed', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, true, LOW_EFFORT, true)
    expect(Object.keys(card ?? {}).sort()).toEqual(
      [
        'badge',
        'caveat',
        'footnote',
        'headline',
        'heroes',
        'meter',
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
    const card = buildShareCard(result, SETTINGS, 'metric', 42, false, LOW_EFFORT, true)
    const json = JSON.stringify(card)
    expect(json).not.toMatch(/Ada|Lovelace|example\.com|@|\.fit|\.gpx|\.tcx|morning run|hill ride/)
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(json).not.toMatch(/\d{4}\/\d{2}\/\d{2}/)
  })
})

describe('shareableOrigin', () => {
  it('keeps a public site origin', () => {
    expect(shareableOrigin('https://running.example.workers.dev')).toBe(
      'https://running.example.workers.dev',
    )
  })

  it('omits localhost, loopback and IPv6 loopback', () => {
    expect(shareableOrigin('http://localhost:4319')).toBe('')
    expect(shareableOrigin('http://127.0.0.1:4319')).toBe('')
    expect(shareableOrigin('http://127.4.5.6')).toBe('')
    expect(shareableOrigin('http://[::1]:4319')).toBe('')
  })

  it('omits .local names and private IPv4 ranges', () => {
    expect(shareableOrigin('http://printer.local')).toBe('')
    expect(shareableOrigin('http://10.0.0.5:8080')).toBe('')
    expect(shareableOrigin('http://192.168.1.20')).toBe('')
    expect(shareableOrigin('http://172.16.0.1')).toBe('')
    expect(shareableOrigin('http://172.31.255.1')).toBe('')
  })

  it('omits the unspecified IPv4 address, 0.0.0.0', () => {
    expect(shareableOrigin('http://0.0.0.0:8080')).toBe('')
  })

  it('omits IPv6 unique local (fc00::/7) and link-local (fe80::/10) addresses', () => {
    expect(shareableOrigin('http://[fc00::1]')).toBe('')
    expect(shareableOrigin('http://[fd12:3456:789a::1]')).toBe('')
    expect(shareableOrigin('http://[fe80::1]')).toBe('')
    expect(shareableOrigin('http://[febf::1]:4319')).toBe('')
  })

  it('omits IPv4-mapped and IPv4-compatible IPv6 addresses, which can name a private IPv4 host', () => {
    // The browser writes these in hex (::ffff:127.0.0.1 is [::ffff:7f00:1]); the whole ::/8 block
    // is treated as private, so an embedded IPv4 address never slips through.
    expect(shareableOrigin('http://[::ffff:127.0.0.1]')).toBe('')
    expect(shareableOrigin('http://[::ffff:10.0.0.1]')).toBe('')
    expect(shareableOrigin('http://[::ffff:8.8.8.8]')).toBe('')
    expect(shareableOrigin('http://[::]')).toBe('')
  })

  it('keeps public IPv6 addresses next to those ranges', () => {
    expect(shareableOrigin('http://[2001:db8::1]')).toBe('http://[2001:db8::1]')
    expect(shareableOrigin('http://[fec0::1]')).toBe('http://[fec0::1]')
    expect(shareableOrigin('http://[fbff::1]')).toBe('http://[fbff::1]')
  })

  it('keeps public addresses next to the private ranges', () => {
    expect(shareableOrigin('http://172.32.0.1')).toBe('http://172.32.0.1')
    expect(shareableOrigin('http://11.0.0.1')).toBe('http://11.0.0.1')
  })

  it('gives an empty origin for text that is not a URL', () => {
    expect(shareableOrigin('')).toBe('')
  })

  it('reads the page origin in buildShareCard and omits it when local', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, true)
    expect(card?.origin).toBe(shareableOrigin(window.location.origin))
  })
})

describe('buildShareCard while no weight is entered', () => {
  it('leaves the ride estimate off the card, with a prompt for the weight', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, false)
    const ride = card?.heroes.find((hero) => hero.sport === 'ride')
    expect(ride).toMatchObject({
      figure: null,
      sub: null,
      prompt: 'Add your weight to see the ride estimate',
    })
  })

  it('keeps the run estimate, which does not depend on body weight', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, false)
    expect(card?.heroes.find((hero) => hero.sport === 'run')?.figure).not.toBeNull()
  })

  it('leaves the balance off the card, since the balance is worked out from the ride', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, false)
    expect(card?.meter).toBeNull()
    expect(card?.headline).not.toMatch(/leans/)
  })

  it('shows the ride estimate and the balance once a weight is entered', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, null, true)
    expect(card?.heroes.find((hero) => hero.sport === 'ride')?.figure).not.toBeNull()
    expect(card?.meter).not.toBeNull()
  })
})
