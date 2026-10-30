import { orderedCurrent } from '../digest/ordered'
import { memoByDigests } from '../digestMemo'
import type { ActivityDigest, Sport } from '../types'
import { dayOfMs, replay, weekOfMs } from './machine'
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

/** One sport's replay, from its first steady run to the date, and what it says at the end. */
export function fitnessOfSport(
  digests: readonly ActivityDigest[],
  sport: Sport,
  setAside: ReadonlySet<string>,
  asOfMs: number,
): FitnessStatus {
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
  return describe(sport, { ...series, method }, seen, records, asOfMs)
}

interface Input {
  setAside: ReadonlySet<string>
  options: FitnessOptions
}

function compute(digests: ActivityDigest[], input: Input): FitnessBySport {
  const current = orderedCurrent(digests)
  const newest = current.at(-1)?.startMs ?? 0
  const asOfMs = input.options.asOfMs ?? Math.max(newest, input.options.nowMs ?? 0)
  const upTo = current.filter((d) => d.startMs <= asOfMs)
  const status = (sport: Sport): FitnessStatus => {
    if (upTo.length === 0) return noFitness(sport)
    return (input.options.enabled?.[sport] ?? ENABLED[sport])
      ? fitnessOfSport(upTo, sport, input.setAside, asOfMs)
      : { ...noFitness(sport), shortfall: { kind: 'unavailable' }, asOfMs }
  }
  return { run: status('run'), ride: status('ride') }
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a === b || (a.size === b.size && [...a].every((id) => b.has(id)))

const remembered = memoByDigests<Input, FitnessBySport>(
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
  return remembered(digests, { setAside, options })
}
