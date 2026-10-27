import { describe, expect, it } from 'vitest'
import { FLAT_RUN_COST, PRIORS } from '../constants'
import type { Curve, CurvePoint, CriticalPowerFit } from '../types'
import {
  criticalPowerOutcome,
  fitCriticalPower,
  fitCriticalPowerUnchecked,
  predictCritical,
  wPrimeFloor,
} from './criticalPower'

const point = (durationS: number, value: number): CurvePoint => ({
  durationS,
  value,
  activityId: 'a',
  startIndex: 0,
})

const synthetic = (durations: number[], cp: number, wPrime: number): Curve =>
  durations.map((d) => point(d, cp + wPrime / d))

describe('fitCriticalPower', () => {
  it('recovers cp and wPrime exactly from a noise-free curve', () => {
    const curve = synthetic([180, 300, 600, 1200], 250, 20000)
    const fit = fitCriticalPower(curve)
    expect(fit).not.toBeNull()
    expect(fit?.cp).toBeCloseTo(250, 6)
    expect(fit?.wPrime).toBeCloseTo(20000, 4)
    expect(fit?.r2).toBeCloseTo(1, 9)
    expect(fit?.cpSe).toBeCloseTo(0, 6)
    expect(fit?.nPoints).toBe(4)
  })

  it('ignores points outside the default range, non-finite values and non-positive durations', () => {
    const curve = [
      point(5, 999),
      ...synthetic([180, 300, 600, 1200], 250, 20000),
      point(420, NaN),
      point(3600, 1),
    ]
    const fit = fitCriticalPower(curve)
    expect(fit?.nPoints).toBe(4)
    expect(fit?.cp).toBeCloseTo(250, 6)
  })

  it('treats durations at or below zero as unusable when minS allows them', () => {
    const curve = [point(0, 500), ...synthetic([180, 300, 600, 1200], 250, 20000)]
    const fit = fitCriticalPower(curve, { minS: 0 })
    expect(fit?.nPoints).toBe(4)
    expect(fit?.cp).toBeCloseTo(250, 6)
  })

  it('honours custom minS and maxS bounds', () => {
    const curve = synthetic([120, 180, 300, 600, 1200], 250, 20000)
    const fit = fitCriticalPower(curve, { minS: 180 })
    expect(fit?.nPoints).toBe(4)
    expect(fit?.wPrime).toBeCloseTo(20000, 4)
    expect(fitCriticalPower(curve, { minS: 300 })).toBeNull()
    expect(fitCriticalPower(curve, { minS: 300, maxS: 600 })).toBeNull()
  })

  it('computes the intercept standard error by hand on noisy data', () => {
    // Durations 200, 250, 500, 1000 give x = 1/d = 0.005, 0.004, 0.002, 0.001.
    // Least squares gives cp = 100, wPrime = 10000, SSE = 4, n = 4, meanX = 0.003,
    // Sxx = 1e-5, so cpSe^2 = (4 / 2) * (1 / 4 + 0.003^2 / 1e-5) = 2 * 1.15 = 2.3.
    // The window is stated as 200 to 1000 s, since these efforts stop short of 20 minutes.
    const curve = [point(200, 151), point(250, 139), point(500, 119), point(1000, 111)]
    const fit = fitCriticalPower(curve, { maxS: 1000 })
    expect(fit?.nPoints).toBe(4)
    expect(fit?.cp).toBeCloseTo(100, 6)
    expect(fit?.wPrime).toBeCloseTo(10000, 6)
    expect(fit?.r2).toBeCloseTo(250 / 251, 9)
    expect(fit?.cpSe).toBeCloseTo(Math.sqrt(2.3), 9)
  })

  it('returns null when all values are equal, since no work capacity can be read from them', () => {
    const curve = [point(200, 300), point(400, 300), point(800, 300), point(1200, 300)]
    expect(fitCriticalPower(curve)).toBeNull()
  })

  it('returns null with fewer than 4 usable points, even when three fit exactly', () => {
    // Three points leave one residual degree of freedom, so the standard error is not meaningful.
    expect(fitCriticalPower(synthetic([180, 300, 600], 250, 20000))).toBeNull()
    expect(fitCriticalPower([point(300, 300), point(600, 280)])).toBeNull()
    const withNaN = [point(300, 300), point(600, 280), point(900, NaN), point(1200, 260)]
    expect(fitCriticalPower(withNaN)).toBeNull()
    expect(fitCriticalPower([])).toBeNull()
  })

  it('returns null when all points share one duration', () => {
    const curve = [point(300, 250), point(300, 260), point(300, 270)]
    expect(fitCriticalPower(curve)).toBeNull()
  })

  it('returns null when wPrime is negative', () => {
    const curve = [point(200, 100), point(400, 200), point(800, 300), point(1200, 320)]
    expect(fitCriticalPower(curve)).toBeNull()
  })

  it('returns null for a flat curve, since its intercept is the mean and so not below the lowest value', () => {
    // The values are symmetric about their mean in 1 / durationS, so the slope is zero and the
    // intercept, 100, sits above the lowest value in the window, 50.
    const curve = [point(200, 100), point(1200, 50), point(1200, 150), point(200, 100)]
    expect(fitCriticalPower(curve)).toBeNull()
  })

  it('returns null when the intercept sits above the lowest effort in the window', () => {
    // The 20 minute effort is 99.9, but the line through the four efforts has its intercept at
    // 99.93. A threshold above the best 20 minutes cannot be right, so the fit is rejected.
    const curve = [point(180, 100), point(300, 100), point(600, 100), point(1200, 99.9)]
    expect(fitCriticalPower(curve)).toBeNull()
  })

  it('keeps a fit whose intercept sits below its lowest effort in the window', () => {
    // The intercept is 67.7 and the 20 minute effort is 70, so the threshold is slower than it.
    const curve = [point(180, 100), point(300, 90), point(600, 80), point(1200, 70)]
    const fit = fitCriticalPower(curve)
    expect(fit?.cp).toBeCloseTo(67.6888889, 6)
    expect(fit?.cp).toBeLessThan(70)
  })

  it('returns null when cp is not positive', () => {
    const curve = synthetic([200, 300, 600, 1200], -100, 20000)
    expect(fitCriticalPower(curve)).toBeNull()
  })
})

