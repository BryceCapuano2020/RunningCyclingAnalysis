import { isMovingSecond } from './moving'
import { isTraceObservation } from './selection'
import type { Sport } from '../types'
import type { ActivityLap, ActivityTrace, TraceMetric } from './types'

/** Seconds a reading is smoothed over before it is compared with the level of an effort. */
const WINDOW_S = 12
/** The shortest effort that is suggested. */
const MIN_BOUT_S = 20
/** A dip shorter than this does not end an effort: it is a wobble, not a recovery. */
const MIN_RECOVERY_S = 30
/** An effort is not most of the activity, or longer than this: that is how the activity was run. */
const MAX_BOUT_SHARE = 0.4
const MAX_BOUT_S = 1500
/** An effort must reach this far above the threshold, as a share of the gap between the two levels. */
const PEAK_SHARE = 0.2

/**
 * Efforts are a set only when the recovery between neighbours is no longer than this, or three times the
 * longer effort. A block between a warm-up and a cool-down, or a walk break in a long run, is not a recovery
 * between repeats.
 */
const MAX_RECOVERY_S = 600
const MAX_RECOVERY_BOUTS = 3

/**
 * The repeats of one session are about as long as each other: at least this share of a set is within this
 * range of its middle length, and only those are kept. A set of two such efforts is a set. Efforts of any
 * length are accepted only when the levels are far apart (BIG_GAP_SHARE) and there are three or more, as in a
 * test of 3, 6, 12 and 20 minute efforts.
 */
const SAME_LENGTH_LOW = 0.8
const SAME_LENGTH_HIGH = 1.25
const SAME_LENGTH_SHARE = 0.6
const MIN_SET = 2
const MIN_SET_ANY_LENGTH = 3
const BIG_GAP_SHARE = 1

/**
 * How far apart the two levels must be: a share of the lower level, with a floor in the stream's unit. A
 * smaller gap (down to MIN_GAP_SHARE_REGULAR) counts only for a regular set, three efforts or more with about
 * the same recovery between them. Ordinary variation in a steady run is a smaller share than any of these.
 */
const MIN_GAP_SHARE = 0.3
const MIN_GAP_SHARE_REGULAR = 0.15
const REGULAR_RECOVERY_SPREAD = 0.3
const MIN_GAP: Partial<Record<TraceMetric, number>> = { speed: 0.5, power: 40 }

/** A speed under this is a stop or a walk to the line, not a pace; it is no reading, as the activity page reads it. */
const MIN_SPEED = 0.5

/**
 * The streams the suggestion may read for each sport, best first. A ride's speed says terrain and wind more
 * than effort, so a ride without power has no suggestions. A sport is added by adding a row.
 */
const INTERVAL_STREAMS: Record<Sport, readonly TraceMetric[]> = {
  run: ['power', 'speed'],
  ride: ['power'],
}

/** An effort: a stretch of the activity, in seconds, held above the threshold between the two levels. */
interface Bout {
  startS: number
  endS: number
}

const length = (bout: Bout): number => bout.endS - bout.startS

/**
 * Finds repeated efforts; returned segments are suggestions for editing.
 *
 * The readings are smoothed over a few seconds and split into two levels, the higher one being the work and
 * the lower one the recovery between it. The split is the threshold that best separates the two groups of
 * readings (Otsu's), so a session that is mostly work is split as well as one that is mostly recovery. A
 * stretch above the threshold is an effort when it is long enough, is not most of the activity, and does not
 * touch the first or last reading, where a warm-up and a cool-down sit.
 *
 * Efforts count only as a set: at least two, about the same length, with a recovery of a few minutes at most
 * between neighbours. One sustained change is not a set. A progressive run, a negative split, a tempo finish,
 * a block between a warm-up and a cool-down, and the walk breaks of a long run give nothing.
 */
export function detectIntervals(trace: ActivityTrace): ActivityLap[] {
  const metric = INTERVAL_STREAMS[trace.sport].find((each) => trace.streams[each] !== undefined)
  if (metric === undefined || trace.durationS < WINDOW_S * 3) return []
  const level = windowMeans(trace, metric)
  return repeatedBouts(level, metric, trace.durationS).flatMap((bout) =>
    withoutGaps(trace, { startS: bout.startS, endS: bout.endS, label: 'Inferred interval' }),
  )
}

/** The efforts that repeat, under the better of two splits of the readings into work and recovery. */
function repeatedBouts(level: Float64Array, metric: TraceMetric, durationS: number): Bout[] {
  const sorted = level.filter((value) => !Number.isNaN(value)).sort()
  const first = splitOf(sorted, 0)
  if (first === null) return []
  const best = setsAbove(level, sorted, first, metric, durationS)
  // Work can sit on a third level, above a warm-up that is itself above the recovery. The readings above the
  // first split are split again, and that split is used when it finds more efforts.
  const upper = splitOf(
    sorted,
    sorted.findIndex((value) => value > first),
  )
  if (upper === null) return best
  const again = setsAbove(level, sorted, upper, metric, durationS)
  return again.length > best.length ? again : best
}

/**
 * The threshold between a low and a high group of the readings in `sorted` from index `from` up: the one that
 * leaves the most variance between the groups. The ends are clipped at the 1st and 99th percentile, so a
 * handful of glitches does not decide it. Null when there are too few readings to split.
 */
