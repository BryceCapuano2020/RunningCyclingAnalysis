import { slice } from '../fitness/windows'
import type { RunPoint } from '../fitness/windows'
import { LOOKBACK } from './params'

const A = LOOKBACK.card

/** A change the fitness card declared, as the weeks it can have happened in: a fall (a slip) or a rise (its return). */
export interface Anchor {
  dir: 'fall' | 'rise'
  /** The first and last week (since the origin) the change can have begun in. */
  from: number
  to: number
}

/** The mean of the runs in a stretch of weeks, and how many there were. */
function meanOf(runs: readonly RunPoint[], fromWeek: number, toWeek: number) {
  const rs = slice(runs, fromWeek * 7, toWeek * 7)
  return { n: rs.length, m: rs.reduce((total, r) => total + r.x, 0) / Math.max(1, rs.length) }
}

/**
 * The week inside the anchor's window where the runs split best into a level before and a level after, the biggest fall for
 * a fall and the biggest rise for a rise: the dates the card's own declaration could not give (it trails a change by
 * weeks). Null when no week has enough runs on both sides.
 */
export function bestSplit(
  runs: readonly RunPoint[],
  anchor: Anchor,
  sigma: number,
  firstWeek: number,
): number | null {
  let best: { week: number; score: number } | null = null
  for (let week = Math.max(anchor.from, firstWeek + A.sideWeeks); week <= anchor.to; week++) {
    const before = meanOf(runs, week - A.beforeWeeks, week)
    const after = meanOf(runs, week, week + A.afterWeeks)
    if (before.n < A.sideRuns || after.n < A.sideRuns) continue
    const t = (after.m - before.m) / (sigma * Math.sqrt(1 / before.n + 1 / after.n))
    const score = anchor.dir === 'fall' ? -t : t
    if (best === null || score > best.score) best = { week, score }
  }
  return best === null ? null : best.week
}
