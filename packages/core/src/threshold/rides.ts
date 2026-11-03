import { HOUR_S, HR_EFFORT_S, SHORTEST_EFFORT_S } from './constants'
import { DURATION_TABLES } from './durationTables'
import type { DurationTable } from './durationTables'
import type { RideEffort, ThresholdBlock, ThresholdEffort } from './types'

/** The ride's table, for the helpers that read a flat list of efforts and are not told another sport's. */
const RIDE_TABLE = DURATION_TABLES.ride

/** A ride's strongest effort, scaled to the threshold it implies (`DurationTable.threshold`). */
export interface RideBest {
  durationS: number
  value: number
  estimated: boolean
  /** The variance of the duration ratio at that duration (`DurationTable.spread` squared): the ride's weight is over it. */
  variance: number
}

/** The highest measured effort of an hour or longer, as it was held: no scaling, since an hour is the threshold itself. */
export interface HourEffort {
  durationS: number
  value: number
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
  /** The highest measured value held for an hour or longer, or null: an hour the athlete did, which can set a floor under the answer. */
  hour: HourEffort | null
  heart: readonly HeartEffort[]
  blocks: readonly ThresholdBlock[]
}

/** Whether an effort says anything: 3 min or longer, and a value that is positive and finite. */
const counts = (e: RideEffort): boolean =>
  e.durationS >= SHORTEST_EFFORT_S && e.value > 0 && Number.isFinite(e.value)

/**
 * The ride's highest effort scaled by the sport's table, each effort on its own (a run's scaling depends on the effort's value as
 * well as its length); efforts under 3 min, values that are not positive and finite, and efforts the table cannot scale are
 * ignored.
 */
export function bestOf(efforts: readonly RideEffort[], table: DurationTable): RideBest | null {
  let best: RideBest | null = null
  for (const e of efforts) {
    if (!counts(e)) continue
    const value = table.threshold(e.value, e.durationS)
    if (!(value > 0) || !Number.isFinite(value)) continue
    if (best === null || value > best.value) {
      best = {
        durationS: e.durationS,
        value,
        estimated: e.estimated,
        variance: table.spread(e.durationS) ** 2,
      }
    }
  }
  return best
}

/** The ride's highest measured effort of an hour or longer: watts estimated without a meter are not an hour done. */
export function hourOf(efforts: readonly RideEffort[]): HourEffort | null {
  let hour: HourEffort | null = null
  for (const e of efforts) {
    if (!counts(e) || e.estimated || e.durationS < HOUR_S) continue
    if (hour === null || e.value > hour.value) hour = { durationS: e.durationS, value: e.value }
  }
  return hour
}

export function prepareRide(
  activityId: string,
  efforts: readonly RideEffort[],
  blocks: readonly ThresholdBlock[],
  table: DurationTable,
): PreparedRide {
  const heart: HeartEffort[] = []
  for (const e of efforts) {
    if (e.heartRate === null || e.estimated) continue
    if (!(e.durationS >= HR_EFFORT_S[0] && e.durationS <= HR_EFFORT_S[1])) continue
    heart.push({ value: e.value, heartRate: e.heartRate })
  }
  return { activityId, best: bestOf(efforts, table), hour: hourOf(efforts), heart, blocks }
}

/**
 * Rides made from a flat list of efforts and blocks, with the age of each: that of its strongest effort. An activity with
 * blocks and no effort is a ride that gives the line its blocks and the estimate nothing else.
 */
export function prepareFlat(
  efforts: readonly ThresholdEffort[],
  blocks: readonly ThresholdBlock[],
  table: DurationTable = RIDE_TABLE,
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
    const ride = prepareRide(id, own.efforts, own.blocks, table)
    rides.push(ride)
    const strongest =
      ride.best === null
        ? undefined
        : own.efforts.find(
            (e) =>
              e.durationS === ride.best!.durationS &&
              table.threshold(e.value, e.durationS) === ride.best!.value,
          )
    ages.push(Math.max(0, strongest?.ageDays ?? 0))
  }
  return { rides, ages }
}
