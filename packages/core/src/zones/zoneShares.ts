import type { ZoneMeasure } from './schemes'
import type { MeasureTime } from './periodTime'

/**
 * What a measure needs before it is shown: this many activities with the measure and zones, and this
 * many seconds between them. Fewer say too little about how the time was spread.
 */
export const MIN_ZONE_ACTIVITIES = 3
export const MIN_ZONE_SECONDS = 3600

/** Whether a measure's time is enough to describe. */
export function hasEnoughZoneTime(time: MeasureTime): boolean {
  return time.counted >= MIN_ZONE_ACTIVITIES && time.totalSeconds >= MIN_ZONE_SECONDS
}

/**
 * The zones that count as easy and as hard, by level, for each measure. Easy is the two lowest zones,
 * recovery and endurance work; hard is from the zone that reaches threshold effort up (Coggan's
 * lactate threshold, Edwards's hard, Friel's sub-threshold). The zones between are the middle.
 */
export const EASY_THROUGH: Record<ZoneMeasure, number> = { power: 2, heartRate: 2, pace: 2 }
export const HARD_FROM: Record<ZoneMeasure, number> = { power: 4, heartRate: 4, pace: 4 }

/** The share of the time in each zone, 0 to 1, or all zeros without any time. */
export function zoneShares(time: Pick<MeasureTime, 'seconds' | 'totalSeconds'>): number[] {
  return time.seconds.map((s) => (time.totalSeconds > 0 ? s / time.totalSeconds : 0))
}

export interface EffortSplit {
  easy: number
  middle: number
  hard: number
}

/** The share of a measure's time that was easy, in between and hard. All zeros without time. */
export function effortSplit(
  time: Pick<MeasureTime, 'measure' | 'seconds' | 'totalSeconds'>,
): EffortSplit {
  const split = { easy: 0, middle: 0, hard: 0 }
  zoneShares(time).forEach((share, i) => {
    const level = i + 1
    if (level <= EASY_THROUGH[time.measure]) split.easy += share
    else if (level >= HARD_FROM[time.measure]) split.hard += share
    else split.middle += share
  })
  return split
}

/** The zone with the largest share, 1 for the lowest effort; null without time. Ties go to the lower zone. */
export function mainZone(
  time: Pick<MeasureTime, 'seconds' | 'totalSeconds'>,
): { level: number; share: number } | null {
  const shares = zoneShares(time)
  let best = -1
  shares.forEach((share, i) => {
    if (share > 0 && (best < 0 || share > shares[best]!)) best = i
  })
  return best < 0 ? null : { level: best + 1, share: shares[best]! }
}

export interface ZoneShift {
  /** 1 for the lowest effort. */
  level: number
  /** The share of the time then, and the share now, 0 to 1. */
  before: number
  after: number
}

/**
 * The zone whose share of the time moved most between two periods of the same measure, or null when
 * either has no time. The size is the change in share, in absolute terms: from 20% to 30% is 0.1.
 */
export function biggestShift(before: MeasureTime, after: MeasureTime): ZoneShift | null {
  if (before.totalSeconds <= 0 || after.totalSeconds <= 0) return null
  const [then, now] = [zoneShares(before), zoneShares(after)]
  let shift: ZoneShift | null = null
  now.forEach((share, i) => {
    const change = Math.abs(share - then[i]!)
    if (shift === null || change > Math.abs(shift.after - shift.before)) {
      shift = { level: i + 1, before: then[i]!, after: share }
    }
  })
  return shift
}

/** Whether any counted activity used the app's estimate, not an entered setting. */
function usedEstimate(time: MeasureTime): boolean {
  return time.counted > time.entered
}

/**
 * Whether two periods of a measure were cut by the same zones as far as the athlete's own entries go. An
 * estimated reference is the same in both (the analysis on screen supplies it), and a dated body weight that
 * moves an estimated ride threshold is the app's own figure moving, so neither stops a comparison. What does
 * is an entered setting that changed between the periods, one entered for one period and not the other, or
 * one period using an estimate for some of its activities and the other not: the zones then moved, and a
 * change in shares may be the zones and not the athlete.
 *
 * The estimate clause is a guard against a future back-fill policy, and cannot fire today. The earliest entry
 * of a kind and sport applies before its own date (`entryAt`), so a sport's measure is entered for every
 * activity or for none, in both periods alike, and `entered` is `counted` or 0. Were an entry to stop
 * applying before its date, a period could mix entered and estimated zones, and this clause would stop the
 * comparison.
 */
export function sameEnteredReferences(a: MeasureTime, b: MeasureTime): boolean {
  return (
    a.enteredReferences.length === b.enteredReferences.length &&
    a.enteredReferences.every((r, i) => r === b.enteredReferences[i]) &&
    usedEstimate(a) === usedEstimate(b)
  )
}
