import type { Sport } from '@rca/core/types'
import { SPORT_FORMAT } from '../sports'
import { diamondPath } from './chartInteraction'
import './ChartSeries.css'

/** One point in its sport's colour and shape: a dot for a run, a diamond for a ride, ringed in the page. */
export function SportMark({
  sport,
  x,
  y,
  r,
  testId,
}: {
  sport: Sport
  x: number
  y: number
  r: number
  testId: string
}) {
  return SPORT_FORMAT[sport].glyph === 'diamond' ? (
    <path
      data-testid={testId}
      data-shape="diamond"
      className={`chart-series__marker chart-series__marker--${sport}`}
      d={diamondPath(x, y, r + 1)}
    />
  ) : (
    <circle
      data-testid={testId}
      data-shape="circle"
      className={`chart-series__marker chart-series__marker--${sport}`}
      cx={x}
      cy={y}
      r={r}
    />
  )
}
