import type { Sport } from '@rca/core/types'
import { SPORT_LABEL } from '../sports'
import type { ChartLegendEntry } from './ChartLegend'
import type { PreviousCurve } from './SportCurveChart'

/**
 * The key for a drawn curve. A period with a period before it keeps the key's row even when that
 * period has nothing to draw, so the plot does not move as it appears or goes. All time has no period
 * before it, so it has no row.
 */
export function keyOf(
  sport: Sport,
  shown: PreviousCurve | null,
  previous: PreviousCurve | null,
): ChartLegendEntry[] | undefined {
  if (shown === null) return previous === null ? undefined : []
  return [
    { label: SPORT_LABEL[sport], kind: sport, swatch: 'line' },
    { label: shown.label, kind: 'neutral', swatch: 'previous' },
  ]
}
