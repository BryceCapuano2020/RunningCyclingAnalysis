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
 * The repeats of one session are about as long as each other: efforts no longer than this many times the shortest of
 * their group make a group, a group of two or more is kept, and the groups must cover this share of a run of efforts.
 * A session can have several groups (6 x 800 m then 6 x 400 m), and all of them are returned. Efforts of any
 * length make a set in two other cases: the recovery between them is about the same every time (a pyramid or
 * a ladder, four efforts or more), or the levels are far apart (BIG_GAP_SHARE) and there are three or more, as
 * in a test of 3, 6, 12 and 20 minute efforts.
 */
const SAME_LENGTH_LOW = 0.8
const SAME_LENGTH_HIGH = 1.25
const SAME_LENGTH_SPREAD = 1.4
const SAME_LENGTH_SHARE = 0.6
const MIN_SET = 2
const MIN_BLOCK = 3
const REJECTED_SHARE = 0.2
const MIN_SET_ANY_LENGTH = 3
const MIN_SET_REGULAR = 5
const REGULAR_ANY_SPREAD = 0.1
const BIG_GAP_SHARE = 1

/**
 * How far apart the two levels must be: a share of the lower level, with a floor in the stream's unit. A
 * smaller gap (down to MIN_GAP_SHARE_REGULAR) counts only for a regular set, three efforts or more with about
 * the same recovery between them. Ordinary variation in a steady run is a smaller share than any of these.
 */
const MIN_GAP_SHARE = 0.3
const MIN_GAP_SHARE_REGULAR = 0.17
const REGULAR_RECOVERY_SPREAD = 0.3
const MIN_GAP: Partial<Record<TraceMetric, number>> = { speed: 0.5, power: 40 }

/** Walking pace, m/s, and the pace of a slow jog and the length of a running stretch that rules out a session of intervals. */
const WALK_SPEED = 1.8
const SLOW_RUN_SPEED = 2.2
const LONG_RUN_S = 240

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
 * Efforts count only as a set: at least two, with a recovery of a few minutes at most between neighbours, and
 * either about the same length (the blocks of a session each count: 6 x 800 m then 6 x 400 m), or with the
 * same recovery every time (a pyramid, a ladder), or three or more of any length when the levels are far
 * apart. One sustained change is not a set. A progressive run, a negative split, a tempo finish, a block
 * between a warm-up and a cool-down, and the walking breaks of a trail run or a run/walk plan give nothing.
 *
 * Known limits: a speed-only reading cannot tell hills or a rolling road from repeats, nor a foot hill repeat
 * (slow up, quick jog down) from its recoveries, as the work is always the faster level; an effort that touches
 * the start or the end of the recording is dropped. See DESIGN.md.
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
  // first split are split again, and that split is used when it finds more efforts. It is not used when the
  // first split found efforts of too many lengths to be a set: the faster ones would be the half of a pyramid.
  const upper = splitOf(
    sorted,
    sorted.findIndex((value) => value > first),
  )
  if (upper === null) return best.sets
  const again = setsAbove(level, sorted, upper, metric, durationS)
  // A first split that found runs of efforts of every length, and no set, is a pyramid or a ladder, and the
  // upper split finds some of its longest efforts: only a split that finds most of the efforts is used then.
  const enough = again.sets.length >= best.varied * REJECTED_SHARE
  return again.sets.length > best.sets.length && enough ? again.sets : best.sets
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

/** The sets of efforts above `threshold` (none when the two levels are not far enough apart), and whether
 * there were runs of efforts that were left out only because their lengths and recoveries were all different. */
interface Found {
  sets: Bout[]
  /** The efforts in runs that were left out because no two were alike and their recoveries differed. */
  varied: number
}

function setsAbove(
  level: Float64Array,
  sorted: Float64Array,
  threshold: number,
  metric: TraceMetric,
  durationS: number,
): Found {
  const none: Found = { sets: [], varied: 0 }
  const cut = sorted.findIndex((value) => value > threshold)
  if (cut <= 0) return none
  let sumLow = 0
  for (let i = 0; i < cut; i++) sumLow += sorted[i]!
  let sumHigh = 0
  for (let i = cut; i < sorted.length; i++) sumHigh += sorted[i]!
  const meanLow = sumLow / cut
  const gap = sumHigh / (sorted.length - cut) - meanLow
  const floor = MIN_GAP[metric] ?? 0
  if (gap < Math.max(floor, MIN_GAP_SHARE_REGULAR * meanLow)) return none
  const efforts = effortsAbove(level, threshold, threshold + PEAK_SHARE * gap, durationS)
  const found = setsOf(efforts, gap >= BIG_GAP_SHARE * meanLow)
  if (isRunWalk(metric, sorted, cut, meanLow + gap, found.sets)) return none
  const clear = gap >= Math.max(floor, MIN_GAP_SHARE * meanLow)
  return clear || isRegular(found.sets) ? found : { sets: [], varied: found.varied }
}

