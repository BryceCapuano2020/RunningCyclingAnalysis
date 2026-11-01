import { DAY_MS, HR_BLOCK_S, PRIORS, RESTING_W_PER_KG, SAME_HEART_RATE } from '../constants'
import { possibleRunWkg } from '../curves'
import { mulberry32, quantile } from '../math'
import { metabolicToFlatSpeed } from '../metabolic'
import type { ActivityDigest, DigestHrBlock, Sport } from '../types'
import { orderedFor } from './consumers'
import { outputAtHeartRate } from './theilSen'
import type { FitBlocks } from './theilSen'
import { NO_SAME_HEART_RATE } from './sameHeartRateTypes'
import type {
  Lack,
  SameHeartRate,
  SameHeartRateBySport,
  SameHeartRateWeek,
} from './sameHeartRateTypes'
import { effortsCount } from './effortTrust'
import { firstStartingAfter } from './startOrder'
import { localAxisMs, weekEndFor, weekEndMs, weekEndsSpan } from '../calendar'
import type { Dated } from '../calendar'

const WEEK_MS = 7 * DAY_MS
const WINDOW_MS = SAME_HEART_RATE.windowDays * DAY_MS
const WIDE_WINDOW_MS = SAME_HEART_RATE.wideWindowDays * DAY_MS

/** What a sport's steady blocks are read as, and which activities give blocks that can be trusted. */
interface Reading {
  /** Treadmill pace and estimated watts can be what is wrong, so they are not read. */
  usable: (digest: ActivityDigest) => boolean
  /** The block's output in the sport's unit (m/s, W), or NaN when it is not one to use. */
  output: (block: DigestHrBlock) => number
}

const READING: Record<Sport, Reading> = {
  run: {
    usable: effortsCount,
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
interface Block extends Dated {
  /** The start on the axis the weeks are cut on (calendar.ts). */
  weekMs: number
  /** The end of the week of the activity's local day (calendar.ts). */
  weekEnd: number
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
      blocks.push({
        startMs: digest.startMs,
        ...(digest.localDayShift === undefined ? {} : { localDayShift: digest.localDayShift }),
        weekMs: localAxisMs(digest),
        weekEnd: weekEndFor(digest),
        activity,
        heartRate: block.heartRate,
        output: value,
      })
    }
  }
  // Digests are in order of start; the week axis moves a start by up to a day either way, so cut weeks need not be.
  blocks.sort((a, b) => a.weekMs - b.weekMs)
  return blocks
}

/** The window's first lack, or null when it can report at referenceHr. Judged on the blocks a fit takes. */
function lackOf(window: readonly Block[], referenceHr: number): Lack | null {
  const { minBlocks, minActivities, minWeeks, minSpreadBpm } = SAME_HEART_RATE
  if (window.length < minBlocks) return 'blocks'
  if (new Set(window.map((b) => b.activity)).size < minActivities) return 'activities'
  if (new Set(window.map((b) => b.weekEnd)).size < minWeeks) return 'weeks'
  const rates = window.map((b) => b.heartRate)
  const mean = rates.reduce((sum, r) => sum + r, 0) / rates.length
  const variance = rates.reduce((sum, r) => sum + (r - mean) ** 2, 0) / rates.length
  if (Math.sqrt(variance) < minSpreadBpm) return 'spread'
  if (referenceHr < Math.min(...rates) || referenceHr > Math.max(...rates)) return 'range'
  return null
}

/** `count` of the items, evenly spread from the first to the last. All of them when there are no more. */
function evenly<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items]
  return Array.from({ length: count }, (_, i) => items[Math.floor((i * items.length) / count)]!)
}

/**
 * The blocks a fit takes from a window. Within the caps, all of them. Over them, the activities are
 * thinned first, at most maxActivities spread through the window, and then each keeps an equal share of
 * maxBlocks, spread through its own blocks. So the fit still spans the whole window, and no activity is
 * kept with fewer than two blocks or dropped to make room for another's.
 */
function fittedBlocks(window: readonly Block[]): Block[] {
  const { maxBlocks, maxActivities } = SAME_HEART_RATE
  if (window.length <= maxBlocks) return [...window]
  const byActivity = new Map<number, Block[]>()
  for (const block of window) {
    const group = byActivity.get(block.activity)
    if (group === undefined) byActivity.set(block.activity, [block])
    else group.push(block)
  }
  const kept = evenly([...byActivity.values()], maxActivities)
  const share = Math.floor(maxBlocks / kept.length)
  return kept.flatMap((group) => evenly(group, share))
}

