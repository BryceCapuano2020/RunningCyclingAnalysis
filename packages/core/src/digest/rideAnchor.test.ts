import { describe, expect, it, vi } from 'vitest'
import { PRIORS } from '../constants'
import { ageStandardSeconds, gradeAtSpeed } from '../grade'
import type { Sex } from '../grade'
import { flatSpeedToMetabolic, ridePowerToMetabolic } from '../metabolic'
import {
  CYCLING_ANCHOR_LOG_SD,
  CYCLING_WORLD_CLASS_HOUR_WKG,
  OPEN_AGE,
  anchorFactor,
  equivalenceFor,
  rideRunSpeed,
  worldClassRunHourSpeed,
} from './rideAnchor'

const SEXES: readonly Sex[] = ['male', 'female']
const HOUR_S = 3600
const MASS_KG = 70

/** The grade of a ride at `wkg` W/kg held for an hour, in the open age, through the anchored equivalence. */
function hourGrade(wkg: number, sex: Sex): number {
  const watts = wkg * MASS_KG
  const speed = equivalenceFor(sex)(watts, MASS_KG).p50
  return gradeAtSpeed(speed, HOUR_S, { age: OPEN_AGE, sex })!.grade
}

describe('the cycling anchor', () => {
  it('takes the world-class hour of each sex from the power profile table', () => {
    expect(CYCLING_WORLD_CLASS_HOUR_WKG).toEqual({ male: 6.4, female: 5.69 })
  })

  it.each(SEXES)('grades the world-class hour on the bike 100% at an hour for a %s', (sex) => {
    expect(hourGrade(CYCLING_WORLD_CLASS_HOUR_WKG[sex], sex)).toBeCloseTo(1, 6)
  })

  it.each(SEXES)(
    'puts the running world-class hour at a speed the standard grades 100% for a %s',
    (sex) => {
      const speed = worldClassRunHourSpeed(sex)
      expect(gradeAtSpeed(speed, HOUR_S, { age: OPEN_AGE, sex })!.grade).toBeCloseTo(1, 9)
      // The bisection leaves the speed where the standard time at the hour's distance is 3600 s.
      expect(ageStandardSeconds(speed * HOUR_S, OPEN_AGE, sex)).toBeCloseTo(HOUR_S, 6)
    },
  )

  it.each(SEXES)('anchors at an age no one has a faster hour standard at, for a %s', (sex) => {
    const distance = worldClassRunHourSpeed(sex) * HOUR_S
    const open = ageStandardSeconds(distance, OPEN_AGE, sex)!
    for (let age = 5; age <= 100; age++) {
      expect(ageStandardSeconds(distance, age, sex)!).toBeGreaterThanOrEqual(open)
    }
  })

  it('maps a rider at a share of the cycling world-class hour to the run at that share of the running one', () => {
    for (const sex of SEXES) {
      for (const share of [0.5, 0.75, 0.9, 1]) {
        const watts = share * CYCLING_WORLD_CLASS_HOUR_WKG[sex] * MASS_KG
        const speed = equivalenceFor(sex)(watts, MASS_KG).p50
        const runEnergy = flatSpeedToMetabolic(speed)
        const worldClassEnergy = flatSpeedToMetabolic(worldClassRunHourSpeed(sex))
        expect(runEnergy / worldClassEnergy).toBeCloseTo(share, 9)
      }
    }
  })

  it('does not depend on the efficiency prior', async () => {
    // The ride's metabolic figure and the factor are both priced at the prior mean, so the mean cancels: the same watts give the
    // same run at any efficiency the prior is set to.
    const speeds: number[] = []
    for (const mean of [0.18, 0.215, 0.25]) {
      vi.resetModules()
      vi.doMock('../constants', async (original) => {
        const actual = await original<typeof import('../constants')>()
        return {
          ...actual,
          PRIORS: { ...actual.PRIORS, grossEfficiency: { ...actual.PRIORS.grossEfficiency, mean } },
        }
      })
      const fresh = await import('./rideAnchor')
      speeds.push(fresh.equivalenceFor('male')(4.8 * MASS_KG, MASS_KG).p50)
      vi.doUnmock('../constants')
    }
    expect(speeds[0]).toBeCloseTo(speeds[1]!, 9)
    expect(speeds[2]).toBeCloseTo(speeds[1]!, 9)
  })

  it('anchors a woman and a man each to their own standard', () => {
    // The same share of each world-class hour grades the same; the same absolute W/kg does not.
    expect(hourGrade(0.8 * CYCLING_WORLD_CLASS_HOUR_WKG.female, 'female')).toBeCloseTo(
      hourGrade(0.8 * CYCLING_WORLD_CLASS_HOUR_WKG.male, 'male'),
      2,
    )
    expect(hourGrade(5.69, 'male')).toBeLessThan(hourGrade(5.69, 'female'))
    expect(anchorFactor('female')).not.toBeCloseTo(anchorFactor('male'), 3)
  })

  it("reads the men's anchor with no sex given", () => {
    expect(anchorFactor(undefined)).toBe(anchorFactor('male'))
    expect(anchorFactor(null)).toBe(anchorFactor('male'))
  })

  it('grades a rider at the cycling world-class hour at 100%, not the old ratio above it', () => {
    // At the old rule's 21.5% efficiency this ride cost more energy than the running world-class hour, and graded about a fifth high.
    const metabolic = ridePowerToMetabolic(6.4 * MASS_KG, MASS_KG, PRIORS.grossEfficiency.mean)
    expect(metabolic).toBeGreaterThan(flatSpeedToMetabolic(worldClassRunHourSpeed('male')) * 1.15)
    expect(hourGrade(6.4, 'male')).toBeLessThan(1.0001)
  })
})

