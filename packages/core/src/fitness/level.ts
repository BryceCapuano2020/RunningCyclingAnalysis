import { FITNESS } from './params'
import { halfWidth } from './status'
import type { FitnessLevel, FitnessStatus } from './types'
import { instantOf, levelOf, sigmaAt, slice } from './windows'
import type { RunPoint } from './windows'

const D = FITNESS.display

/**
 * The level of the newest steady activities at the reference heart rate: the shortest stretch of `levelWeeks`, back from
 * the newest, that holds `levelMinRuns`, else all of them. Null under `levelMinRuns` steady activities. It uses the
 * activities as the status reads them and the printed range, and decides nothing the monitor decides.
 */
export function levelOfNewest(runs: readonly RunPoint[]): FitnessLevel | null {
  if (runs.length < D.levelMinRuns) return null
  const end = runs.at(-1)!.t + 1
  const stretch = D.levelWeeks
    .map((weeks) => slice(runs, end - weeks * 7, end))
    .find((rs) => rs.length >= D.levelMinRuns)
  const rs = stretch ?? runs
  const level = levelOf(rs, 0, sigmaAt(runs, end))!
  const half = halfWidth(level.se)
  return {
    value: Math.exp(level.m),
    low: Math.exp(level.m - half),
    high: Math.exp(level.m + half),
    runs: rs.length,
    fromMs: instantOf(rs[0]!),
    toMs: instantOf(rs.at(-1)!),
  }
}

/** A status that cannot call a trend, with the level its steady activities do give; any other status as it is. */
export function withLevel(status: FitnessStatus, runs: readonly RunPoint[]): FitnessStatus {
  const { shortfall } = status
  if (shortfall === null || shortfall.kind === 'unavailable') return status
  const level = levelOfNewest(runs)
  return level === null ? status : { ...status, level }
}
