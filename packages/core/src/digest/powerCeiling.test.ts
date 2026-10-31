import { describe, expect, it } from 'vitest'
import {
  POWER_CEILING_MARGIN,
  SPRINT_15S_WKG,
  WORLD_CLASS_POWER_WKG,
  implausiblePower,
  ridePowerCeilingWkg,
} from '../curves/powerCeiling'
import type { ActivityDigest, AthleteSettings } from '../types'
import { activitySummaries } from './activitySummaries'
import { combine } from './combine'
import { fixedMasses } from './masses'
import { powerCheckOf } from './powerCheck'
import { DAY, RUN_TEMPLATE, START, meterRide, steadyRide } from './test/powerFixtures'

const settings: AthleteSettings = { massKg: 70, bikeMassKg: 9 }

const bestId = (digests: ActivityDigest[], opts: AthleteSettings = settings) =>
  combine(digests, opts).rideCurve.find((p) => p.durationS === 1200)?.activityId

describe('the ride power ceiling', () => {
  it('is the table’s world-class edge widened by the margin at its durations, with a 15 s sprint node', () => {
    for (const { durationS, wkg } of WORLD_CLASS_POWER_WKG) {
      expect(ridePowerCeilingWkg(durationS)).toBeCloseTo(wkg * POWER_CEILING_MARGIN, 12)
    }
    expect(ridePowerCeilingWkg(15)).toBeCloseTo(SPRINT_15S_WKG * POWER_CEILING_MARGIN, 12)
    expect(ridePowerCeilingWkg(1)).toBe(ridePowerCeilingWkg(5))
    expect(ridePowerCeilingWkg(86_400)).toBe(ridePowerCeilingWkg(3600))
  })

  it('never rises with length, over every length from 1 s to 3 h', () => {
    let previous = Number.POSITIVE_INFINITY
    for (let durationS = 1; durationS <= 10_800; durationS = Math.ceil(durationS * 1.01) + 1) {
      const ceiling = ridePowerCeilingWkg(durationS)
      expect(ceiling).toBeLessThanOrEqual(previous + 1e-12)
      previous = ceiling
    }
  })

  it('is continuous: a one-percent step in length moves it by under two percent', () => {
    for (let durationS = 2; durationS <= 10_800; durationS = Math.ceil(durationS * 1.01) + 1) {
      const step = Math.log(ridePowerCeilingWkg(durationS * 1.01) / ridePowerCeilingWkg(durationS))
      expect(Math.abs(step)).toBeLessThan(0.02)
    }
  })

  it('lets a strong rider and an elite sprinter through at every length', () => {
    // 6.5 W/kg for 20 min is professional power; 21 W/kg for 15 s is an elite sprinter's.
    const strong = meterRide('s', START, (durationS) => {
      if (durationS <= 15) return 70 * 21
      return 70 * Math.min(6.5 * (1200 / durationS) ** 0.1, 6.5 * 3)
    })
    expect(powerCheckOf(strong, fixedMasses(70, 9))).toBeUndefined()
  })
})

describe('an implausible sustained power in the analysis', () => {
  const plateau = steadyRide('plateau', START, 10) // 700 W for a 70 kg rider at every length
  const normal = steadyRide('normal', START + DAY, 3.5)

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
    const keptSummaries = activitySummaries([plateau, normal], kept)
    expect(keptSummaries.find((s) => s.id === 'plateau')?.powerCheck).toBe('kept')
    expect(bestId([plateau, normal], kept)).toBe('plateau')
  })

  it('judges power against the body mass of the day', () => {
    // The same 700 W is 5.1 W/kg for a 137 kg rider: possible, so not set aside.
    expect(bestId([plateau, normal], { massKg: 137, bikeMassKg: 9 })).toBe('plateau')
  })

  it('is not judged while no body weight is entered, since 75 kg is a placeholder', () => {
    const assumed: AthleteSettings = { massKg: 75, bikeMassKg: 9, massAssumed: true }
    expect(bestId([plateau, normal], assumed)).toBe('plateau')
    expect(activitySummaries([plateau], assumed)[0]?.powerCheck).toBeUndefined()
    expect(implausiblePower(plateau, 75)).toBe(true)
  })

  it('does not touch a run', () => {
    expect(powerCheckOf(RUN_TEMPLATE, fixedMasses(70, 9))).toBeUndefined()
  })
})