/** Blocks as a fit takes them, owners numbered from 0 in order of activity. */
function fitBlocksOf(kept: readonly Block[]): FitBlocks {
  const owners = new Map<number, number>()
  for (const block of kept) if (!owners.has(block.activity)) owners.set(block.activity, owners.size)
  return {
    heartRate: Float64Array.from(kept, (b) => b.heartRate),
    output: Float64Array.from(kept, (b) => b.output),
    owner: Uint16Array.from(kept, (b) => owners.get(b.activity)!),
    activities: owners.size,
  }
}

/** The blocks whose week ends after the window's start and not after `endMs`. */
function windowOf(endMs: number, blocks: readonly Block[], windowMs: number): Block[] {
  const at = (block: Block) => block.weekMs
  return blocks.slice(
    firstStartingAfter(blocks, endMs - windowMs, at),
    firstStartingAfter(blocks, endMs, at),
  )
}

function weekOf(endMs: number, blocks: readonly Block[], referenceHr: number): SameHeartRateWeek {
  const narrow = windowOf(endMs, blocks, WINDOW_MS)
  // A window short of activities reaches back further, so a quiet month still reads. It stays the narrow one
  // when reaching back finds nothing more.
  const short = new Set(narrow.map((b) => b.activity)).size < SAME_HEART_RATE.minActivities
  const reaching = short ? windowOf(endMs, blocks, WIDE_WINDOW_MS) : narrow
  const wide = reaching.length > narrow.length
  const window = wide ? reaching : narrow
  const activities = new Set(window.map((b) => b.activity)).size
  const base = {
    endMs,
    blocks: window.length,
    activities,
    ...(wide ? { wide: true as const } : {}),
  }
  const kept = fittedBlocks(window)
  const lacks = lackOf(kept, referenceHr)
  if (lacks !== null) return { ...base, fit: null, lacks }
  // Only the draws are the week's own: its seed comes from the week. The reference heart rate is the
  // period's, so the same week can read a little differently in another period.
  const random = mulberry32(SAME_HEART_RATE.seed + Math.round(endMs / WEEK_MS))
  const fit = outputAtHeartRate(fitBlocksOf(kept), referenceHr, random)
  return { ...base, fit, lacks: fit === null ? 'spread' : null }
}

/**
 * The week ends to report: from the first whose 28-day window lies in the period to the last. A period
 * reports its newest maxWeeks at most; all time, which has no start, reports every week from the sport's
 * first block, so no week is read from a window shorter than the others.
 */
function weekEnds(
  blocks: readonly Block[],
  fromMs: number | undefined,
  newestWeeks: number | null,
): number[] {
  const span = weekEndsSpan(blocks)!
  const fromEnd =
    fromMs === undefined
      ? weekEndMs(blocks[0]!.weekMs + WINDOW_MS)
      : weekEndFor({ startMs: fromMs + WINDOW_MS })
  const newest = newestWeeks === null ? -Infinity : span.last - (newestWeeks - 1) * WEEK_MS
  const firstEnd = Math.max(span.first, fromEnd, newest)
  const lastEnd = span.last
  const ends: number[] = []
  for (let end = firstEnd; end <= lastEnd; end += WEEK_MS) ends.push(end)
  return ends
}

/**
 * The reference heart rate: the median heart rate of the library's blocks in its newest referenceWeeks
 * weeks, rounded to the reference step. It is the library's, not the period's, so choosing another
 * period does not move it. Null without a block.
 */
function referenceOf(library: readonly Block[]): number | null {
  const last = library.at(-1)
  if (last === undefined) return null
  const from = last.weekEnd - SAME_HEART_RATE.referenceWeeks * WEEK_MS
  const rates = library.filter((b) => b.weekMs > from).map((b) => b.heartRate)
  const step = SAME_HEART_RATE.referenceStepBpm
  return Math.round(quantile(rates, 0.5) / step) * step
}

/** The lack of the week that came closest to reporting: the one with most blocks, the latest of equals. */
function nearestLack(weeks: readonly SameHeartRateWeek[]): Lack {
  let best: SameHeartRateWeek | null = null
  for (const week of weeks) {
    if (week.lacks !== null && (best === null || week.blocks >= best.blocks)) best = week
  }
  return best?.lacks ?? 'weeks'
}

