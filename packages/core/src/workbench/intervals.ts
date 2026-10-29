import { medianInPlace } from '../math'
import { isMovingSecond } from './moving'
import { isTraceObservation } from './selection'
import type { ActivityLap, ActivityTrace, TraceMetric } from './types'

const WINDOW_S = 30
const MIN_INTERVAL_S = 60
/** Two stretches on the same side of the typical level are one bout unless the athlete was back near it for this long. */
const MIN_RECOVERY_S = 30
/** A stretch that is more than this share of the activity is how the activity was run, not a bout in it. */
const MAX_BOUT_SHARE = 0.4
/**
 * Bouts are repeats of each other only when the recovery between them is no longer than this, or three times
 * the longer bout. A warm-up and a cool-down around a long steady block are two stretches on one side with the
 * block between them, not repeats.
 */
const MAX_RECOVERY_S = 600
const MAX_RECOVERY_BOUTS = 3

/** A stretch of windows all well above (1) or well below (-1) the activity's typical level, in seconds. */
interface Stretch {
  startS: number
  endS: number
  direction: number
  /** The sum of its windows' distances from the typical level, and how many windows that is. */
  distance: number
  windows: number
}

/**
 * Finds repeated efforts; returned segments are suggestions for editing. Each 30 s window is compared with the
 * activity's typical level, the median of its windows, so a walk to the start, a stationary start or a slow
 * warm-up does not set the level every later window is judged against.
 *
 * A stretch well above or below that level is a bout only when the activity has at least two such stretches on
 * the same side, with the athlete back near the typical level between them for a while but not for most of
 * the activity. One sustained change is not a bout: a progressive run, a negative split, a tempo finish or a
 * long climb is one stretch, or one on each side, and gives nothing. Nor is a warm-up and a cool-down around a
 * long steady block. A stretch of more than 40% of the activity is left out too, as it is most of the activity
 * and not an effort in it. When both sides repeat, work and recovery both depart from the typical level, and
 * the side with fewer stretches at the very start or end, then the one that departs further, is the work.
 */
export function detectIntervals(trace: ActivityTrace): ActivityLap[] {
  const metric: TraceMetric = trace.streams.power !== undefined ? 'power' : 'speed'
  if (trace.streams[metric] === undefined || trace.durationS < WINDOW_S * 3) return []
  const means = windowMeans(trace, metric)
  const typical = medianOf(means)
  if (typical === null || typical <= 0) return []
  const threshold = metric === 'power' ? Math.max(40, typical * 0.25) : Math.max(0.5, typical * 0.2)
  const bouts = repeated(stretchesOf(means, typical, threshold, trace.durationS), trace.durationS)
  return bouts.flatMap((bout) =>
    withoutGaps(trace, { startS: bout.startS, endS: bout.endS, label: 'Inferred interval' }),
  )
}

/** The stretches where the windows are at least `threshold` from the typical level, on one side of it. */
function stretchesOf(
  means: Float64Array,
  typical: number,
  threshold: number,
  durationS: number,
): Stretch[] {
  const found: Stretch[] = []
  let open: Stretch | null = null
  // A window's mean first differs once about half of it lies past a step, so the step is at the
  // window's centre, not its start.
  for (let at = 0; at < means.length; at++) {
    const current = means[at]!
    if (Number.isNaN(current)) continue
    const delta = current - typical
    const changed = Math.abs(delta) >= threshold
    const centre = at + WINDOW_S / 2
    if (open !== null && changed && Math.sign(delta) === open.direction) {
      open.distance += Math.abs(delta)
      open.windows++
      continue
    }
    if (open !== null) {
      open.endS = centre
      found.push(open)
      open = null
    }
    if (changed) {
      open = {
        startS: centre,
        endS: durationS,
        direction: Math.sign(delta),
        distance: Math.abs(delta),
        windows: 1,
      }
    }
  }
  if (open !== null) found.push(open)
  return found
}

/**
 * The stretches that repeat: joined when the athlete was back near the typical level for under MIN_RECOVERY_S
 * (a wobble across the threshold), then kept when they are long enough to be an effort, not most of the
 * activity, and the recovery to another on their side is short enough to be a recovery. If both sides repeat,
 * the side with fewer stretches at the very start or end, then the one that departs further, is kept.
 */
