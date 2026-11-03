import { mulberry32, normal } from '../../math'
import { durationRatio } from '../durationRatio'
import type { ThresholdBlock, ThresholdEffort } from '../types'

/*
 * Simulated riders with a known threshold, for threshold.sim.test.ts: each has a few weeks of rides (easy, tempo or hard), the
 * bests and 5 min blocks those rides give, and a heart rate that follows power through a line of its own. A scenario spoils
 * one thing at a time: a strap that reads wrong on some rides, a wrong maximum heart rate, an optical sensor that barely moves,
 * a rider who never goes all out, no heart rate at all.
 */

export interface Scenario {
  name: string
  /** Optical heart rate: it rises a third as fast with power as it should. */
  flat?: boolean
  /** About one ride in four has a strap fault: reads 15 to 30 bpm high or low, stuck at one value, or drops out. */
  faults?: boolean
  /** The reference maximum heart rate is wrong by about this many bpm (one standard deviation). */
  referenceError?: number
  /** Every ride is easy or tempo; none goes all out. */
  tempoOnly?: boolean
  noHeartRate?: boolean
  /** The strap reads this many bpm off everywhere, reference maximum included. */
  strapOffset?: number
  /** Mostly easy and tempo days, with the odd hard one. */
  fewHard?: boolean
}

export interface SimRider {
  /** The true threshold, in watts. */
  threshold: number
  efforts: ThresholdEffort[]
  blocks: ThresholdBlock[]
  thresholdHr: number | null
}

const DURATIONS_S = [3, 5, 8, 10, 15, 20, 30, 45, 60].map((m) => m * 60)
type Fault = { add?: number; fixed?: number; drop?: boolean }

export function simRiders(scenario: Scenario, count: number, seed: number): SimRider[] {
  const rand = mulberry32(seed)
  const uni = (a: number, b: number) => a + (b - a) * rand()
  const gauss = () => normal(rand)
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!
  return Array.from({ length: count }, () => {
    const threshold = uni(180, 330)
    const tilt = 0.04 * gauss() // a sprinter (+) or a diesel (-)
    const fade = 0.02 * gauss()
    const allOut = (s: number) => {
      const shortness = s <= 1200 ? Math.log(1200 / s) / Math.log(1200 / 180) : 0
      const longness = s > 1200 ? Math.log(s / 1200) / Math.log(3) : 0
      return threshold * durationRatio(s) * (1 + tilt * shortness) * (1 - fade * longness)
    }
    const maxHr = uni(175, 200)
    const trueThresholdHr = maxHr * uni(0.87, 0.93) // the estimate assumes 0.90
    const wattsPerBeat = uni(1.5, 3)
    const steadyHr = (p: number) =>
      Math.min(
        maxHr,
        trueThresholdHr - (threshold - p) / (scenario.flat ? 3 * wattsPerBeat : wattsPerBeat),
      )
    const efforts: ThresholdEffort[] = []
    const blocks: ThresholdBlock[] = []
    const rides = Math.floor(uni(6, 20))
    for (let r = 0; r < rides; r++) {
      const activityId = `r${r}`
      const ageDays = uni(0, 42)
      const kinds = scenario.tempoOnly
        ? ['easy', 'tempo', 'tempo']
        : scenario.fewHard
          ? ['easy', 'easy', 'tempo', 'tempo', 'tempo', 'hard']
          : ['easy', 'easy', 'tempo', 'hard', 'hard']
      const kind = pick(kinds)
      const easy = threshold * uni(0.55, 0.68)
      let hardS = 3600
      let hard = easy
      if (kind === 'tempo') {
        hardS = pick([20, 30, 45, 60]) * 60
        hard = threshold * uni(0.8, 0.92)
      } else if (kind === 'hard') {
        hardS = pick([3, 5, 8, 10, 12, 15, 20]) * 60
        hard = allOut(hardS) * uni(0.93, 1.0)
      }
      const dayHr = 3 * gauss()
      const drift = uni(0, 5) // the ride's own drift, shared by its blocks and efforts
      const fault: Fault | null =
        scenario.faults && rand() < 0.25
          ? pick<Fault>([
              { add: uni(15, 30) },
              { add: -uni(15, 30) },
              { fixed: uni(150, 190) },
              { drop: true },
            ])
          : null
      const read = (h: number): number | null => {
        if (scenario.noHeartRate || fault?.drop) return null
        let v = h + dayHr + drift + (scenario.strapOffset ?? 0)
        if (fault?.fixed !== undefined) v = fault.fixed
        if (fault?.add !== undefined) v += fault.add
        return v
      }
      const hardHr = steadyHr(hard)
      const easyHr = steadyHr(easy)
      for (const s of DURATIONS_S) {
        const inside = s <= hardS
        const value = inside ? hard * (1 + 0.01 * gauss()) : (hard * hardS + easy * (s - hardS)) / s
        const lag = inside ? (90 / s) * (1 - Math.exp(-s / 90)) : 0
        const rise = inside ? 0.12 * Math.max(0, s / 60 - 10) : 0
        const h = inside
          ? hardHr - (hardHr - easyHr) * lag + rise
          : (hardHr * hardS + easyHr * (s - hardS)) / s
        efforts.push({
          activityId,
          durationS: s,
          value,
          heartRate: read(h),
          ageDays,
          estimated: false,
        })
      }
      // A 5 min block: its power, and the steady heart rate of `at` (the tempo's own power, not the block's noise).
      const block = (value: number, at: number) => {
        const heartRate = read(steadyHr(at) + 2 * gauss())
        if (heartRate !== null) blocks.push({ activityId, heartRate, value })
      }
      for (let k = 0; k < 8; k++) {
        const value = easy * (1 + 0.04 * gauss())
        block(value, value)
      }
      if (kind === 'tempo') {
        for (let k = 0; k < Math.floor(hardS / 300); k++) block(hard * (1 + 0.02 * gauss()), hard)
      }
    }
    const referenceMax =
      maxHr +
      (scenario.referenceError ?? 0) * gauss() -
      Math.abs(2 * gauss()) +
      (scenario.strapOffset ?? 0)
    return {
      threshold,
      efforts,
      blocks,
      thresholdHr: scenario.noHeartRate ? null : 0.9 * referenceMax,
    }
  })
}
