import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import type { Measurement } from '../athlete/measurements'
import { DAY_MS } from '../constants'
import { combine } from '../digest/combine'
import { FIRST_MONDAY_MS, shortRun, weeklyRuns } from '../digest/test/runLibrary'
import { AnalysisSession } from '../session'
import type { ActivityDigest, AthleteSettings } from '../types'
import { HeartRateJudge } from './heartRateJudge'
import { secondsByZone } from './timeInZones'
import { estimatesOf } from './test/estimates'
import { missingThresholdZones, zoneEstimatesOf, zonesAt } from './zones'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const WEEK_MS = 7 * DAY_MS
const at = (week: number) => FIRST_MONDAY_MS + week * WEEK_MS + 2 * DAY_MS

const pace = (sets: ReturnType<typeof zonesAt>) =>
  sets.find((set) => set.sport === 'run' && set.measure === 'pace')

/** Sixty weeks at the athlete's best, then seventy weeks at 85% of it: a fall that all of time's best does not see. */
function fallen(): ActivityDigest[] {
  return weeklyRuns(0, 130, (week) => (week < 60 ? 1 : 0.85))
}

function estimatesFor(library: ActivityDigest[]) {
  return zoneEstimatesOf(new HeartRateJudge().of(library, SETTINGS), Number.MAX_SAFE_INTEGER)
}

describe('zones from current fitness', () => {
  const library = fallen()
  const estimates = estimatesFor(library)

  it('cuts an activity by the threshold of its own half year, not the library best', () => {
    const early = pace(zonesAt(at(50), SETTINGS, estimates))!
    const late = pace(zonesAt(at(125), SETTINGS, estimates))!
    expect(late.reference).toBeLessThan(early.reference * 0.95)
    // All of time's best is the early fit, which cut the late runs as if the athlete were still at their best.
    const wholeLibrary = pace(zonesAt(at(125), SETTINGS, estimatesOf(combine(library, SETTINGS))))!
    expect(wholeLibrary.reference).toBeCloseTo(early.reference, 6)
    expect(late.asOfMs).toBeNull()
  })

  it('puts the same easy pace in a higher zone once the athlete has slowed', () => {
    // A pace between the two thresholds' Recovery edges.
    const early = pace(zonesAt(at(50), SETTINGS, estimates))!
    const late = pace(zonesAt(at(125), SETTINGS, estimates))!
    const easy = (early.zones[0]!.high! + late.zones[0]!.high!) / 2
    const zoneOf = (set: typeof early) =>
      set.zones.findIndex((zone) => zone.high === null || easy < zone.high)
    expect(zoneOf(early)).toBe(0)
    expect(zoneOf(late)).toBeGreaterThan(0)
  })

  it('gives every activity of a week the same zones, and the next week its own', () => {
    const sameWeek = [at(70), at(70) + DAY_MS].map((ms) => zonesAt(ms, SETTINGS, estimates))
    expect(JSON.stringify(sameWeek[0])).toBe(JSON.stringify(sameWeek[1]))
    expect(pace(zonesAt(at(70), SETTINGS, estimates))!.reference).not.toBe(
      pace(zonesAt(at(95), SETTINGS, estimates))!.reference,
    )
  })

  it('lets a threshold the athlete entered win, from its date and, by the policy, before it', () => {
    const entries: Measurement[] = [
      { kind: 'thresholdPace', sport: 'run', value: 3.5, from: '2021-12-01' },
      { kind: 'thresholdPace', sport: 'run', value: 3.7, from: '2022-06-01' },
    ]
    const withEntries = { ...SETTINGS, measurements: entries }
    for (const [week, reference] of [
      [50, 3.5],
      [90, 3.7],
    ] as const) {
      expect(pace(zonesAt(at(week), withEntries, estimates))).toMatchObject({
        source: 'entered',
        reference,
        asOfMs: null,
      })
    }
  })

  it('cuts the seconds of an activity by the zones of its date', () => {
    const early = pace(zonesAt(at(50), SETTINGS, estimates))!
    const late = pace(zonesAt(at(125), SETTINGS, estimates))!
    const easy = (early.zones[0]!.high! + late.zones[0]!.high!) / 2
    const bin = Math.floor(easy / 0.05)
    const distribution = { offset: bin, counts: [100] }
    expect(secondsByZone(early.zones, 'pace', distribution)[0]).toBe(100)
    expect(secondsByZone(late.zones, 'pace', distribution)[0]).toBe(0)
  })
})

describe('when the half year cannot support a threshold', () => {
  // Twenty weeks of hard runs, then forty weeks of short ones.
  const hard = weeklyRuns(0, 20, () => 1)
  const easy = Array.from({ length: 80 }, (_, i) => shortRun(`easy-${i}`, (20 + i) * 7 + 2, 1))
  const estimates = estimatesFor([...hard, ...easy])

  it('uses the last fit within a year and dates it', () => {
    const lastHard = FIRST_MONDAY_MS + (19 * 7 + 2) * DAY_MS
    const set = pace(zonesAt(at(60), SETTINGS, estimates))!
    expect(set.asOfMs).toBe(lastHard)
    expect(set.source).toBe('estimated')
    expect(missingThresholdZones(at(60), SETTINGS, estimates)).toEqual([])
  })

  it('has no estimated pace zones after a year, and says which are missing', () => {
    expect(pace(zonesAt(at(19 + 56), SETTINGS, estimates))).toBeUndefined()
    expect(missingThresholdZones(at(19 + 56), SETTINGS, estimates)).toEqual([
      { sport: 'run', measure: 'pace', outgrown: false },
    ])
  })

  it('has nothing missing where a threshold is entered, or where the sport has no activities', () => {
    const entries: Measurement[] = [
      { kind: 'thresholdPace', sport: 'run', value: 3.5, from: '2020-01-01' },
    ]
    expect(
      missingThresholdZones(at(80), { ...SETTINGS, measurements: entries }, estimates),
    ).toEqual([])
    // No rides in this library: power zones are not missing, there is nothing to find them from.
    expect(missingThresholdZones(at(80), SETTINGS, estimates).some((m) => m.sport === 'ride')).toBe(
      false,
    )
    expect(missingThresholdZones(at(80), SETTINGS, null)).toEqual([])
  })
})

describe('the session', () => {
  it('keeps heart-rate zones where the pace and power zones lapse', () => {
    const session = new AnalysisSession()
    const state = session.loadSample(SETTINGS)
    const newest = state.library[0]!.startMs
    const soon = session.zonesAt(newest, SETTINGS)
    expect(soon.some((set) => set.measure === 'pace')).toBe(true)
    expect(soon.some((set) => set.measure === 'power')).toBe(true)
    const later = session.zonesAt(newest + 400 * DAY_MS, SETTINGS)
    expect(later.map((set) => set.measure).sort()).toEqual(['heartRate', 'heartRate'])
    expect(missingThresholdZones(newest + 400 * DAY_MS, SETTINGS, state.zoneEstimates)).toEqual([
      { sport: 'run', measure: 'pace', outgrown: false },
      { sport: 'ride', measure: 'power', outgrown: false },
    ])
  })
})
