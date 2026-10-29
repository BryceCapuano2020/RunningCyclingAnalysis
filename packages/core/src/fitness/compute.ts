import { orderedCurrent } from '../digest/ordered'
import { memoByDigests } from '../digestMemo'
import type { ActivityDigest, Sport } from '../types'
import { dayOfMs, monitor, weekOfMs } from './machine'
import { RIDE_FITNESS_ENABLED } from './params'
import { rideSeries } from './rideUnit'
import { describe } from './status'
import { noFitness } from './types'
import type { FitnessBySport, FitnessStatus } from './types'
import { runSeries } from './unit'
import type { UnitSeries } from './unit'
import type { RunPoint } from './windows'

export interface FitnessOptions {
  /** The date the status is as of, in the library's own time; the newest activity's when not given. */
  asOfMs?: number
  /** Which sports are compared, over the default (RIDE_FITNESS_ENABLED for rides): for tests and for the day rides are calibrated. */
  enabled?: Partial<Record<Sport, boolean>>
}

/** How each sport's activities are reduced to values. The same table says which sports are compared. */
const SERIES: Record<
  Sport,
  (digests: readonly ActivityDigest[], sport: Sport, setAside: ReadonlySet<string>) => UnitSeries
> = { run: runSeries, ride: rideSeries }

/** Whether a sport is compared unless the caller says otherwise: the run is, the ride waits for its noise to be measured. */
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
  const records =
    first === undefined ? [] : monitor(runs, weekOfMs(first.startMs), weekOfMs(asOfMs))
  return describe(sport, series, runs, records, asOfMs)
}

interface Input {
  setAside: ReadonlySet<string>
  options: FitnessOptions
}

function compute(digests: ActivityDigest[], input: Input): FitnessBySport {
  const current = orderedCurrent(digests)
  const asOfMs = input.options.asOfMs ?? current.at(-1)?.startMs ?? 0
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
