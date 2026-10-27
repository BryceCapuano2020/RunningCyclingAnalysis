import { describe, expect, it } from 'vitest'
import { DURATIONS_S } from '../constants'
import { flatSpeedToMetabolic } from '../metabolic'
import { recordHolders } from '../records/holders'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest, AthleteSettings, DigestCurvePoint } from '../types'
import { combine } from './combine'
import { digestActivity } from './digestActivity'
import { fitnessTrend } from './trend'

const { athlete, activities } = sampleDataset()
const settings: AthleteSettings = { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg }
const template = digestActivity(activities.find((a) => a.sport === 'run')!)

/** A run digest whose only values are the given flat speeds, m/s, by duration; the rest are NaN. */
function runWithSpeeds(
  id: string,
  startMs: number,
  speeds: Record<number, number>,
): ActivityDigest {
  const curve: DigestCurvePoint[] = DURATIONS_S.map((durationS) => {
    const speed = speeds[durationS]
    return {
      durationS,
      value: speed === undefined ? Number.NaN : flatSpeedToMetabolic(speed),
      startIndex: 0,
      windowS: durationS,
      heartRate: null,
      terms: null,
    }
  })
  return {
    ...template,
    id,
    name: id,
    startMs,
    sport: 'run',
    curve,
    hrBlocks: [],
    calibration: null,
  }
}

const START = Date.UTC(2026, 5, 1, 9)
// A's 1 minute is 11.7 m/s, faster than any runner holds; B's is a plain 5 m/s.
const impossible = runWithSpeeds('a', START, { 60: 11.7, 1200: 4 })
const plausible = runWithSpeeds('b', START + 86_400_000, { 60: 5, 1200: 3.5 })
const only = runWithSpeeds('c', START, { 60: 11.7 })

describe('the run ceiling in the analysis', () => {
  it('replaces an impossible point with the next-best activity’s point at the same duration', () => {
    const point = combine([impossible, plausible], settings).runCurve.find(
      (p) => p.durationS === 60,
    )
    expect(point?.activityId).toBe('b')
    expect(point?.value).toBeCloseTo(flatSpeedToMetabolic(5), 12)
  })

  it('leaves a duration empty when only an impossible point covers it', () => {
    const point = combine([only], settings).runCurve.find((p) => p.durationS === 60)
    expect(point?.activityId).toBeNull()
    expect(point?.value).toBeNaN()
  })

  it('keeps the possible points of the same activity', () => {
    const point = combine([impossible], settings).runCurve.find((p) => p.durationS === 1200)
    expect(point?.activityId).toBe('a')
  })

  it('does not credit an impossible point as a record holder', () => {
    const holders = recordHolders([only], settings)
    expect(holders.get('c')?.some((r) => r.kind === 'duration' && r.durationS === 60)).toBe(false)
  })

  it('does not let an impossible point set a weekly trend value', () => {
    const points = fitnessTrend([impossible, plausible], settings, { durationS: 60 })
    expect(points.at(-1)?.runWkg).toBeCloseTo(flatSpeedToMetabolic(5), 12)
  })
})
