import { describe, expect, it, vi } from 'vitest'
import { PRIORS, RESTING_W_PER_KG } from '../constants'
import { combine, digestActivity } from '../digest'
import { mulberry32 } from '../math'
import { DEFAULT_ATHLETE, sampleDataset } from '../synthetic'
import type { Comparison, ComparisonPoint, Curve, HrCrossCheck } from '../types'
import { compareSports } from './compareSports'
import { calibrationWeights, drawPriors } from './sampling'
import { weightedInterval } from './weightedQuantile'

/**
 * compareSports as it was before its orders were shared: every interval sorted its own values.
 * The shared orders must give exactly these numbers.
 */
function sortEveryInterval(
  runCurve: Curve,
  rideCurve: Curve,
  massKg: number,
  hr: HrCrossCheck | null,
  opts: { draws?: number; seed?: number } = {},
): Comparison {
  const { ge, s } = drawPriors(opts.draws ?? 4000, opts.seed ?? 1)
  const draws = ge.length
  const equal = new Float64Array(draws).fill(1)
  const calibration = calibrationWeights(ge, s, hr)
  const weights = calibration?.accepted ? calibration.weights : null
  const runM = new Float64Array(draws)
  const rideM = new Float64Array(draws)
  const ratio = new Float64Array(draws)
  const prior: ComparisonPoint[] = []
  const calibrated: ComparisonPoint[] = []
  for (let i = 0; i < runCurve.length; i++) {
    const runPoint = runCurve[i]!
    const ridePoint = rideCurve[i]!
    if (!Number.isFinite(runPoint.value) || !Number.isFinite(ridePoint.value)) continue
    for (let d = 0; d < draws; d++) {
      runM[d] =
        RESTING_W_PER_KG +
        (s[d]! / PRIORS.runEconomyScale.mean) * (runPoint.value - RESTING_W_PER_KG)
      rideM[d] = ridePoint.value / (ge[d]! * massKg)
      ratio[d] = runM[d]! / rideM[d]!
    }
    const summarise = (w: Float64Array): ComparisonPoint => ({
      durationS: runPoint.durationS,
      ratio: weightedInterval(ratio, w),
      runMetabolic: weightedInterval(runM, w),
      rideMetabolic: weightedInterval(rideM, w),
    })
    prior.push(summarise(equal))
    if (weights !== null) calibrated.push(summarise(weights))
  }
  return {
    prior,
    calibrated: weights === null ? null : calibrated,
    ...(calibration === null
      ? {}
      : {
          calibration: {
            effectiveSamples: calibration.effectiveSamples,
            draws: calibration.draws,
            accepted: calibration.accepted,
          },
        }),
  }
}

function curve(values: number[]): Curve {
  return values.map((value, i) => ({
    durationS: 60 * (i + 1),
    value,
    activityId: null,
    startIndex: -1,
  }))
}

function hrCheck(kappa: number | null, lnKappaSe: number | null): HrCrossCheck {
  return { run: null, ride: null, kappa, lnKappaSe }
}

const MASS_KG = 70

/** Strict equality tells -0 from 0, and treats NaN as equal to NaN. */
function expectSameNumbers(
  run: number[],
  ride: number[],
  hr: HrCrossCheck | null,
  opts?: { draws?: number; seed?: number },
  massKg = MASS_KG,
) {
  const runCurve = curve(run)
  const rideCurve = curve(ride)
  expect(compareSports(runCurve, rideCurve, massKg, hr, opts)).toStrictEqual(
    sortEveryInterval(runCurve, rideCurve, massKg, hr, opts),
  )
}

describe('compareSports sorting', () => {
  it('sorts each quantity once per duration, not once per interval', () => {
    const run = curve([24, 18, 12])
    const ride = curve([420, 330, 250])
    const typedArray = Object.getPrototypeOf(Uint8Array.prototype) as { sort: () => unknown }
    const onArray = vi.spyOn(Array.prototype, 'sort')
    const onTyped = vi.spyOn(typedArray, 'sort')
    try {
      compareSports(run, ride, MASS_KG, hrCheck(1.1, 0.05))
      // The ratio is sorted once for each duration; the run and ride draws once for all of them.
      expect(onArray.mock.calls.length + onTyped.mock.calls.length).toBeLessThanOrEqual(
        run.length + 2,
      )
    } finally {
      onArray.mockRestore()
      onTyped.mockRestore()
    }
  })
})

describe('compareSports against sorting every interval', () => {
  it('matches on curves that agree, with and without a heart-rate cross-check', () => {
    for (const hr of [null, hrCheck(1.1, 0.02), hrCheck(3, 0.05), hrCheck(1.1, null)]) {
      expectSameNumbers([4, 8, 20], [64.2, 120, 301], hr)
    }
  })

  it('matches when a run value is at or below resting, where the order of the draws flips', () => {
    expectSameNumbers([RESTING_W_PER_KG, 0.5, 0, -3], [200, 200, 200, 200], hrCheck(1.1, 0.1))
  })

  it('matches when a ride value is zero or negative, so the draws tie or flip', () => {
    expectSameNumbers([10, 10, 10], [0, -150, 150], hrCheck(1.1, 0.1))
  })

  it('matches when every ride draw ties at zero and the ratio is infinite', () => {
    expectSameNumbers([0, 0], [0, 0], null, { draws: 3 })
  })

  it('matches with few draws, one draw, other seeds and other masses', () => {
    for (const draws of [1, 2, 5, 40]) {
      expectSameNumbers([6, 12], [150, 280], hrCheck(1.05, 0.2), { draws, seed: draws })
    }
    expectSameNumbers([6, 12], [150, 280], hrCheck(1.05, 0.2), { seed: 99 }, 52.5)
  })

  it('matches on a seeded random library of curves, skipping the non-finite values', () => {
    const rand = mulberry32(2024)
    const between = (low: number, high: number) => low + (high - low) * rand()
    // Mostly plausible values, with the awkward ones mixed in at every position.
    const awkward = [0, -2, RESTING_W_PER_KG, 0.3, Number.NaN, Infinity]
    const value = (low: number, high: number) =>
      rand() < 0.15 ? awkward[Math.floor(rand() * awkward.length)]! : between(low, high)
    for (let round = 0; round < 60; round++) {
      const points = 1 + Math.floor(rand() * 8)
      const run = Array.from({ length: points }, () => value(2, 28))
      const ride = Array.from({ length: points }, () => value(80, 520))
      const kappa = rand() < 0.2 ? null : between(0.7, 1.7)
      const hr = rand() < 0.15 ? null : hrCheck(kappa, rand() < 0.1 ? null : between(0.02, 0.3))
      const opts = { draws: rand() < 0.5 ? undefined : 1 + Math.floor(rand() * 600), seed: round }
      expectSameNumbers(run, ride, hr, opts, between(45, 110))
    }
  })

  it('matches on the comparison of a whole library', () => {
    const digests = sampleDataset().activities.map(digestActivity)
    const { runCurve, rideCurve, hr, comparison } = combine(digests, DEFAULT_ATHLETE)
    expect(comparison).toStrictEqual(
      sortEveryInterval(runCurve, rideCurve, DEFAULT_ATHLETE.massKg, hr),
    )
    expect(comparison.prior.length).toBeGreaterThan(5)
  })
})
