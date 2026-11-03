import { mulberry32, normal } from '../../math'
import { DURATION_TABLES } from '../durationTables'
import type { DurationTable } from '../durationTables'
import type { ThresholdBlock, ThresholdEffort } from '../types'

/*
 * Simulated riders with a known threshold, for threshold.sim.test.ts, and runners in the same mould for runThreshold.sim.test.ts:
 * each has a few weeks of rides (easy, tempo or hard), the
 * bests and 5 min blocks those rides give, and a heart rate that follows power through a line of its own. A scenario spoils
 * one thing at a time: a strap that reads wrong on some rides, a wrong maximum heart rate, an optical sensor that barely moves,
 * a rider who never goes all out, no heart rate at all. One more makes every hard ride all out, the rider whose bests are a
 * ceiling.
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
  /** Every hard ride is all out: its best is what the rider can do, not 0 to 7% under it. */
  allOut?: boolean
  noHeartRate?: boolean
  /** How much the athletes' efforts depart from the table, as a multiple of the usual spread (1): a sprinter or a diesel. */
  enduranceSpread?: number
}

/** What differs between the sports: the duration table the efforts are drawn from, and the scale of the unit. */
export interface Profile {
  table: DurationTable
  /** The true threshold is drawn between these, in the unit of the efforts (watts; gross metabolic W/kg). */
  threshold: readonly [number, number]
  /** An easy day is this share of threshold. */
  easy: readonly [number, number]
}

export const RIDER: Profile = {
  table: DURATION_TABLES.ride,
  threshold: [180, 330],
  easy: [0.55, 0.68],
}
/** A runner's easy day is a larger share of threshold: the gross metabolic rate holds a resting part that does not scale. */
export const RUNNER: Profile = {
  table: DURATION_TABLES.run,
  threshold: [13, 19],
  easy: [0.68, 0.8],
}

export interface SimRider {
  /** The true threshold, in the unit of the profile. */
  threshold: number
  efforts: ThresholdEffort[]
  blocks: ThresholdBlock[]
  thresholdHr: number | null
}

const DURATIONS_S = [3, 5, 8, 10, 15, 20, 30, 45, 60].map((m) => m * 60)
type Fault = { add?: number; fixed?: number; drop?: boolean }

export function simRiders(
  scenario: Scenario,
  count: number,
  seed: number,
  profile: Profile = RIDER,
): SimRider[] {
  const rand = mulberry32(seed)
  const uni = (a: number, b: number) => a + (b - a) * rand()
  const gauss = () => normal(rand)
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!
  return Array.from({ length: count }, () => {
    const threshold = uni(...profile.threshold)
    const wide = scenario.enduranceSpread ?? 1
    const tilt = 0.04 * wide * gauss() // a sprinter (+) or a diesel (-)
    const fade = 0.02 * wide * gauss()
    const allOut = (s: number) => {
      const shortness = s <= 1200 ? Math.log(1200 / s) / Math.log(1200 / 180) : 0
      const longness = s > 1200 ? Math.log(s / 1200) / Math.log(3) : 0
      return profile.table.held(threshold, s) * (1 + tilt * shortness) * (1 - fade * longness)
    }
    const maxHr = uni(175, 200)
    const trueThresholdHr = maxHr * uni(0.87, 0.93) // the estimate assumes 0.90
    // Heart rate climbs this many bpm from half to full threshold power, whatever the rider's size (the line is refused
    // outside 20 to 70), so a big rider gets more watts per beat than a small one.
    const climb = uni(25, 65)
    const wattsPerBeat = (0.5 * threshold) / climb
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
        : ['easy', 'easy', 'tempo', 'hard', 'hard']
      const kind = pick(kinds)
      const easy = threshold * uni(...profile.easy)
      let hardS = 3600
      let hard = easy
      if (kind === 'tempo') {
        hardS = pick([20, 30, 45, 60]) * 60
        hard = threshold * uni(0.8, 0.92)
      } else if (kind === 'hard') {
        hardS = pick([3, 5, 8, 10, 12, 15, 20]) * 60
        // Drawn whatever the scenario, so an all-out rider is the same rider as in every other case.
        const short = uni(0.93, 1.0)
        hard = allOut(hardS) * (scenario.allOut ? 1 : short)
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
        let v = h + dayHr + drift
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
    const referenceMax = maxHr + (scenario.referenceError ?? 0) * gauss() - Math.abs(2 * gauss())
    return {
      threshold,
      efforts,
      blocks,
      thresholdHr: scenario.noHeartRate ? null : 0.9 * referenceMax,
    }
  })
}
