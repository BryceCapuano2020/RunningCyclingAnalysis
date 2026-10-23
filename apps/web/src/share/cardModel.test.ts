// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { AthleteSettings, EffortCheck } from '@rca/core/types'
import { comparisonPoint, makeActivity, makeResult } from '../ui/components/fixtures'
import { headlineText } from '../ui/components/headlineText'
import { buildShareCard, shareableOrigin } from './cardModel'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const LOW_EFFORT: EffortCheck = { durationS: 1200, runHrFraction: 0.7, rideHrFraction: 0.8 }

describe('buildShareCard', () => {
  it('uses the app name as the title', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.title).toBe('RunningCyclingAnalysis')
  })

  it('states the headline sentences exactly as the results page does', () => {
    const result = makeResult()
    const card = buildShareCard(result, SETTINGS, 'metric', 42, false)
    const point = result.comparison.prior[0]
    expect(point).toBeDefined()
    if (!point) return
    const text = headlineText(point)
    expect(card?.headline).toBe(text.title)
    expect(card?.summary).toBe(text.summary)
    expect(card?.range).toBe(text.range)
    expect(card?.headline).toBe(
      'Over 20 min, your running is estimated to use 12% more energy rate per kg than your cycling',
    )
  })

  it('states the population basis when there was no heart-rate adjustment', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.basis).toBe('Model range based on population assumptions.')
  })

  it('states the adjusted basis when the heart-rate comparison was used', () => {
    const point = comparisonPoint()
    const result = makeResult({ comparison: { prior: [point], calibrated: [point] } })
    const card = buildShareCard(result, SETTINGS, 'metric', 42, false)
    expect(card?.basis).toBe('Model range adjusted using your heart-rate data.')
  })

  it('states the rejected basis when the heart-rate check could not support an adjustment', () => {
    const point = comparisonPoint()
    const result = makeResult({
      comparison: {
        prior: [point],
        calibrated: null,
        calibration: { effectiveSamples: 1, draws: 4000, accepted: false },
      },
    })
    const card = buildShareCard(result, SETTINGS, 'metric', 42, false)
    expect(card?.basis).toMatch(/could not support a reliable adjustment/)
  })

  it('gives a one-line effort caveat when the heart-rate check found a low effort', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, LOW_EFFORT)
    expect(card?.caveat).toBe('Best efforts over 20 min may not have been all-out.')
  })

  it('has no effort caveat without an effort check or when the efforts were high', () => {
    expect(buildShareCard(makeResult(), SETTINGS, 'metric', 42, false)?.caveat).toBeNull()
    const high: EffortCheck = { durationS: 1200, runHrFraction: 0.95, rideHrFraction: 0.95 }
    expect(buildShareCard(makeResult(), SETTINGS, 'metric', 42, false, high)?.caveat).toBeNull()
  })

  it('uses the page units for the running pace figure', () => {
    const metric = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false)
    const imperial = buildShareCard(makeResult(), SETTINGS, 'imperial', 42, false)
    expect(metric?.figures).toContainEqual({ label: 'Running threshold pace', value: '23:23 /km' })
    expect(imperial?.figures).toContainEqual({
      label: 'Running threshold pace',
      value: '37:38 /mi',
    })
  })

  it('shows the cycling threshold power in watts for the body mass in the settings', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.figures).toContainEqual({ label: 'Cycling threshold power', value: '48 W' })
  })

  it('shows at most three figures, with the running and cycling comparison among them', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.figures).toHaveLength(3)
    expect(card?.figures[2]).toEqual({ label: 'Running vs cycling, 20 min', value: '+12%' })
  })

  it('omits a threshold figure when the sport has no threshold', () => {
    const card = buildShareCard(makeResult({ runCp: null }), SETTINGS, 'metric', 42, false)
    expect(card?.figures.map((figure) => figure.label)).toEqual([
      'Cycling threshold power',
      'Running vs cycling, 20 min',
    ])
  })

  it('names the selected period and counts the activities per sport', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.period).toBe('Last 6 weeks: 1 run, 1 ride')
  })

  it('names all time when no range is selected', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', null, false)
    expect(card?.period).toBe('All time: 1 run, 1 ride')
  })

  it('uses singular counts for one activity of a sport', () => {
    const card = buildShareCard(
      makeResult({
        activities: [
          makeActivity({ id: 'a', sport: 'run' }),
          makeActivity({ id: 'b', sport: 'run' }),
          makeActivity({ id: 'c', sport: 'ride' }),
        ],
      }),
      SETTINGS,
      'metric',
      91,
      false,
    )
    expect(card?.period).toBe('Last 3 months: 2 runs, 1 ride')
  })

  it('carries a sample badge only for sample data', () => {
    expect(buildShareCard(makeResult(), SETTINGS, 'metric', 42, true)?.badge).toBe('Sample data')
    expect(buildShareCard(makeResult(), SETTINGS, 'metric', 42, false)?.badge).toBeNull()
  })

  it('states the estimate disclaimer in the footer', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.footer).toBe(
      'Estimated from heart rate, pace and power files. This compares estimated energy rates, not sporting ability.',
    )
  })

  it('returns nothing when there is no comparison, so the button is hidden', () => {
    const card = buildShareCard(
      makeResult({
        activities: [makeActivity({ sport: 'run' })],
        comparison: { prior: [], calibrated: null },
      }),
      SETTINGS,
      'metric',
      42,
      false,
    )
    expect(card).toBeNull()
  })

  it('has exactly these keys, so no account, file or activity field can be added unnoticed', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, true, LOW_EFFORT)
    expect(Object.keys(card ?? {}).sort()).toEqual(
      [
        'badge',
        'basis',
        'caveat',
        'figures',
        'footer',
        'headline',
        'origin',
        'period',
        'range',
        'summary',
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
    const card = buildShareCard(result, SETTINGS, 'metric', 42, false, LOW_EFFORT)
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

  it('keeps public addresses next to the private ranges', () => {
    expect(shareableOrigin('http://172.32.0.1')).toBe('http://172.32.0.1')
    expect(shareableOrigin('http://11.0.0.1')).toBe('http://11.0.0.1')
  })

  it('gives an empty origin for text that is not a URL', () => {
    expect(shareableOrigin('')).toBe('')
  })

  it('reads the page origin in buildShareCard and omits it when local', () => {
    const card = buildShareCard(makeResult(), SETTINGS, 'metric', 42, false)
    expect(card?.origin).toBe(shareableOrigin(window.location.origin))
  })
})
