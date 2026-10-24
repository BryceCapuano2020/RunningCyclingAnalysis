import type { PlotBox } from './chartTypes'

/** Height of the mark on the date axis under a week with no value. */
const GAP_MARK_PX = 6

/** A short mark on the date axis under each week that has no value, so the gap reads as a gap. */
export function GapMarks({
  xs,
  gaps,
  plot,
}: {
  xs: readonly number[]
  gaps: readonly boolean[]
  plot: PlotBox
}) {
  return (
    <>
      {xs.map((x, i) =>
        gaps[i] ? (
          <line
            key={x}
            data-testid="trend-gap"
            className="chart-series__gap"
            x1={x}
            x2={x}
            y1={plot.bottom - GAP_MARK_PX}
            y2={plot.bottom}
          />
        ) : null,
      )}
    </>
  )
}
