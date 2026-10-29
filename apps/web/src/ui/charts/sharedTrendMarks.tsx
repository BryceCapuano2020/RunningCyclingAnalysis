import { markerRadii } from './chartInteraction'
import type { ChartSize } from './chartTypes'
import type { Sport } from '@rca/core/types'
import type { SharedLayout } from './sharedTrendLayout'
import type { TrendRows } from './sharedTrendRows'
import { SHORT_RUN_POINTS, isIsolated } from './smoothPath'

/** The marks of one sport: a ring or a dot at each point that has one, the end point larger. */
export function marksOf(
  sport: Sport,
  hollow: boolean,
  data: TrendRows,
  m: SharedLayout,
  size: ChartSize,
  active: number | null,
) {
  const points = m[sport]
  const runs = { run: m.runRuns, ride: m.rideRuns }[sport]
  const short = new Set(runs.filter((run) => run.length < SHORT_RUN_POINTS).flat())
  // An isolated stretch is one marker at its mean, drawn apart, so its points have none of their own.
  const isolated = new Set(runs.filter((run, i) => isIsolated(run, i, runs)).flat())
  const latest = points.findLastIndex((point) => point !== null)
  const { marker, active: activeR } = markerRadii(size.width)
  return data.rows.map((week, i) => {
    const point = points[i]
    if (!point) return null
    if (isolated.has(point) && i !== active) return null
    const shown = m.markers || short.has(point) || i === latest || i === active
    if (!shown) return null
    const r = i === latest || i === active ? activeR : marker
    return (
      <circle
        key={week.endMs}
        data-testid={hollow ? 'trend-ring' : 'trend-marker'}
        data-sport={sport}
        className={
          hollow
            ? 'chart-series__ring--ride'
            : `chart-series__marker chart-series__marker--${sport}`
        }
        cx={point.x}
        cy={point.y}
        r={r}
      />
    )
  })
}

/**
 * An isolated stretch (two points or fewer, cut off by breaks) as one marker at its mean: a dot for a run, a ring
 * for an estimated ride, which also carries its 90% range as a short bar through it.
 */
export function isolatedMarks(m: SharedLayout, size: ChartSize) {
  const { active: r } = markerRadii(size.width)
  return (
    <>
      {m.isolatedRun.map((at) => (
        <circle
          key={`run-${at.x}`}
          data-testid="trend-marker"
          data-sport="run"
          data-isolated="true"
          className="chart-series__marker chart-series__marker--run"
          cx={at.x}
          cy={at.y}
          r={r}
        />
      ))}
      {m.isolatedRide.map(({ at, low, high }) => (
        <g key={`ride-${at.x}`}>
          <line
            data-testid="trend-interval"
            data-sport="ride"
            className="trend-interval"
            x1={at.x}
            x2={at.x}
            y1={high.y}
            y2={low.y}
          />
          <circle
            data-testid="trend-ring"
            data-sport="ride"
            data-isolated="true"
            className="chart-series__ring--ride"
            cx={at.x}
            cy={at.y}
            r={r}
          />
        </g>
      ))}
    </>
  )
}
