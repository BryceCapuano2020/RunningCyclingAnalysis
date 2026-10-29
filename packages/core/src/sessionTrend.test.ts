import './test/warmSample'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as trend from './digest/trend'
import { AnalysisSession } from './session'
import { EFFORT_LENGTHS_S } from './digest/trendPoints'
import { sampleDataset } from './synthetic'
import { combine, digestActivity, sportCurves } from './digest'
import { DAY_MS, DEFAULT_BIKE_MODEL, HEADLINE_DURATION_S } from './constants'
import type { AthleteSettings } from './types'
import { dayOf } from './customRange'

vi.mock('./digest/trend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./digest/trend')>()
  return { ...actual, fitnessTrend: vi.fn(actual.fitnessTrend) }
})

vi.mock('./digest/combine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./digest/combine')>()
  return { ...actual, sportCurves: vi.fn(actual.sportCurves) }
})

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
// Digesting the sample is the slow part of these tests, so it is done once and each test gets
// its own array of the same digests.
const SAMPLE_DIGESTS = sampleDataset().activities.map(digestActivity)
const sampleDigests = () => [...SAMPLE_DIGESTS]
const fitnessTrend = vi.mocked(trend.fitnessTrend)
/** The trend is computed once for each effort length, so each recomputation calls fitnessTrend this often. */
const EFFORTS = EFFORT_LENGTHS_S.length

