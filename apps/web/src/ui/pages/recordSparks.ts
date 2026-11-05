import { EFFORT_LENGTHS_S } from '@rca/core/digest/trendPoints'
import type { EffortLengthS } from '@rca/core/digest/trendPoints'
import type { TrendPoint } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import { bestDots } from '../charts/bestsOverTime'
import type { SparkPoint } from '../components/Sparkline'

/**
 * The sparkline of each best-effort row that has a trend, by the row's key: the dated bests "Best efforts by day" draws
 * for 5, 20 and 60 min (bestDots), so a row's line is that chart's series and no figure of its own.
 */
export function recordSparks(
  sport: Sport,
  trends: Readonly<Record<EffortLengthS, readonly TrendPoint[]>>,
  massKg: number,
): Record<string, readonly SparkPoint[]> {
  return Object.fromEntries(
    EFFORT_LENGTHS_S.map((durationS) => [
      String(durationS),
      bestDots(trends[durationS], sport, massKg),
    ]),
  )
}