describe('the sensitivity to the men’s anchor', () => {
  it('moves a ride at 75% of the hour by about 2.4 points if the anchor were 6.60 rather than 6.40', () => {
    // The figure docs/design/cross-sport.md states. Against 6.60 the same ride is 6.40 / 6.60 of the share it is against 6.40.
    const wkg = 0.75 * CYCLING_WORLD_CLASS_HOUR_WKG.male
    const points = (hourGrade(wkg, 'male') - hourGrade((wkg * 6.4) / 6.6, 'male')) * 100
    expect(points).toBeCloseTo(2.4, 1)
  })
})

describe('the range of a ride through the anchor', () => {
  const ride = { value: 24 }

  it('is the anchor alone: exp(+-1.645 x its sd) on the energy', () => {
    const speed = rideRunSpeed(ride, 'male')
    const energy = (v: number) => flatSpeedToMetabolic(v) / anchorFactor('male')
    const z = 1.645 * CYCLING_ANCHOR_LOG_SD
    expect(energy(speed.p05) / ride.value).toBeCloseTo(Math.exp(-z), 9)
    expect(energy(speed.p95) / ride.value).toBeCloseTo(Math.exp(z), 9)
    expect(energy(speed.p50) / ride.value).toBeCloseTo(1, 9)
  })

  it('is widened by a range of its own, read as 10th and 90th percentiles, in quadrature on the log scale', () => {
    const own = rideRunSpeed(
      { value: 24, low: 24 * Math.exp(-0.08), high: 24 * Math.exp(0.05) },
      'male',
    )
    const energy = (v: number) => flatSpeedToMetabolic(v) / anchorFactor('male')
    const anchor = 1.645 * CYCLING_ANCHOR_LOG_SD
    // The 10th and 90th percentiles' distances are scaled by 1.645 / 1.2816 to the 5th and 95th before the anchor adds its own.
    const scale = 1.645 / 1.2816
    expect(Math.log(energy(own.p05) / 24)).toBeCloseTo(-Math.hypot(0.08 * scale, anchor), 9)
    expect(Math.log(energy(own.p95) / 24)).toBeCloseTo(Math.hypot(0.05 * scale, anchor), 9)
  })

  it('is as wide as a normal’s 5th to 95th when its own 10th to 90th is a normal’s', () => {
    // A threshold whose 10th and 90th sit 1.2816 sd either side has a 5th and 95th 1.645 sd out. Added to the anchor's sd in
    // quadrature it must give the 5th and 95th of a normal whose sd is the root of the sum of the two squares.
    const sd = 0.05
    const own = rideRunSpeed(
      { value: 24, low: 24 * Math.exp(-1.2816 * sd), high: 24 * Math.exp(1.2816 * sd) },
      'male',
    )
    const energy = (v: number) => flatSpeedToMetabolic(v) / anchorFactor('male')
    const combined = Math.hypot(sd, CYCLING_ANCHOR_LOG_SD)
    expect(Math.log(energy(own.p95) / 24)).toBeCloseTo(1.645 * combined, 4)
    expect(Math.log(energy(own.p05) / 24)).toBeCloseTo(-1.645 * combined, 4)
  })

  it('takes the distance of an end on the wrong side as it would on the right side', () => {
    const energy = (v: number) => flatSpeedToMetabolic(v) / anchorFactor('male')
    const wrong = rideRunSpeed({ value: 24, low: 24 * Math.exp(0.08) }, 'male')
    const right = rideRunSpeed({ value: 24, low: 24 * Math.exp(-0.08) }, 'male')
    expect(energy(wrong.p05)).toBeCloseTo(energy(right.p05), 9)
  })

  it('keeps the ends ordered and never negative', () => {
    for (const value of [0.5, 5, 24, 40]) {
      const speed = rideRunSpeed({ value, low: value * 0.7, high: value * 1.3 }, 'female')
      expect(speed.p05).toBeGreaterThanOrEqual(0)
      expect(speed.p05).toBeLessThanOrEqual(speed.p50)
      expect(speed.p50).toBeLessThanOrEqual(speed.p95)
    }
  })
})