describe('AnalysisSession trend', () => {
  beforeEach(() => {
    fitnessTrend.mockClear()
  })

  it('gives the headline trend no running equivalents until the session is asked to grade it', () => {
    const session = new AnalysisSession()
    session.loadDigests(sampleDigests(), SETTINGS)
    const plain = session.setRange('all', SETTINGS)
    const rides = plain.trend.filter((point) => point.rideWkg !== null)
    expect(rides.length).toBeGreaterThan(0)
    expect(rides.every((point) => point.rideRunSpeed === null)).toBe(true)

    const graded = session.setGradeTrend(true, SETTINGS)
    expect(graded.trend.some((point) => point.rideRunSpeed !== null)).toBe(true)
    // Asked to stop, the trend goes back to plain points.
    expect(session.setGradeTrend(false, SETTINGS).trend.every((p) => p.rideRunSpeed === null)).toBe(
      true,
    )
  })

  it('gives the sample’s rides running equivalents without being asked, since the sample is graded as its own athlete', () => {
    const session = new AnalysisSession()
    const state = session.loadSample(SETTINGS)
    const rides = state.trend.filter((point) => point.rideWkg !== null)
    expect(rides.length).toBeGreaterThan(0)
    expect(rides.some((point) => point.rideRunSpeed !== null)).toBe(true)
  })

  it('recomputes the trend for a custom range that holds the same activities from another first day', () => {
    const session = new AnalysisSession()
    session.loadDigests(sampleDigests(), SETTINGS)
    const starts = SAMPLE_DIGESTS.map((d) => d.startMs)
    const first = new Date(Math.min(...starts))
    const last = new Date(Math.max(...starts))
    const day = (date: Date, shift: number) => {
      const copy = new Date(date)
      copy.setDate(copy.getDate() + shift)
      return dayOf(copy.getTime())
    }
    // Both ranges hold every activity and have the same length, but start on different days.
    session.setRange({ from: day(first, -10), to: dayOf(last.getTime()) }, SETTINGS)
    fitnessTrend.mockClear()
    session.setRange({ from: day(first, -9), to: day(last, 1) }, SETTINGS)
    expect(fitnessTrend).toHaveBeenCalledTimes(EFFORTS)
  })

  it('recomputes the trend when the period changes, and reuses it for the same period', () => {
    const session = new AnalysisSession()
    session.loadSample(SETTINGS)
    const computed = fitnessTrend.mock.calls.length
    expect(computed).toBeGreaterThan(0)

    session.setRange(42, SETTINGS)
    expect(fitnessTrend.mock.calls.length).toBe(computed + 1 * EFFORTS)
    session.setRange(42, SETTINGS)
    expect(fitnessTrend.mock.calls.length).toBe(computed + 1 * EFFORTS)
    session.setRange('all', SETTINGS)
    expect(fitnessTrend.mock.calls.length).toBe(computed + 2 * EFFORTS)
  })

  it('computes the trend of a period from windows that stay inside it', () => {
    const session = new AnalysisSession()
    session.loadDigests(sampleDigests(), SETTINGS)
    session.setGradeTrend(true, SETTINGS)
    const state = session.setRange(42, SETTINGS)
    const digests = sampleDigests()
    const newest = Math.max(...digests.map((digest) => digest.startMs))
    const cutoff = newest - 42 * DAY_MS
    const selected = digests.filter((digest) => digest.startMs >= cutoff)
    expect(state.trend).toEqual(
      trend.fitnessTrend(selected, SETTINGS, {
        windowDays: 14,
        fromMs: cutoff,
        // The running equivalents read the library's calibration, not the period's own.
        equivalence: { hr: combine(digests, SETTINGS).hr },
      }),
    )
  })

  it('reuses the trend for equal settings, and recomputes when mass changes', () => {
    const session = new AnalysisSession()
    session.loadDigests(sampleDigests(), SETTINGS)
    session.setRange('all', SETTINGS)
    session.setGradeTrend(true, SETTINGS)
    const computed = fitnessTrend.mock.calls.length

    session.setSettings({ ...SETTINGS })
    expect(fitnessTrend.mock.calls.length).toBe(computed)

    const state = session.setSettings({ ...SETTINGS, massKg: 80 })
    expect(fitnessTrend.mock.calls.length).toBe(computed + 1 * EFFORTS)
    const changed = { ...SETTINGS, massKg: 80 }
    expect(state.trend).toEqual(
      trend.fitnessTrend(sampleDigests(), changed, {
        equivalence: { hr: combine(sampleDigests(), changed).hr },
      }),
    )
  })

  it('gives the trend of each effort length over the period, with the 20-minute one as trend', () => {
    const session = new AnalysisSession()
    session.loadDigests(sampleDigests(), SETTINGS)
    session.setGradeTrend(true, SETTINGS)
    const state = session.setRange(42, SETTINGS)
    const digests = sampleDigests()
    const newest = Math.max(...digests.map((digest) => digest.startMs))
    const cutoff = newest - 42 * DAY_MS
    const selected = digests.filter((digest) => digest.startMs >= cutoff)
    const { bikeModel } = combine(selected, SETTINGS)
    const { hr } = combine(digests, SETTINGS)
    for (const durationS of EFFORT_LENGTHS_S) {
      expect(state.effortTrends[durationS]).toEqual(
        trend.fitnessTrend(selected, SETTINGS, {
          durationS,
          windowDays: 14,
          fromMs: cutoff,
          bikeModel,
          // Only the headline trend carries the running equivalent.
          equivalence: durationS === HEADLINE_DURATION_S ? { hr } : undefined,
        }),
      )
    }
    expect(state.trend).toBe(state.effortTrends[1200])
  })

  it('recomputes every effort length when the bike mass changes, and matches a fresh trend', () => {
    const session = new AnalysisSession()
    session.loadDigests(sampleDigests(), SETTINGS)
    session.setRange('all', SETTINGS)
    session.setGradeTrend(true, SETTINGS)
    const computed = fitnessTrend.mock.calls.length

    const bigger = { ...SETTINGS, bikeMassKg: 12 }
    const state = session.setSettings(bigger)
    expect(fitnessTrend.mock.calls.length).toBe(computed + EFFORT_LENGTHS_S.length)
    expect(state.trend).toEqual(
      trend.fitnessTrend(sampleDigests(), bigger, {
        equivalence: { hr: combine(sampleDigests(), bigger).hr },
      }),
    )
  })

  it('recomputes when the library changes', () => {
    const session = new AnalysisSession()
    session.loadSample(SETTINGS)
    const computed = fitnessTrend.mock.calls.length

    session.loadDigests(sampleDigests().slice(0, 3), SETTINGS)
    expect(fitnessTrend.mock.calls.length).toBe(computed + 1 * EFFORTS)
  })
})

