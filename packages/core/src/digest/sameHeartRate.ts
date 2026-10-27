import { DAY_MS, HR_BLOCK_S, PRIORS, RESTING_W_PER_KG, SAME_HEART_RATE } from '../constants'
import { possibleRunWkg } from '../curves'
import { mulberry32, quantile } from '../math'
import { metabolicToFlatSpeed } from '../metabolic'
import type { ActivityDigest, DigestHrBlock, Sport } from '../types'
import { orderedCurrent } from './combine'
import { outputAtHeartRate } from './theilSen'
import type { FitBlocks } from './theilSen'
import { NO_SAME_HEART_RATE } from './sameHeartRateTypes'
import type {
  Lack,
  SameHeartRate,
  SameHeartRateBySport,
  SameHeartRateChange,
  SameHeartRateWeek,
} from './sameHeartRateTypes'
import { weekEndMs } from './trend'

const WEEK_MS = 7 * DAY_MS
const WINDOW_MS = SAME_HEART_RATE.windowDays * DAY_MS

/** What a sport's steady blocks are read as, and which activities give blocks that can be trusted. */
interface Reading {
  /** Treadmill pace and estimated watts can be what is wrong, so they are not read. */
  usable: (digest: ActivityDigest) => boolean
  /** The block's output in the sport's unit (m/s, W), or NaN when it is not one to use. */
  output: (block: DigestHrBlock) => number
}

const READING: Record<Sport, Reading> = {
  run: {
    usable: (digest) => !digest.indoor,
    output: (block) => {
      const wkg = possibleRunWkg(HR_BLOCK_S, block.value)
      return wkg >= 2 * RESTING_W_PER_KG
        ? metabolicToFlatSpeed(wkg, PRIORS.runEconomyScale.mean)
        : Number.NaN
    },
  },
  ride: {
    usable: (digest) => digest.powerSource === 'measured',
    output: (block) => (block.terms === null && block.value > 0 ? block.value : Number.NaN),
  },
}

/** One steady block, in order of the time of its activity; `activity` counts the activities that give blocks. */
interface Block {
  startMs: number
  activity: number
  heartRate: number
  output: number
}

function blocksOf(ordered: ActivityDigest[], sport: Sport, setAside: ReadonlySet<string>): Block[] {
  const { usable, output } = READING[sport]
  const blocks: Block[] = []
  let activity = -1
  for (const digest of ordered) {
    if (digest.sport !== sport || !usable(digest) || setAside.has(digest.id)) continue
    let counted = false
    for (const block of digest.hrBlocks) {
      const value = output(block)
      if (!(value > 0 && block.heartRate > 0)) continue
      if (!counted) activity++
      counted = true
      blocks.push({ startMs: digest.startMs, activity, heartRate: block.heartRate, output: value })
    }
  }
  return blocks
}

/** The window's first lack, or null when it can report at referenceHr. */
function lackOf(window: readonly Block[], referenceHr: number): Lack | null {
  const { minBlocks, minActivities, minWeeks, minSpreadBpm } = SAME_HEART_RATE
  if (window.length < minBlocks) return 'blocks'
  if (new Set(window.map((b) => b.activity)).size < minActivities) return 'activities'
  if (new Set(window.map((b) => weekEndMs(b.startMs))).size < minWeeks) return 'weeks'
  const rates = window.map((b) => b.heartRate)
  const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length
  const variance = rates.reduce((sum, r) => sum + (r - mean) ** 2, 0) / rates.length
  if (Math.sqrt(variance) < minSpreadBpm) return 'spread'
  if (referenceHr < Math.min(...rates) || referenceHr > Math.max(...rates)) return 'range'
  return null
}

/** The window's blocks as a fit takes them: at most maxBlocks, evenly spread through time, owners numbered from 0. */
function fitBlocksOf(window: readonly Block[]): FitBlocks {
  const { maxBlocks } = SAME_HEART_RATE
  const kept =
    window.length <= maxBlocks
      ? window
      : Array.from(
          { length: maxBlocks },
          (_, i) => window[Math.floor((i * window.length) / maxBlocks)]!,
        )
  const owners = new Map<number, number>()
  for (const block of kept) if (!owners.has(block.activity)) owners.set(block.activity, owners.size)
  return {
    heartRate: Float64Array.from(kept, (b) => b.heartRate),
    output: Float64Array.from(kept, (b) => b.output),
    owner: Uint16Array.from(kept, (b) => owners.get(b.activity)!),
    activities: owners.size,
  }
}

