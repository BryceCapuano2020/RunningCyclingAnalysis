import { durationRatio } from '../durationRatio'
import type { ThresholdBlock, ThresholdEffort } from '../types'

/*
 * Small synthetic libraries for the unit tests, with no noise so that each test can name what moves the answer. A rider has a
 * known threshold and a heart rate that follows power on a straight line; a ride is some hard riding then easy riding, and gives
 * the bests of 3 to 60 min and the 5 min blocks such a ride would. Watts and bpm.
 */

export interface Rider {
  /** The true threshold power. */
  threshold: number
  /** Beats per minute per watt. */
  slope: number
  /** Heart rate at the true threshold power. */
  thresholdHr: number
}

export const RIDER: Rider = { threshold: 250, slope: 0.4, thresholdHr: 160 }

export const heartRateAt = (rider: Rider, power: number) =>
  rider.thresholdHr - rider.slope * (rider.threshold - power)

/** What the rider can hold for `durationS` going all out. */
export const allOut = (rider: Rider, durationS: number) =>
  rider.threshold * durationRatio(durationS)

export interface RideSpec {
  id: string
  /** Hard riding at the start, at `hardPower`, then easy riding at `easyPower` (60% of threshold if not given). */
  hardS: number
  hardPower: number
  easyPower?: number
  ageDays?: number
  /** Added to every heart rate of the ride: a strap reading high (+) or low (-) that day. */
  offsetBpm?: number
  /** Every heart rate of the ride reads this: a stuck sensor. */
  stuckAt?: number
  noHeartRate?: boolean
  estimated?: boolean
}

export interface Library {
  efforts: ThresholdEffort[]
  blocks: ThresholdBlock[]
}

const DURATIONS_S = [180, 300, 480, 600, 900, 1200, 1800, 2700, 3600]
/** Power of the easy blocks around their mean, and of the hard ones, so a ride's blocks are not all at one power. */
const EASY_SPREAD = [-0.04, -0.02, 0, 0.02, 0.04, -0.03, 0.03, 0.01]
const HARD_SPREAD = [-0.02, 0.02, 0, 0.01, -0.01]

export function ride(rider: Rider, spec: RideSpec): Library {
  const easy = spec.easyPower ?? 0.6 * rider.threshold
  const read = (heartRate: number): number | null =>
    spec.noHeartRate ? null : (spec.stuckAt ?? heartRate + (spec.offsetBpm ?? 0))
  const efforts = DURATIONS_S.map((durationS): ThresholdEffort => {
    const hard = Math.min(durationS, spec.hardS)
    const blend = (a: number, b: number) => (a * hard + b * (durationS - hard)) / durationS
    return {
      activityId: spec.id,
      durationS,
      value: blend(spec.hardPower, easy),
      // The hard stretch is steady, so heart rate is the same blend of the two heart rates, with no lag.
      heartRate: read(blend(heartRateAt(rider, spec.hardPower), heartRateAt(rider, easy))),
      ageDays: spec.ageDays ?? 0,
      estimated: spec.estimated ?? false,
    }
  })
  const blocks: ThresholdBlock[] = []
  const add = (power: number) => {
    const heartRate = read(heartRateAt(rider, power))
    if (heartRate !== null) blocks.push({ activityId: spec.id, heartRate, value: power })
  }
  for (const spread of EASY_SPREAD) add(easy * (1 + spread))
  for (let k = 0; k < Math.floor(spec.hardS / 300); k++) {
    add(spec.hardPower * (1 + HARD_SPREAD[k % HARD_SPREAD.length]!))
  }
  return { efforts, blocks }
}

export function library(rider: Rider, specs: readonly RideSpec[]): Library {
  const built = specs.map((spec) => ride(rider, spec))
  return { efforts: built.flatMap((r) => r.efforts), blocks: built.flatMap((r) => r.blocks) }
}

/** A ride that gave everything for 10 min: its best 10 min is the rider's all-out power. */
export const allOutRide = (rider: Rider, id: string, over: Partial<RideSpec> = {}): RideSpec => ({
  id,
  hardS: 600,
  hardPower: allOut(rider, 600),
  ...over,
})

/** A ride at 94% of all-out for 20 min: steady, near threshold heart rate, and a few percent short of the truth. */
export const steadyRide = (rider: Rider, id: string, over: Partial<RideSpec> = {}): RideSpec => ({
  id,
  hardS: 1200,
  hardPower: 0.94 * allOut(rider, 1200),
  ...over,
})

/** A ride at a share of threshold for 45 min: tempo, never close to all-out. */
export const tempoRide = (rider: Rider, id: string, over: Partial<RideSpec> = {}): RideSpec => ({
  id,
  hardS: 2700,
  hardPower: 0.85 * rider.threshold,
  ...over,
})

/** `count` rides of one kind, named `${prefix}0`, `${prefix}1`, ..., each a day older than the one before. */
export function rides(
  count: number,
  make: (id: string, over: Partial<RideSpec>) => RideSpec,
  prefix: string,
): RideSpec[] {
  return Array.from({ length: count }, (_, i) => make(`${prefix}${i}`, { ageDays: i }))
}