/**
 * Whether the efforts are running between walking breaks, which is how a trail run or a run/walk plan is
 * done and not a session of intervals: the recoveries are at walking pace (the readings below the threshold
 * are mostly under WALK_SPEED) and the efforts are long running stretches of 4 minutes or more, or are
 * themselves a slow jog. A jog between 10-minute cruise efforts is faster than a walk, and a walk between
 * short fast repeats has short efforts, so neither is caught.
 */
function isRunWalk(
  metric: TraceMetric,
  sorted: Float64Array,
  cut: number,
  highMean: number,
  sets: Bout[],
): boolean {
  if (metric !== 'speed' || sets.length === 0 || sorted[Math.floor(cut / 2)]! >= WALK_SPEED)
    return false
  return highMean < SLOW_RUN_SPEED || sets.every((each) => length(each) >= LONG_RUN_S)
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
 * The efforts that make a set. Runs of efforts have a recovery of a few minutes at most between neighbours. A
 * run is a set when two or more of its efforts are about as long as each other (every such group is kept, and
 * together they are most of the run), or when its recoveries are all about the same (four efforts or more), or,
 * with `far` apart levels, when it has three efforts or more of any length. A run that has only the few stretches
 * of whatever length the terrain or the traffic left is not a set, and is reported as varied.
 */
function setsOf(efforts: Bout[], far: boolean): Found {
  const near = (a: Bout, b: Bout) =>
    b.startS - a.endS <=
    Math.max(MAX_RECOVERY_S, MAX_RECOVERY_BOUTS * Math.max(length(a), length(b)))
  const runs: Bout[][] = []
  for (const effort of efforts) {
    const last = runs.at(-1)
    if (last !== undefined && near(last.at(-1)!, effort)) last.push(effort)
    else runs.push([effort])
  }
  let varied = 0
  const sets = runs.flatMap((run) => {
    if (run.length < MIN_SET) return []
    const alike = alikeEfforts(run)
    if (alike.length > 0) return alike
    if (far && run.length >= MIN_SET_ANY_LENGTH) return run
    if (run.length >= MIN_SET_REGULAR && isRegular(run, REGULAR_ANY_SPREAD)) return run
    varied += run.length
    return []
  })
  return { sets, varied }
}

/**
 * The efforts of a run that are about as long as others, or none when they are not most of it. Efforts within
 * a quarter of the middle length of the run, if they are two or more and most of it, are the set (2 x 20 min,
 * 8 x 4 min). Failing that, the blocks of one session are the stretches of three or more efforts in a row of
 * about one length (6 x 800 m and then 6 x 400 m), if together they are most of the run. A pair of a kind among
 * others, or lengths that match only out of order, are a coincidence of the terrain.
 */
function alikeEfforts(run: Bout[]): Bout[] {
  const middle = run.map(length).sort((x, y) => x - y)[Math.floor(run.length / 2)]!
  const main = run.filter(
    (each) => length(each) >= middle * SAME_LENGTH_LOW && length(each) <= middle * SAME_LENGTH_HIGH,
  )
  const most = run.length * SAME_LENGTH_SHARE
  const blocks = blocksOf(run)
  if (main.length >= MIN_SET && main.length >= most) {
    return run.filter((each) => main.includes(each) || blocks.includes(each))
  }
  return blocks.length >= most ? blocks : []
}

/** The efforts in stretches of three or more in a row, each about as long as the one before and all about one length. */
function blocksOf(run: Bout[]): Bout[] {
  const kept: Bout[] = []
  let from = 0
  for (let i = 1; i <= run.length; i++) {
    const block = run.slice(from, i)
    const shortest = Math.min(...block.map(length))
    const longest = Math.max(...block.map(length))
    const ends = i === run.length
    const breaks =
      !ends &&
      (Math.max(length(run[i]!), longest) >
        Math.min(length(run[i]!), shortest) * SAME_LENGTH_SPREAD ||
        length(run[i]!) > length(run[i - 1]!) * SAME_LENGTH_HIGH ||
        length(run[i]!) < length(run[i - 1]!) * SAME_LENGTH_LOW)
    if (ends || breaks) {
      if (block.length >= MIN_BLOCK) kept.push(...block)
      from = i
    }
  }
  return kept
}

/** Whether there are three efforts or more with about the same recovery between neighbours. */
function isRegular(efforts: Bout[], spread = REGULAR_RECOVERY_SPREAD): boolean {
  if (efforts.length < 3) return false
  const gaps = efforts.slice(1).map((each, i) => each.startS - efforts[i]!.endS)
  const middle = gaps.slice().sort((x, y) => x - y)[Math.floor(gaps.length / 2)]!
  const off = gaps.map((each) => Math.abs(each - middle)).sort((x, y) => x - y)[
    Math.floor(gaps.length / 2)
  ]!
  return off <= spread * middle
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