function splitOf(sorted: Float64Array, from: number): number | null {
  if (from < 0 || sorted.length - from < WINDOW_S * 2) return null
  const values = sorted.subarray(from)
  const low = values[Math.floor(values.length * 0.01)]!
  const high = values[Math.ceil(values.length * 0.99) - 1]!
  const prefix = new Float64Array(values.length + 1)
  for (let i = 0; i < values.length; i++) {
    prefix[i + 1] = prefix[i]! + Math.min(high, Math.max(low, values[i]!))
  }
  const total = prefix[values.length]!
  let best = -1
  let at = -1
  for (let k = 1; k < values.length; k++) {
    if (values[k]! === values[k - 1]!) continue
    const meanLow = prefix[k]! / k
    const meanHigh = (total - prefix[k]!) / (values.length - k)
    const between = (k / values.length) * (1 - k / values.length) * (meanHigh - meanLow) ** 2
    if (between > best) {
      best = between
      at = k
    }
  }
  return at < 0 ? null : (values[at - 1]! + values[at]!) / 2
}

/** The sets of efforts above `threshold`, or none when the two levels are not far enough apart. */
function setsAbove(
  level: Float64Array,
  sorted: Float64Array,
  threshold: number,
  metric: TraceMetric,
  durationS: number,
): Bout[] {
  const cut = sorted.findIndex((value) => value > threshold)
  if (cut <= 0) return []
  let sumLow = 0
  for (let i = 0; i < cut; i++) sumLow += sorted[i]!
  let sumHigh = 0
  for (let i = cut; i < sorted.length; i++) sumHigh += sorted[i]!
  const meanLow = sumLow / cut
  const gap = sumHigh / (sorted.length - cut) - meanLow
  const floor = MIN_GAP[metric] ?? 0
  if (gap < Math.max(floor, MIN_GAP_SHARE_REGULAR * meanLow)) return []
  const efforts = effortsAbove(level, threshold, threshold + PEAK_SHARE * gap, durationS)
  const sets = setsOf(efforts, gap >= BIG_GAP_SHARE * meanLow)
  const clear = gap >= Math.max(floor, MIN_GAP_SHARE * meanLow)
  return clear || isRegular(sets) ? sets : []
}

/**
 * The stretches where the smoothed reading stays above `threshold` and reaches `peak`, joined across a dip
 * (or a stretch of readings left out) shorter than MIN_RECOVERY_S, and left out when they touch the first or last reading, are too short, or are
 * too long. A window's mean first passes the threshold once about half of it lies past a step, so the step is
 * at the window's centre, not its start.
 */
function effortsAbove(
  level: Float64Array,
  threshold: number,
  peak: number,
  durationS: number,
): Bout[] {
  let firstValid = 0
  while (firstValid < level.length && Number.isNaN(level[firstValid]!)) firstValid++
  let lastValid = level.length - 1
  while (lastValid > firstValid && Number.isNaN(level[lastValid]!)) lastValid--
  const centre = Math.round(WINDOW_S / 2)
  const stretches: { from: number; to: number; top: number }[] = []
  for (let at = 0; at < level.length; at++) {
    const value = level[at]!
    if (!(value > threshold)) continue
    const last = stretches.at(-1)
    if (last !== undefined && at - last.to - 1 < MIN_RECOVERY_S) {
      last.to = at
      last.top = Math.max(last.top, value)
    } else {
      stretches.push({ from: at, to: at, top: value })
    }
  }
  const longest = Math.min(MAX_BOUT_S, durationS * MAX_BOUT_SHARE)
  return stretches
    .filter((each) => each.top >= peak && each.from > firstValid && each.to < lastValid)
    .map((each) => ({
      startS: each.from + centre,
      endS: Math.min(durationS, each.to + 1 + centre),
    }))
    .filter((each) => length(each) >= MIN_BOUT_S && length(each) <= longest)
}

/**
 * The efforts that make a set: runs of efforts with a recovery of a few minutes at most between neighbours,
 * at least two of them and most about the same length, and only those of about that length. A run that has
 * only the few stretches of whatever length the terrain or the traffic left is not a set. With `anyLength`,
 * efforts of any length make a set of three or more.
 */
function setsOf(efforts: Bout[], anyLength: boolean): Bout[] {
  const near = (a: Bout, b: Bout) =>
    b.startS - a.endS <=
    Math.max(MAX_RECOVERY_S, MAX_RECOVERY_BOUTS * Math.max(length(a), length(b)))
  const runs: Bout[][] = []
  for (const effort of efforts) {
    const last = runs.at(-1)
    if (last !== undefined && near(last.at(-1)!, effort)) last.push(effort)
    else runs.push([effort])
  }
  return runs.flatMap((run) => {
    if (anyLength) return run.length >= MIN_SET_ANY_LENGTH ? run : []
    const middle = run.map(length).sort((x, y) => x - y)[Math.floor(run.length / 2)]!
    const alike = run.filter(
      (each) =>
        length(each) >= middle * SAME_LENGTH_LOW && length(each) <= middle * SAME_LENGTH_HIGH,
    )
    return alike.length >= MIN_SET && alike.length >= run.length * SAME_LENGTH_SHARE ? alike : []
  })
}

/** Whether there are three efforts or more with about the same recovery between neighbours. */
function isRegular(efforts: Bout[]): boolean {
  if (efforts.length < 3) return false
  const gaps = efforts.slice(1).map((each, i) => each.startS - efforts[i]!.endS)
  const middle = gaps.slice().sort((x, y) => x - y)[Math.floor(gaps.length / 2)]!
  const spread = gaps.map((each) => Math.abs(each - middle)).sort((x, y) => x - y)[
    Math.floor(gaps.length / 2)
  ]!
  return spread <= REGULAR_RECOVERY_SPREAD * middle
}

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
    if (i - from >= MIN_BOUT_S) parts.push({ ...interval, startS: from, endS: i })
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
    const usable =
      isTraceObservation(trace, metric, i) && !(metric === 'speed' && values[i]! < MIN_SPEED)
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
