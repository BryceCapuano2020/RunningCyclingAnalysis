import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { mulberry32, normal } from '../math'
import type { ActivityDigest } from '../types'
import { fitnessStatuses } from './compute'
import { km, runDigest, START } from './test/runDigest'

/**
 * RCA-009's bound: the fitted coefficient on the grade credit is an attenuated one (about a third of a structural
 * pass-through of 1 here), but the unit is fitted with the heart rate and the credit together, so what is left in a run's
 * value is orthogonal to the credit in the library. A change of route with no change of fitness, which moves the average
 * credit by 1% to 2% (a lot of hill), must therefore leave the status level: observed, the change it reads is under 0.1%,
 * against the 4% the status reports.
 */
function library(shift: number, weeks = 110, shiftAtWeek = 60, seed = 5): ActivityDigest[] {
  const random = mulberry32(seed)
  const digests: ActivityDigest[] = []
  for (let w = 0; w < weeks; w++) {
    for (let r = 0; r < 3; r++) {
      const splits = Array.from({ length: 8 }, () => {
        const credit = Math.max(
          -0.12,
          Math.min(0.12, (w >= shiftAtWeek ? shift : 0) + 0.05 * normal(random)),
        )
        // Heart rate answers to speed and to the credit (pass-through 1): at one heart rate the speed follows the credit down.
        const lnv = Math.log(3.3) + 0.03 * normal(random) - 0.3 * credit
        const hr = 150 + 45 * (lnv - Math.log(3.3) + credit) + 4.85 * normal(random)
        return km({
          seconds: 1000 / Math.exp(lnv),
          avgHeartRate: Math.round(hr * 10) / 10,
          grade: credit,
        })
      })
      digests.push(
        runDigest({ id: `rs${w}-${r}`, startMs: START + (w * 7 + r * 2) * DAY_MS, km: splits }),
      )
    }
  }
  return digests
}

describe('a change of route with no change of fitness', () => {
  for (const shift of [0.01, 0.02]) {
    it(`leaves the status level when the average credit moves by ${shift * 100}%`, () => {
      const digests = library(shift)
      const status = fitnessStatuses(digests, new Set()).run
      expect(status.evidence!.method.gradePassThrough).toBeLessThan(0.6)
      expect(status.state).toBe('holding')
      // What the shift leaves in the value is far inside the 4% the status reports.
      expect(Math.abs(status.change!.value)).toBeLessThan(0.005)
    })
  }

  it('is level with no shift at all, the same library', () => {
    const status = fitnessStatuses(library(0), new Set()).run
    expect(status.state).toBe('holding')
    expect(Math.abs(status.change!.value)).toBeLessThan(0.005)
  })
})
