import { halfWidth } from '../fitness/status'
import { levelOf, slice } from '../fitness/windows'
import type { RunPoint } from '../fitness/windows'
import { LOOKBACK } from './params'
import type { WeekSpan } from './episodes'
import type { Level } from './segments'

const Q = LOOKBACK.quiet

/**
 * The levels that were quiet: a plateau of at least `quiet.weeks` weeks and `quiet.runs` steady runs, with no gap in
 * its runs. How quiet is `within`, the largest departure of any block of `blockWeeks` weeks from the plateau's level,
 * plus the half-width of that block's range, the monitor's own reading of "level within X". Blocks with too few runs
 * say nothing. A plateau with a stretch of no steady runs inside it is thin, not quiet, so it is left out.
 * Returns each quiet level's index with its `within`.
 */
export function quietLevels(
  levels: readonly Level[],
  runs: readonly RunPoint[],
  sigma: number,
  gaps: readonly WeekSpan[],
): { index: number; within: number }[] {
  const out: { index: number; within: number }[] = []
  for (const [index, level] of levels.entries()) {
    if (level.toWeek - level.fromWeek < Q.weeks || level.n < Q.runs) continue
    if (gaps.some((g) => g.fromWeek < level.toWeek && g.toWeek > level.fromWeek)) continue
    let within = 0
    let measured = 0
    for (let from = level.fromWeek; from + Q.blockWeeks <= level.toWeek; from += Q.blockWeeks) {
      const block = levelOf(slice(runs, from * 7, (from + Q.blockWeeks) * 7), level.m, sigma)
      if (block === null || block.n < Q.blockRuns) continue
      measured++
      within = Math.max(within, Math.abs(block.m - level.m) + halfWidth(block.se, level.se))
    }
    if (measured >= 2) out.push({ index, within })
  }
  return out
}
