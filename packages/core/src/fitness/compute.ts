import { orderedFor } from '../digest/consumers'
import { memoByDigests } from '../digestMemo'
import type { ActivityDigest, Sport } from '../types'
import { dayOfMs, replay, weekOfMs } from './machine'
import type { WeekRecord } from './machine'
import { RIDE_FITNESS_ENABLED } from './params'
import { rideSeries } from './rideUnit'
import { withoutSeason } from './season'
import { describe } from './status'
import { noFitness } from './types'
import type { FitnessBySport, FitnessStatus } from './types'
import { runSeries } from './unit'
import type { UnitSeries } from './unit'
import type { RunPoint } from './windows'

export interface FitnessOptions {
  /**
   * The date the status is as of, in the library's own time (a findings mark, for one). When not given it is the
   * newest activity's, or `nowMs` if that is later.
   */
  asOfMs?: number
  /**
   * The wall clock, which the session passes already cut to the day so the memory still hits. The newest
   * activity is not "now": a runner who stopped is told so after four weeks.
   */
  nowMs?: number
  /** Which sports are compared, over the default (RIDE_FITNESS_ENABLED for rides): for tests. */
  enabled?: Partial<Record<Sport, boolean>>
}

/** How each sport's activities are reduced to values. The same table says which sports are compared. */
const SERIES: Record<
  Sport,
  (digests: readonly ActivityDigest[], sport: Sport, setAside: ReadonlySet<string>) => UnitSeries
> = { run: runSeries, ride: rideSeries }

/** Whether a sport is compared unless the caller says otherwise. */
const ENABLED: Record<Sport, boolean> = { run: true, ride: RIDE_FITNESS_ENABLED }

/**
 * What a sport's steady runs were, for a reader that looks at the whole history rather than the status: the runs
 * as the unit read them (before any seasonal swing is taken out), in time order, and the heart rate they are read at.
 */
export interface FitnessHistory {
  runs: RunPoint[]
  referenceHr: number | null
  /** What the monitor said week by week, from the first steady run to the date: the look-back reads where the card reached "back". */
  records: WeekRecord[]
}

const NO_HISTORY: FitnessHistory = { runs: [], referenceHr: null, records: [] }

/** One sport's replay, from its first steady run to the date, and what it says at the end. */
export function fitnessOfSport(
  digests: readonly ActivityDigest[],
  sport: Sport,
  setAside: ReadonlySet<string>,
  asOfMs: number,
): FitnessStatus {
  return readSport(digests, sport, setAside, asOfMs).status
}

function readSport(
  digests: readonly ActivityDigest[],
  sport: Sport,
  setAside: ReadonlySet<string>,
  asOfMs: number,
): { status: FitnessStatus; history: FitnessHistory } {
  const series = SERIES[sport](digests, sport, setAside)
  const runs: RunPoint[] = series.points.map((p) => ({ id: p.id, t: dayOfMs(p.startMs), x: p.x }))
  const first = series.points[0]
  // The monitor is evaluated at completed week ends only: a week still going has not finished its runs, and
  // evaluating it would count a part of a week as a whole one in the streak and the display hold.
  const { records, season } =
    first === undefined
      ? { records: [], season: null }
      : replay(runs, weekOfMs(first.startMs), weekOfMs(asOfMs + 1) - 1)
  // The status reads the runs as the last week did: with the athlete's own season taken out, when one was found.
  const seen = withoutSeason(runs, season, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)
  const method = { ...series.method, seasonal: season?.amplitude ?? null }
  return {
    status: describe(sport, { ...series, method }, seen, records, asOfMs),
    history: { runs, referenceHr: series.referenceHr, records },
  }
}

interface Input {
  setAside: ReadonlySet<string>
  options: FitnessOptions
}

interface Computed {
  statuses: FitnessBySport
  histories: Record<Sport, FitnessHistory>
}

function compute(digests: ActivityDigest[], input: Input): Computed {
  const current = orderedFor('fitness', digests)
  const newest = current.at(-1)?.startMs ?? 0
  const asOfMs = input.options.asOfMs ?? Math.max(newest, input.options.nowMs ?? 0)
  const upTo = current.filter((d) => d.startMs <= asOfMs)
  const read = (sport: Sport): { status: FitnessStatus; history: FitnessHistory } => {
    if (upTo.length === 0) return { status: noFitness(sport), history: NO_HISTORY }
    return (input.options.enabled?.[sport] ?? ENABLED[sport])
      ? readSport(upTo, sport, input.setAside, asOfMs)
      : {
          status: { ...noFitness(sport), shortfall: { kind: 'unavailable' }, asOfMs },
          history: NO_HISTORY,
        }
  }
  const run = read('run')
  const ride = read('ride')
  return {
    statuses: { run: run.status, ride: ride.status },
    histories: { run: run.history, ride: ride.history },
  }
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a === b || (a.size === b.size && [...a].every((id) => b.has(id)))

const remembered = memoByDigests<Input, Computed>(
  compute,
  (a, b) =>
    sameSet(a.setAside, b.setAside) &&
    a.options.asOfMs === b.options.asOfMs &&
    a.options.nowMs === b.options.nowMs &&
    a.options.enabled?.run === b.options.enabled?.run &&
    a.options.enabled?.ride === b.options.enabled?.ride,
)

/**
 * Each sport's fitness at the same effort over the whole library, as of the newest activity (or
 * `options.asOfMs`). A function of the digests, the set-aside list and the date alone, remembered for
 * the same digests so that a change of period, or of a setting the analysis does not read, does not redo it.
 */
export function fitnessStatuses(
  digests: ActivityDigest[],
  setAside: ReadonlySet<string>,
  options: FitnessOptions = {},
): FitnessBySport {
  return remembered(digests, { setAside, options }).statuses
}

/**
 * Each sport's steady runs over the whole library, from the computation `fitnessStatuses` remembers, so a reader of
 * the whole history (the look-back) does not read the kilometres of every run again. Empty for a sport that is not
 * compared.
 */
export function fitnessHistories(
  digests: ActivityDigest[],
  setAside: ReadonlySet<string>,
  options: FitnessOptions = {},
): Record<Sport, FitnessHistory> {
  return remembered(digests, { setAside, options }).histories
}