function weekOf(endMs: number, blocks: readonly Block[], referenceHr: number): SameHeartRateWeek {
  const window = blocks.filter((b) => b.startMs > endMs - WINDOW_MS && b.startMs <= endMs)
  const activities = new Set(window.map((b) => b.activity)).size
  const base = { endMs, blocks: window.length, activities }
  const lacks = lackOf(window, referenceHr)
  if (lacks !== null) return { ...base, fit: null, lacks }
  // The seed comes from the week, so a week reads the same whichever period it is shown in.
  const random = mulberry32(SAME_HEART_RATE.seed + Math.round(endMs / WEEK_MS))
  const fit = outputAtHeartRate(fitBlocksOf(window), referenceHr, random)
  return { ...base, fit, lacks: fit === null ? 'spread' : null }
}

/** The week ends to report: from the first whose window lies in the period to the last, newest maxWeeks. */
function weekEnds(blocks: readonly Block[], fromMs: number | undefined): number[] {
  const first = blocks[0]!.startMs
  const last = blocks.at(-1)!.startMs
  const lastEnd = weekEndMs(last)
  const earliest = fromMs === undefined ? first : Math.max(first, fromMs + WINDOW_MS)
  const firstEnd = Math.max(weekEndMs(earliest), lastEnd - (SAME_HEART_RATE.maxWeeks - 1) * WEEK_MS)
  const ends: number[] = []
  for (let end = firstEnd; end <= lastEnd; end += WEEK_MS) ends.push(end)
  return ends
}

/** The median block heart rate, rounded to the reference step. */
function referenceOf(blocks: readonly Block[]): number {
  const step = SAME_HEART_RATE.referenceStepBpm
  return (
    Math.round(
      quantile(
        blocks.map((b) => b.heartRate),
        0.5,
      ) / step,
    ) * step
  )
}

function changeOf(reported: readonly SameHeartRateWeek[]): SameHeartRateChange | null {
  const first = reported[0]
  const last = reported.at(-1)
  if (first?.fit == null || last?.fit == null || first === last) return null
  return {
    fromEndMs: first.endMs,
    toEndMs: last.endMs,
    from: first.fit.output,
    to: last.fit.output,
    weeksApart: Math.round((last.endMs - first.endMs) / WEEK_MS),
    relative: last.fit.output / first.fit.output - 1,
    real: last.fit.low > first.fit.high || last.fit.high < first.fit.low,
  }
}

/** The lack of the week that came closest to reporting: the one with most blocks, the latest of equals. */
function nearestLack(weeks: readonly SameHeartRateWeek[]): Lack {
  let best: SameHeartRateWeek | null = null
  for (const week of weeks) {
    if (week.lacks !== null && (best === null || week.blocks >= best.blocks)) best = week
  }
  return best?.lacks ?? 'weeks'
}

function forSport(
  ordered: ActivityDigest[],
  sport: Sport,
  setAside: ReadonlySet<string>,
  fromMs: number | undefined,
): SameHeartRate {
  const all = blocksOf(ordered, sport, setAside)
  if (all.length === 0) return NO_SAME_HEART_RATE[sport]
  const ends = weekEnds(all, fromMs)
  // A period shorter than the window has no week whose window lies inside it.
  if (ends.length === 0) {
    return { referenceHeartRate: referenceOf(all), weeks: [], change: null, lacks: 'period' }
  }
  // The reference is read from the blocks of the weeks shown, so it means the same in each of them.
  const shown = all.filter((b) => b.startMs > ends[0]! - WINDOW_MS)
  const referenceHeartRate = referenceOf(shown)
  const weeks = ends.map((end) => weekOf(end, shown, referenceHeartRate))
  const change = changeOf(weeks.filter((week) => week.fit !== null))
  return { referenceHeartRate, weeks, change, lacks: change === null ? nearestLack(weeks) : null }
}

/**
 * Each sport's output at the same heart rate, week by week. For a week, the blocks of steady effort
 * in the 28 days to its Sunday are fitted by Theil-Sen, output on heart rate, and read at one
 * reference heart rate for the whole period: the median heart rate of its blocks. Measured rides and
 * outdoor runs only, and not the activities whose heart rate is set aside. fromMs is the period's
 * start, so that no window reaches before it. The result depends on the digests and the set-aside
 * ids alone, not on body mass. See docs/research/same-heart-rate.md.
 */
export function sameHeartRate(
  digests: ActivityDigest[],
  setAside: ReadonlySet<string>,
  opts: { fromMs?: number },
): SameHeartRateBySport {
  const ordered = orderedCurrent(digests)
  return {
    run: forSport(ordered, 'run', setAside, opts.fromMs),
    ride: forSport(ordered, 'ride', setAside, opts.fromMs),
  }
}
