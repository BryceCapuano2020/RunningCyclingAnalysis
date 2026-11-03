import { HR_EFFORT_S, SHORTEST_EFFORT_S } from './constants'
import { durationRatio, ratioSpread } from './durationRatio'
import type { RideEffort, ThresholdBlock, ThresholdEffort } from './types'

/** A ride's strongest effort, scaled to the threshold it implies (its value over the duration ratio). */
export interface RideBest {
  durationS: number
  value: number
  estimated: boolean
  /** The variance of the duration ratio at that duration (`ratioSpread` squared): the ride's weight is over it. */
  variance: number
}

/** One steady effort the heart-rate estimate may read: measured watts, 8 to 30 min, with a heart rate. */
export interface HeartEffort {
  value: number
  heartRate: number
}

/**
 * One ride as the estimate reads it, worked out once: its strongest scaled effort, the efforts its heart rate reads, and its
 * blocks. Nothing here depends on the window the ride is read in or on the line, so a library prepares each ride once and
 * every window slices the list; only the ride's age, which the window knows, is not part of it.
 */
export interface PreparedRide {
  activityId: string
  best: RideBest | null
  heart: readonly HeartEffort[]
  blocks: readonly ThresholdBlock[]
}

/** The ride's highest scaled effort; efforts under 3 min and values that are not positive and finite are ignored. */
export function bestOf(efforts: readonly RideEffort[]): RideBest | null {
  let best: RideBest | null = null
  for (const e of efforts) {
    if (!(e.durationS >= SHORTEST_EFFORT_S) || !(e.value > 0) || !Number.isFinite(e.value)) continue
    const value = e.value / durationRatio(e.durationS)
    if (best === null || value > best.value) {
      best = {
        durationS: e.durationS,
        value,
        estimated: e.estimated,
        variance: ratioSpread(e.durationS) ** 2,
      }
    }
  }
  return best
}

export function prepareRide(
  activityId: string,
  efforts: readonly RideEffort[],
  blocks: readonly ThresholdBlock[],
): PreparedRide {
  const heart: HeartEffort[] = []
  for (const e of efforts) {
    if (e.heartRate === null || e.estimated) continue
    if (!(e.durationS >= HR_EFFORT_S[0] && e.durationS <= HR_EFFORT_S[1])) continue
    heart.push({ value: e.value, heartRate: e.heartRate })
  }
  return { activityId, best: bestOf(efforts), heart, blocks }
}

/**
 * Rides made from a flat list of efforts and blocks, with the age of each: that of its strongest effort. An activity with
 * blocks and no effort is a ride that gives the line its blocks and the estimate nothing else.
 */
export function prepareFlat(
  efforts: readonly ThresholdEffort[],
  blocks: readonly ThresholdBlock[],
): { rides: PreparedRide[]; ages: number[] } {
  const byId = new Map<string, { efforts: ThresholdEffort[]; blocks: ThresholdBlock[] }>()
  const of = (id: string) => {
    let found = byId.get(id)
    if (found === undefined) byId.set(id, (found = { efforts: [], blocks: [] }))
    return found
  }
  for (const e of efforts) of(e.activityId).efforts.push(e)
  for (const b of blocks) of(b.activityId).blocks.push(b)
  const rides: PreparedRide[] = []
  const ages: number[] = []
  for (const [id, own] of byId) {
    const ride = prepareRide(id, own.efforts, own.blocks)
    rides.push(ride)
    const strongest =
      ride.best === null
        ? undefined
        : own.efforts.find(
            (e) =>
              e.durationS === ride.best!.durationS &&
              e.value / durationRatio(e.durationS) === ride.best!.value,
          )
    ages.push(Math.max(0, strongest?.ageDays ?? 0))
  }
  return { rides, ages }
}
