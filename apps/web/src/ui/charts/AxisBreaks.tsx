import type { PlotBox } from './chartTypes'
import type { TimeScale } from './timeScale'
import { gapSpanText } from './trendGap'
import './AxisBreaks.css'

/** How far each slash of a break mark reaches either side of its centre, in px. */
const SLASH_PX = 5
/** The gap between the two slashes, in px. */
const SLASH_GAP_PX = 4

/**
 * A break mark on the time axis where a year or more with nothing to show is skipped: a hairline up the plot and two
 * slashes across the axis. The mark carries the skipped dates as its title, and the chart's notes say them too.
 */
export function AxisBreaks({ breaks, plot }: { breaks: TimeScale['breaks']; plot: PlotBox }) {
  return (
    <>
      {breaks.map(({ x, gap }) => (
        <g key={gap.fromMs} data-testid="axis-break" className="axis-break">
          <title>{`The axis skips ${gapSpanText(gap)}`}</title>
          <line className="axis-break__line" x1={x} x2={x} y1={plot.top} y2={plot.bottom} />
          {[-SLASH_GAP_PX / 2, SLASH_GAP_PX / 2].map((dx) => (
            <line
              key={dx}
              className="axis-break__slash"
              x1={x + dx - SLASH_PX / 2}
              x2={x + dx + SLASH_PX / 2}
              y1={plot.bottom + SLASH_PX}
              y2={plot.bottom - SLASH_PX}
            />
          ))}
        </g>
      ))}
    </>
  )
}
