import { describe, expect, it } from 'vitest'
import { DURATIONS_S } from '../constants'
import {
  POWER_CEILING_MARGIN,
  WORLD_CLASS_POWER_WKG,
  ridePowerCeilingWkg,
} from '../curves/powerCeiling'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest, AthleteSettings, DigestCurvePoint } from '../types'
import { activitySummaries, combine } from './combine'
import { digestActivity } from './digestActivity'
import { fixedMasses } from './masses'
import { powerCheckOf } from './rideCurves'

const { activities } = sampleDataset()
const template = digestActivity(activities.find((a) => a.sport === 'ride')!)
const settings: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const DAY = 86_400_000
const START = Date.UTC(2026, 5, 1, 9)

/** A ride whose measured power is watts at every duration up to its length, none beyond. */
function ride(id: string, startMs: number, watts: (durationS: number) => number): ActivityDigest {
  const curve: DigestCurvePoint[] = DURATIONS_S.map((durationS) => ({
    durationS,
    value: watts(durationS),
    startIndex: 0,
    windowS: durationS,
    heartRate: null,
    terms: null,
  }))
  return {
    ...template,
    id,
    name: id,
    startMs,
    sport: 'ride',
    curve,
    hrBlocks: [],
    calibration: null,
  }
}

/** A steady ride at a W/kg for every duration, for the settings' 70 kg. */
const steady = (id: string, startMs: number, wkg: number) => ride(id, startMs, () => wkg * 70)

const bestId = (digests: ActivityDigest[], opts?: AthleteSettings) =>
  combine(digests, opts ?? settings).rideCurve.find((p) => p.durationS === 1200)?.activityId

describe('the ride power ceiling', () => {
  it('is the published world-class edge widened by the margin, in log-log between durations', () => {
    for (const { durationS, wkg } of WORLD_CLASS_POWER_WKG) {
      expect(ridePowerCeilingWkg(durationS)).toBeCloseTo(wkg * POWER_CEILING_MARGIN, 12)
    }
    expect(ridePowerCeilingWkg(1200)).toBeGreaterThan(ridePowerCeilingWkg(3600))
    expect(ridePowerCeilingWkg(1200)).toBeLessThan(ridePowerCeilingWkg(300))
    expect(ridePowerCeilingWkg(1)).toBe(ridePowerCeilingWkg(5))
    expect(ridePowerCeilingWkg(86_400)).toBe(ridePowerCeilingWkg(3600))
  })

  it('lets a strong rider through at every duration', () => {
    // 6.5 W/kg for 20 minutes is professional power; the tail cases are the athletes it must not flag.
    const strong = ride(
      's',
      START,
      (durationS) => 70 * Math.min(6.5 * (1200 / durationS) ** 0.1, 6.5 * 3),
    )
    expect(powerCheckOf(strong, fixedMasses(70, 9))).toBeUndefined()
  })
})

describe('an implausible sustained power in the analysis', () => {
  const plateau = steady('plateau', START, 10) // 700 W for a 70 kg rider at every length
  const normal = steady('normal', START + DAY, 3.5)

  it('is set aside, so the next-best ride sets the best', () => {
    expect(bestId([plateau, normal])).toBe('normal')
  })

  it('leaves no best when only that ride covers the duration', () => {
    const point = combine([plateau], settings).rideCurve.find((p) => p.durationS === 1200)
    expect(point?.activityId).toBeNull()
    expect(point?.value).toBeNaN()
  })

  it('is flagged on the activity summary, and kept when the athlete keeps it', () => {
    const flagged = activitySummaries([plateau, normal], settings)
    expect(flagged.find((s) => s.id === 'plateau')?.powerCheck).toBe('set-aside')
    expect(flagged.find((s) => s.id === 'normal')?.powerCheck).toBeUndefined()
    const kept = { ...settings, keepPower: ['plateau'] }
    expect(
      activitySummaries([plateau, normal], kept).find((s) => s.id === 'plateau')?.powerCheck,
    ).toBe('kept')
    expect(bestId([plateau, normal], kept)).toBe('plateau')
  })

  it('judges power against the body mass of the day', () => {
    // The same 700 W is 5.1 W/kg for a 137 kg rider: possible, so not set aside.
    expect(bestId([plateau, normal], { massKg: 137, bikeMassKg: 9 })).toBe('plateau')
  })

  it('does not touch a run', () => {
    const run = digestActivity(activities.find((a) => a.sport === 'run')!)
    expect(powerCheckOf(run, fixedMasses(70, 9))).toBeUndefined()
  })
})