describe('the fit window reaches 20 minutes', () => {
  it('refuses a window whose longest effort is 7 minutes, however well the efforts fit', () => {
    // The corpus file 2013-02-06-12-11-14.fit has efforts from 3 to 7 minutes only.
    const curve = synthetic([180, 240, 300, 420], 250, 20000)
    expect(criticalPowerOutcome(curve)).toEqual({ fit: null, refusal: 'missing' })
  })

  it('refuses a window that stops at 18 minutes', () => {
    const curve = synthetic([180, 300, 600, 1100], 250, 20000)
    expect(criticalPowerOutcome(curve)).toEqual({ fit: null, refusal: 'missing' })
  })

  it('accepts a window whose longest effort is within 5% of 20 minutes, 1140 s', () => {
    const curve = synthetic([180, 300, 600, 1140], 250, 20000)
    expect(criticalPowerOutcome(curve).fit?.cp).toBeCloseTo(250, 6)
  })

  it('takes the reach from minLongestS when the caller sets one, so a window may stop at 10 minutes', () => {
    const curve = synthetic([180, 240, 300, 420, 600], 250, 20000)
    expect(criticalPowerOutcome(curve).refusal).toBe('missing')
    expect(criticalPowerOutcome(curve, { minLongestS: 600 }).fit?.cp).toBeCloseTo(250, 6)
    expect(criticalPowerOutcome(curve, { minLongestS: 900 }).refusal).toBe('missing')
  })

  it('reaches the top of a window the caller sets, not the default 20 minutes', () => {
    const curve = synthetic([200, 250, 500, 1000], 100, 10000)
    expect(criticalPowerOutcome(curve, { maxS: 1000 }).fit).not.toBeNull()
  })
})