describe('AnalysisSession previous period', () => {
  it('gives the curves of the period before the selected one, of the same length', () => {
    const session = new AnalysisSession()
    const current = sampleDigests()
    // The sample lies within six weeks, so an older copy of it, nine weeks earlier, fills the period before.
    const older = current.map((digest) => ({
      ...digest,
      id: `${digest.id}-older`,
      startMs: digest.startMs - 63 * DAY_MS,
    }))
    session.loadDigests([...current, ...older], SETTINGS)
    const state = session.setRange(42, SETTINGS)

    const newest = Math.max(...current.map((digest) => digest.startMs))
    const previousPeriod = older.filter(
      (digest) => digest.startMs >= newest - 84 * DAY_MS && digest.startMs < newest - 42 * DAY_MS,
    )
    expect(previousPeriod.length).toBeGreaterThan(0)
    const selected = current.filter((digest) => digest.startMs >= newest - 42 * DAY_MS)
    const { headlineEffort, ...curves } = state.previous ?? {}
    expect(curves).toEqual(
      sportCurves(previousPeriod, SETTINGS, combine(selected, SETTINGS).bikeModel),
    )
    // The session also says how hard its best 20 min were, against the library's reference heart rates.
    expect(headlineEffort).toMatchObject({ durationS: 1200 })
  })

  it('prices a sparse previous period with the same bike model as the selected one', () => {
    const session = new AnalysisSession()
    const current = sampleDigests()
    const newest = Math.max(...current.map((digest) => digest.startMs))
    // One virtual-power ride from the period before, so it has no fit of its own to use.
    const virtual = current.find(
      (digest) => digest.sport === 'ride' && digest.curve.some((point) => point.terms !== null),
    )
    expect(virtual).toBeDefined()
    const sparse = virtual
      ? [{ ...virtual, id: `${virtual.id}-sparse`, startMs: newest - 50 * DAY_MS }]
      : []
    session.loadDigests([...current, ...sparse], SETTINGS)
    const state = session.setRange(42, SETTINGS)

    const selectedModel = combine(
      current.filter((digest) => digest.startMs >= newest - 42 * DAY_MS),
      SETTINGS,
    ).bikeModel
    expect(selectedModel).not.toEqual(DEFAULT_BIKE_MODEL)
    const priced = sportCurves(sparse, SETTINGS, selectedModel).rideCurve
    expect(state.previous?.rideCurve).toEqual(priced)
    expect(priced).not.toEqual(sportCurves(sparse, SETTINGS, DEFAULT_BIKE_MODEL).rideCurve)
  })

  it('reuses the previous period’s curves while its digests and masses are the same', () => {
    const session = new AnalysisSession()
    const current = sampleDigests()
    const older = current.map((digest) => ({
      ...digest,
      id: `${digest.id}-older`,
      startMs: digest.startMs - 63 * DAY_MS,
    }))
    session.loadDigests([...current, ...older], SETTINGS)
    session.setRange(42, SETTINGS)
    const computed = vi.mocked(sportCurves).mock.calls.length

    session.setRange(42, SETTINGS)
    session.setSettings({ ...SETTINGS })
    expect(vi.mocked(sportCurves).mock.calls.length).toBe(computed)

    session.setSettings({ ...SETTINGS, bikeMassKg: 10 })
    expect(vi.mocked(sportCurves).mock.calls.length).toBe(computed + 1)
  })

  it('recomputes the previous period when an older ride is loaded into it, and only then', () => {
    const session = new AnalysisSession()
    const current = sampleDigests()
    const older = current.map((digest) => ({
      ...digest,
      id: `${digest.id}-older`,
      startMs: digest.startMs - 63 * DAY_MS,
    }))
    const newest = Math.max(...current.map((digest) => digest.startMs))
    const ride = current.find((digest) => digest.sport === 'ride')
    expect(ride).toBeDefined()
    session.loadDigests([...current, ...older], SETTINGS)
    session.setRange(42, SETTINGS)
    const computed = vi.mocked(sportCurves).mock.calls.length

    // An older ride lands in the period before, between the two calls; the selected period is unchanged.
    const loaded = ride ? { ...ride, id: `${ride.id}-loaded`, startMs: newest - 60 * DAY_MS } : null
    session.loadDigests([...current, ...older, ...(loaded ? [loaded] : [])], SETTINGS)
    session.setRange(42, SETTINGS)
    expect(vi.mocked(sportCurves).mock.calls.length).toBe(computed + 1)

    session.setRange(42, SETTINGS)
    expect(vi.mocked(sportCurves).mock.calls.length).toBe(computed + 1)
  })

  it('gives no previous period for all time, or when the period before has no activities', () => {
    const session = new AnalysisSession()
    session.loadDigests(sampleDigests(), SETTINGS)
    expect(session.setRange('all', SETTINGS).previous).toBeNull()
    // The fixed fixture's last activity is 3 June; nothing lies in the three days before 31 May.
    expect(session.setRange(3, SETTINGS).previous).toBeNull()
  })
})