function repeated(stretches: Stretch[], durationS: number): Stretch[] {
  const joined: Stretch[] = []
  for (const stretch of stretches) {
    const last = joined.at(-1)
    if (
      last !== undefined &&
      last.direction === stretch.direction &&
      stretch.startS - last.endS < MIN_RECOVERY_S
    ) {
      last.endS = stretch.endS
      last.distance += stretch.distance
      last.windows += stretch.windows
    } else {
      joined.push({ ...stretch })
    }
  }
  const bouts = joined.filter(
    (each) =>
      each.endS - each.startS >= MIN_INTERVAL_S &&
      each.endS - each.startS <= durationS * MAX_BOUT_SHARE,
  )
  const sides = [1, -1].map((direction) => {
    const own = bouts.filter((each) => each.direction === direction)
    const near = (a: Stretch, b: Stretch) =>
      b.startS - a.endS <=
      Math.max(MAX_RECOVERY_S, MAX_RECOVERY_BOUTS * Math.max(length(a), length(b)))
    const repeats = own.filter((each, i) => {
      const before = own[i - 1]
      const after = own[i + 1]
      return (
        (before !== undefined && near(before, each)) || (after !== undefined && near(each, after))
      )
    })
    const reach = repeats.reduce((sum, each) => sum + each.distance / each.windows, 0)
    // A stretch at the very start or end is a warm-up or a cool-down more often than a rep.
    const ends = repeats.filter(
      (each) => each.startS <= WINDOW_S || each.endS >= durationS - WINDOW_S,
    )
    return {
      repeats,
      ends: ends.length,
      reach: repeats.length === 0 ? 0 : reach / repeats.length,
    }
  })
  const [above, below] = sides as [(typeof sides)[number], (typeof sides)[number]]
  if (above.repeats.length > 0 && below.repeats.length > 0) {
    if (above.ends !== below.ends) return above.ends < below.ends ? above.repeats : below.repeats
    return above.reach >= below.reach ? above.repeats : below.repeats
  }
  return above.repeats.length > 0 ? above.repeats : below.repeats
}

const length = (stretch: Stretch): number => stretch.endS - stretch.startS

/**
 * The parts of an interval with no paused or unrecorded second, each long enough to be an interval.
 * An effort that stops and starts again is two efforts, not one that bridges the stop.
 */
function withoutGaps(trace: ActivityTrace, interval: ActivityLap): ActivityLap[] {
  const parts: ActivityLap[] = []
  let from = interval.startS
  for (let i = interval.startS; i <= interval.endS; i++) {
    const gap = i === interval.endS || !isMovingSecond(trace, i)
    if (!gap) continue
    if (i - from >= MIN_INTERVAL_S) parts.push({ ...interval, startS: from, endS: i })
    from = i + 1
  }
  return parts
}

/**
 * The mean of the usable observations in each window of WINDOW_S seconds, by the window's first second, or
 * NaN where under 80% of the window is usable. Found with running sums, so a long activity costs one pass.
 */
function windowMeans(trace: ActivityTrace, metric: TraceMetric): Float64Array {
  const values = trace.streams[metric]!
  const n = trace.durationS
  const counts = new Uint32Array(n + 1)
  const sums = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    const usable = isTraceObservation(trace, metric, i)
    counts[i + 1] = counts[i]! + (usable ? 1 : 0)
    sums[i + 1] = sums[i]! + (usable ? values[i]! : 0)
  }
  const out = new Float64Array(Math.max(0, n - WINDOW_S + 1))
  for (let at = 0; at < out.length; at++) {
    const count = counts[at + WINDOW_S]! - counts[at]!
    out[at] = count >= WINDOW_S * 0.8 ? (sums[at + WINDOW_S]! - sums[at]!) / count : NaN
  }
  return out
}

/** The median of the windows that have a mean, or null when none does. */
function medianOf(means: Float64Array): number | null {
  const kept = means.filter((value) => !Number.isNaN(value))
  return kept.length === 0 ? null : medianInPlace(kept)
}