describe('why a fit is refused', () => {
  it('reports missing efforts when fewer than four fall in the window', () => {
    expect(criticalPowerOutcome(synthetic([180, 300, 600], 250, 20000)).refusal).toBe('missing')
  })

  it('reports a flat curve as a shape refusal, since the efforts are there but show no threshold', () => {
    const flat = [point(200, 100), point(1200, 50), point(1200, 150), point(200, 100)]
    expect(criticalPowerOutcome(flat)).toEqual({ fit: null, refusal: 'shape' })
  })

  it('reports an intercept above the lowest effort as a shape refusal', () => {
    const curve = [point(180, 100), point(300, 100), point(600, 100), point(1200, 99.9)]
    expect(criticalPowerOutcome(curve)).toEqual({ fit: null, refusal: 'shape' })
  })

  it('reports no refusal for a fit that holds', () => {
    const outcome = criticalPowerOutcome(synthetic([180, 300, 600, 1200], 250, 20000))
    expect(outcome.refusal).toBeNull()
    expect(outcome.fit?.cp).toBeCloseTo(250, 6)
  })

  it('refuses a fit whose work capacity is below the least it is given (H1)', () => {
    // W' of 100 is below the 390 the floor asks for, but it is positive, so a sign test alone accepts it.
    const curve = synthetic([180, 300, 600, 1200], 250, 100)
    expect(criticalPowerOutcome(curve).fit).not.toBeNull()
    expect(criticalPowerOutcome(curve, { minWPrime: 390 })).toEqual({
      fit: null,
      refusal: 'shape',
    })
    expect(criticalPowerOutcome(curve, { minWPrime: 50 }).fit).not.toBeNull()
  })

  it('sets the least running work capacity at 15 m of the flat cost, and cycling at 3 kJ', () => {
    // 15 m at 3.9 J per kg per metre is 58.5 J/kg, the unit a running curve is fitted in.
    expect(wPrimeFloor('run', 75)).toBeCloseTo(15 * FLAT_RUN_COST, 9)
    expect(wPrimeFloor('run', 75)).toBeCloseTo(58.5, 9)
    // 3 kJ of mechanical work, on the metabolic curve at the prior efficiency and 75 kg.
    expect(wPrimeFloor('ride', 75)).toBeCloseTo(3_000 / (PRIORS.grossEfficiency.mean * 75), 9)
  })
})

describe('fitCriticalPowerUnchecked, which cuts heart rate as before refusals', () => {
  it('keeps a fit whose intercept is above its lowest effort, which the checked fit refuses', () => {
    const curve = [point(180, 100), point(300, 100), point(600, 100), point(1200, 99.9)]
    expect(fitCriticalPowerUnchecked(curve)).not.toBeNull()
  })

  it('keeps a window that stops short of 20 minutes, which the checked fit refuses', () => {
    const curve = synthetic([180, 240, 300, 420], 250, 20000)
    expect(fitCriticalPowerUnchecked(curve)?.cp).toBeCloseTo(250, 6)
  })

  it('still returns null for the failures it always did', () => {
    expect(
      fitCriticalPowerUnchecked([
        point(200, 300),
        point(400, 300),
        point(800, 300),
        point(1200, 300),
      ]),
    ).toBeNull()
    expect(fitCriticalPowerUnchecked(synthetic([200, 300, 600, 1200], 250, -20000))).toBeNull()
    expect(fitCriticalPowerUnchecked(synthetic([180, 300, 600], 250, 20000))).toBeNull()
  })
})

describe('predictCritical', () => {
  it('evaluates cp + wPrime / durationS', () => {
    const fit: CriticalPowerFit = { cp: 250, wPrime: 20000, cpSe: 0, r2: 1, nPoints: 4 }
    expect(predictCritical(fit, 300)).toBeCloseTo(316.6666667, 6)
    expect(predictCritical(fit, 1200)).toBeCloseTo(266.6666667, 6)
    expect(predictCritical(fit, 1e12)).toBeCloseTo(250, 6)
  })
})
