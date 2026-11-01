import { describe, expect, it } from 'vitest'
import { DAY_MS } from './constants'
import { digestActivity } from './digest'
import { buildFit, secondly } from './fit/fitTestFiles'
import { AnalysisSession } from './session'
import type { SessionState } from './session'
import type { PeriodChoice } from './period'
import { oddLibraries } from './synthetic/odd'
import type { AthleteSettings } from './types'

/**
 * Libraries of the odd files a real export holds must analyse without a throw and without a number that
 * is not a number. A curve has NaN where nothing was recorded at a duration, by design, so those values
 * are the one place a non-finite number may be.
 */

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const CURVE_GAP =
  /((^|\.)(run|ride|rideMetabolic|rideMeasured)Curve|\.libraryBests\.(run|ride))\[\d+\]\.value$/

/** The paths of every number in a value that is NaN or infinite. */
function nonFinite(value: unknown, path = 'state', found: string[] = []): string[] {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) found.push(path)
  } else if (value instanceof Map) {
    for (const [key, entry] of value) nonFinite(entry, `${path}.${String(key)}`, found)
  } else if (Array.isArray(value)) {
    value.forEach((entry, i) => nonFinite(entry, `${path}[${i}]`, found))
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, entry] of Object.entries(value)) nonFinite(entry, `${path}.${key}`, found)
  }
  return found
}

function expectSound(state: SessionState) {
  expect(nonFinite(state).filter((path) => !CURVE_GAP.test(path))).toEqual([])
}

const libraries = Object.entries(oddLibraries()).map(
  ([name, activities]) => [name, activities.map((activity) => digestActivity(activity))] as const,
)

/** The choices a visitor can make, with a custom range that holds the newest day and one that holds nothing. */
function choicesFor(newestMs: number): PeriodChoice[] {
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  return [
    'default',
    'all',
    42,
    365,
    { from: day(newestMs - 10 * DAY_MS), to: day(newestMs) },
    { from: '2001-01-01', to: '2001-01-02' },
  ]
}

describe.each(libraries)('a library of %s', (_name, digests) => {
  const newest = Math.max(...digests.map((digest) => digest.startMs))

  it.each(choicesFor(newest).map((choice) => [JSON.stringify(choice), choice] as const))(
    'analyses over %s without a number that is not a number',
    (_label, choice) => {
      const session = new AnalysisSession()
      session.choosePeriod(choice)
      const state = session.loadDigests(digests, SETTINGS)
      expect(state.totalActivities).toBeGreaterThan(0)
      expectSound(state)
      // A change of weight, and of period, reads the same library again.
      expectSound(session.setSettings({ massKg: 60, bikeMassKg: 12 }))
      expectSound(session.setRange('all', SETTINGS))
    },
  )

  it('lists every activity it holds', () => {
    const state = new AnalysisSession().loadDigests(digests, SETTINGS)
    expect(state.library).toHaveLength(state.totalActivities)
    expect(state.library.every((activity) => Number.isFinite(activity.durationS))).toBe(true)
  })
})

describe('odd libraries that need their own checks', () => {
  const byName = new Map(libraries)

  it('is checked by a walk that does find the gap in a curve with no data', () => {
    const state = new AnalysisSession().loadDigests(byName.get('runs-only')!, SETTINGS)
    expect(nonFinite(state)).toContain('state.result.rideCurve[0].value')
  })

  it('keeps one of two files that start in the same second', () => {
    const state = new AnalysisSession().loadDigests(byName.get('same-start')!, SETTINGS)
    expect(state.totalActivities).toBe(2)
  })

  it('analyses the one run of a six-week period, and the default falls back to all time', () => {
    const digests = byName.get('one-in-the-period')!
    const session = new AnalysisSession()
    session.choosePeriod(42)
    const sixWeeks = session.loadDigests(digests, SETTINGS)
    expect(sixWeeks.result!.activities).toHaveLength(1)
    expect(sixWeeks.period.fellBack).toBe(false)
    const fallback = new AnalysisSession().loadDigests(digests, SETTINGS)
    expect(fallback.period.fellBack).toBe(true)
    expect(fallback.result!.activities).toHaveLength(digests.length)
  })

  it('gives a period with no activity a result that says so, not an error', () => {
    const session = new AnalysisSession()
    session.choosePeriod({ from: '2001-01-01', to: '2001-01-02' })
    const state = session.loadDigests(byName.get('runs-only')!, SETTINGS)
    expect(state.result!.activities).toHaveLength(0)
    expect(state.library.length).toBeGreaterThan(0)
  })

  it('digests a 48-hour file whole, and keeps its length', () => {
    const state = new AnalysisSession().loadDigests(byName.get('forty-eight-hours')!, SETTINGS)
    expect(Math.max(...state.library.map((activity) => activity.durationS))).toBe(172_800)
  })
})

describe('a file that repeats its timestamps', () => {
  const START_MS = Date.UTC(2025, 5, 2, 7)

  it('imports as one activity of the length it spans, with finite figures', async () => {
    // Every second is recorded twice, the second copy a little faster, as a device that logs on events
    // as well as on a timer does.
    const records = secondly(START_MS, 600, { speed: 3, altitude: 50, heartRate: 150 }).flatMap(
      (record) => [record, { ...record, speed: 3.2 }],
    )
    const file = new File(
      [
        new Uint8Array(
          buildFit({
            sessions: [{ sport: 'running', startMs: START_MS, durationS: 600, records }],
          }),
        ),
      ],
      'repeated.fit',
    )
    const state = await new AnalysisSession().addFiles([file], SETTINGS)
    expect(state.rejected).toEqual([])
    expect(state.totalActivities).toBe(1)
    expect(state.library[0]!.durationS).toBeGreaterThan(590)
    expect(state.library[0]!.durationS).toBeLessThanOrEqual(601)
    expectSound(state)
  })
})
