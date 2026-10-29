import { valueMap } from './timeSeriesLayout'
import type { StackLayout } from './timeSeriesLayout'
import type { ChartSize } from './chartTypes'
import type { StackChannel } from './timeSeriesTypes'

const MARKER_R = 4

/**
 * The crosshair through every row and a ringed dot where it crosses each channel's line, drawn apart from the
 * rows so that moving the cursor draws these few marks and not the whole stack.
 */
export function TimeSeriesCursor({
  size,
  layout,
  channels,
  startS,
  endS,
  cursor,
}: {
  size: ChartSize
  layout: StackLayout
  channels: readonly StackChannel[]
  startS: number
  endS: number
  /** The cursor's whole second. */
  cursor: number
}) {
  const { plot } = size
  const span = Math.max(1, endS - startS)
  const x = plot.left + ((cursor + 0.5 - startS) / span) * (plot.right - plot.left)
  return (
    <>
      <line
        className="chart-crosshair ts-stack__crosshair"
        x1={x}
        x2={x}
        y1={plot.top}
        y2={plot.bottom}
      />
      {/* The dots sit above the crosshair, so each reads against it. */}
      {channels.map((channel, index) => {
        const reading = channel.at(cursor)
        if (reading === null) return null
        return (
          <g key={channel.key} className={`ts-ch ts-ch--${channel.colour}`}>
            <circle
              className="ts-stack__dot"
              cx={x}
              cy={valueMap(channel, layout.rows[index]!)(reading.raw)}
              r={MARKER_R}
            />
          </g>
        )
      })}
    </>
  )
}
