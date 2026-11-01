import type { Sport } from '@rca/core/types'
import { SPORT_FORMAT } from '../sports'
import { diamondPath } from './chartInteraction'
import './ChartSeries.css'

/**
 * One point in its sport's colour and shape: a dot for a run, a diamond for a ride, ringed in the page. A hollow one is the
 * same shape drawn as an outline, for a point that is a floor and not a measured best.
 */
export function SportMark({
  sport,
  x,
  y,
  r,
  testId,
  hollow = false,
}: {
  sport: Sport
  x: number
  y: number
  r: number
  testId: string
  hollow?: boolean
}) {
  return SPORT_FORMAT[sport].glyph === 'diamond' ? (
    <path
      data-testid={testId}
      data-shape="diamond"
      data-hollow={hollow ? 'true' : undefined}
      className={
        hollow
          ? `chart-series__ring--${sport}`
          : `chart-series__marker chart-series__marker--${sport}`
      }
      d={diamondPath(x, y, r + 1)}
    />
  ) : (
    <circle
      data-testid={testId}
      data-shape="circle"
      data-hollow={hollow ? 'true' : undefined}
      className={
        hollow
          ? `chart-series__ring--${sport}`
          : `chart-series__marker chart-series__marker--${sport}`
      }
      cx={x}
      cy={y}
      r={r}
    />
  )
}
