import { DAY_MS } from '../constants'
import { FITNESS } from './params'
import { WEEK_ORIGIN_MS } from './machine'
import { levelOf, sigmaAt, slice } from './windows'
import type { Level, RunPoint } from './windows'
import type { FitnessPoint } from './types'

const D = FITNESS.display
const E = FITNESS.episode
const M = FITNESS.monitor

const msOfDay = (day: number) => WEEK_ORIGIN_MS + day * DAY_MS

/**
 * A level as a point: its output and the ends of its 90% range, the half-width as the printed ranges have it, and
 * the weeks it was read over.
 */
export function pointOf(level: Level, atMs: number, weeks: number): FitnessPoint {
  const half = D.rangeZ * Math.sqrt(level.se ** 2 + M.rangeTau ** 2)
  return {
    atMs,
    value: Math.exp(level.m),
    low: Math.exp(level.m - half),
    high: Math.exp(level.m + half),
    runs: level.n,
    weeks,
  }
}

/**
 * The level at four-weekly steps back from `day` (the end of the last week), over the last 76 weeks: at each
 * step the runs of the shortest of the stretches the status itself reads (4 to 16 weeks) that holds enough of
 * them, with a step that has none left out. `now` is the status's own level, which ends the series, so the chart's
 * last point and the status's figure are the one number. Small by construction: at most 20 points, no per-run data.
 */
export function levelSeries(
  runs: readonly RunPoint[],
  day: number,
  reference: number,
  now: FitnessPoint,
): FitnessPoint[] {
  const points: FitnessPoint[] = []
  const first = runs[0]?.t ?? day
  for (let k = 1; k * D.seriesStepWeeks <= D.seriesWeeks; k++) {
    const end = day - k * D.seriesStepWeeks * 7
    if (end <= first) break
    const sigma = sigmaAt(runs, end)
    for (const weeks of D.nowWeeks) {
      const rs = slice(runs, end - weeks * 7, end)
      if (rs.length < E.minRuns) continue
      // A step is dated by the last day it includes, a Sunday: `end` is the Monday that follows it and is not in it.
      points.push(pointOf(levelOf(rs, reference, sigma)!, msOfDay(end) - 1, weeks))
      break
    }
  }
  return [...points.reverse(), now]
}