/** The weeks of some blocks and what they came to: how many report, and what is missing when fewer than two do. */
type Weeks = Pick<SameHeartRate, 'weeks' | 'reportedWeeks' | 'lacks'>

function weeksOf(
  blocks: readonly Block[],
  referenceHeartRate: number,
  fromMs: number | undefined,
  newestWeeks: number | null,
): Weeks {
  if (blocks.length === 0) return { weeks: [], reportedWeeks: 0, lacks: 'blocks' }
  const ends = weekEnds(blocks, fromMs, newestWeeks)
  // Stretches that do not reach a window's length into the period leave no week whose window lies in it.
  if (ends.length === 0) return { weeks: [], reportedWeeks: 0, lacks: 'period' }
  const weeks = ends.map((end) => weekOf(end, blocks, referenceHeartRate))
  const reportedWeeks = weeks.filter((week) => week.fit !== null).length
  return { weeks, reportedWeeks, lacks: reportedWeeks < 2 ? nearestLack(weeks) : null }
}

function forSport(
  ordered: ActivityDigest[],
  library: ActivityDigest[],
  sport: Sport,
  setAside: ReadonlySet<string>,
  fromMs: number | undefined,
  newestWeeks?: number,
): SameHeartRate {
  const libraryBlocks = blocksOf(library, sport, setAside)
  const referenceHeartRate = referenceOf(libraryBlocks)
  if (referenceHeartRate === null) return NO_SAME_HEART_RATE[sport]
  const all = library === ordered ? libraryBlocks : blocksOf(ordered, sport, setAside)
  const libraryLast = weekEndsSpan(library)!.last
  // The period's last week is that of its newest activity, of either sport.
  const latestWeekEndMs = weekEndsSpan(ordered)?.last ?? libraryLast
  // A period reports its newest year of weeks at most, and all time every week unless the caller caps it.
  const cap = fromMs === undefined ? (newestWeeks ?? null) : SAME_HEART_RATE.maxWeeks
  const own = weeksOf(all, referenceHeartRate, fromMs, cap)
  // A period with no week to draw is not left empty while the library has weeks: its newest ones are read, as
  // the reference heart rate is, and the result says so. All time already is the library.
  if (own.reportedWeeks < 2 && fromMs !== undefined) {
    const newest = weeksOf(libraryBlocks, referenceHeartRate, undefined, SAME_HEART_RATE.maxWeeks)
    if (newest.reportedWeeks > own.reportedWeeks) {
      return { referenceHeartRate, ...newest, latestWeekEndMs: libraryLast, scope: 'library' }
    }
  }
  // A period with none of the sport's steady stretches that the library cannot help has nothing to report.
  return all.length === 0
    ? NO_SAME_HEART_RATE[sport]
    : { referenceHeartRate, ...own, latestWeekEndMs }
}

/**
 * Each sport's output at the same heart rate, week by week. For a week, the blocks of steady effort
 * in the 28 days to its Sunday (56 when those hold under six activities) are fitted by Theil-Sen, output on
 * heart rate, and read at one reference heart rate for every period: the median heart rate of the library's
 * newest year of blocks. A period with no week to draw takes the library's newest weeks instead.
 * Measured rides and outdoor runs only, and not the activities whose heart rate is set aside. fromMs is
 * the period's start, so that no window reaches before it; `library` is every digest, whatever the
 * period, and is the digests when not given. All time reports every week; `newestWeeks` caps it to the newest
 * ones, which a reader that does not draw the weeks (the findings) asks for. The result depends on these and the set-aside ids alone,
 * not on body mass. See docs/research/same-heart-rate.md.
 */
export function sameHeartRate(
  digests: ActivityDigest[],
  setAside: ReadonlySet<string>,
  opts: { fromMs?: number; library?: ActivityDigest[]; newestWeeks?: number },
): SameHeartRateBySport {
  const ordered = orderedFor('sameHeartRate', digests)
  const library = opts.library === undefined ? ordered : orderedFor('sameHeartRate', opts.library)
  return {
    run: forSport(ordered, library, 'run', setAside, opts.fromMs, opts.newestWeeks),
    ride: forSport(ordered, library, 'ride', setAside, opts.fromMs, opts.newestWeeks),
  }
}
