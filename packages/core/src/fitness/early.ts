import { EARLY_TREND, FITNESS } from './params'
import { dayOfWeekEnd, localWeekOf } from './machine'
import { halfWidth, ranged } from './status'
import type { EarlyGroup, FitnessEarly, FitnessStatus } from './types'
import { instantOf, levelOf, sigmaAt, slice } from './windows'
import type { RunPoint } from './windows'

const A = FITNESS.early
const M = FITNESS.monitor

const medianDay = (rs: readonly RunPoint[]): number => {
  const days = rs.map((r) => r.t).sort((a, b) => a - b)
  const mid = days.length >> 1
  return days.length % 2 === 1 ? days[mid]! : (days[mid - 1]! + days[mid]!) / 2
}

function groupOf(rs: readonly RunPoint[], hrOf: ReadonlyMap<string, number>): EarlyGroup {
  const hrs = rs.flatMap((r) => hrOf.get(r.id) ?? []).sort((a, b) => a - b)
  const mid = hrs.length >> 1
  return {
    fromMs: instantOf(rs[0]!),
    toMs: instantOf(rs.at(-1)!),
    runs: rs.length,
    heartRate:
      hrs.length === 0 ? null : hrs.length % 2 === 1 ? hrs[mid]! : (hrs[mid - 1]! + hrs[mid]!) / 2,
  }
}

/**
 * The newest steady rides against the first ones of the monitor's window (the last `refStartWeeks` weeks), while the
 * monitor has no baseline. Groups of up to `maxGroup` shrink until their median days are `minApartDays` apart; under
 * `minGroup` there is none. Each ride is already at the reference heart rate. The range is the app's 90% one with the
 * model-error floor once for each group, since each group's level wanders on its own. A display state: it decides nothing
 * the monitor decides. docs/design/ride-early-trend.md.
 */
export function earlyTrendOf(
  runs: readonly RunPoint[],
  day: number,
  hrOf: ReadonlyMap<string, number> = new Map(),
): FitnessEarly | null {
  const rides = slice(runs, day - M.refStartWeeks * 7, day)
  let n = Math.min(A.maxGroup, Math.floor(rides.length / 2))
  while (
    n >= A.minGroup &&
    medianDay(rides.slice(-n)) - medianDay(rides.slice(0, n)) < A.minApartDays
  )
    n--
  if (n < A.minGroup) return null
  const first = rides.slice(0, n)
  const newest = rides.slice(-n)
  const sigma = sigmaAt(runs, day)
  const a = levelOf(first, 0, sigma)!
  const b = levelOf(newest, 0, sigma)!
  return {
    change: ranged(b.m - a.m, halfWidth(a.se, b.se, M.rangeTau)),
    first: groupOf(first, hrOf),
    newest: groupOf(newest, hrOf),
  }
}

/**
 * A status that waits for the monitor's baseline, with its early trend when the sport shows one and the rides give it. `hrOf` is
 * the heart rate each ride was read at, by id, for the groups' median heart rates.
 */
export function withEarly(
  status: FitnessStatus,
  runs: readonly RunPoint[],
  sport: FitnessStatus['sport'],
  asOfMs: number,
  hrOf: ReadonlyMap<string, number>,
): FitnessStatus {
  if (!EARLY_TREND[sport] || status.shortfall?.kind !== 'history') return status
  const early = earlyTrendOf(runs, dayOfWeekEnd(localWeekOf(asOfMs + 1) - 1), hrOf)
  return early === null ? status : { ...status, early }
}
