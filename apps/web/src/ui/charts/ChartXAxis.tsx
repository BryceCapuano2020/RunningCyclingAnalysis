import type { AxisTick, PlotBox } from './chartTypes'
import { X_TICK_BASELINE_PX } from './plotBox'
import { axisFontRem, labelWidth, rootScale } from './ticks'
import './ChartXAxis.css'

export interface ChartXAxisProps {
  ticks: AxisTick[]
  plot: PlotBox
  /** Optional axis title under the ticks. Leave it out when the dates or durations say what they are. */
  title?: string
  /** Tick text size in px. */
  fontSize?: number
}

/** Vertical hairline gridlines, tick labels under the plot, and the axis title. */
export function ChartXAxis({ ticks, plot, title, fontSize = 12 }: ChartXAxisProps) {
  // The root is read once per render, for every label's width.
  const scale = rootScale()
  return (
    <g className="chart-x-axis">
      {ticks.map((tick) => {
        // A label centred on a tick near either end of the plot would run past it, so it is anchored
        // to the plot edge instead: the first label starts at its tick and the last ends at it.
        const half = labelWidth(tick.label, fontSize, scale) / 2
        const textAnchor =
          tick.position - half < plot.left
            ? 'start'
            : tick.position + half > plot.right
              ? 'end'
              : 'middle'
        return (
          <g key={tick.position}>
            <line
              className="chart-x-axis__grid"
              x1={tick.position}
              x2={tick.position}
              y1={plot.top}
              y2={plot.bottom}
            />
            <text
              className="chart-x-axis__tick"
              style={{ fontSize: axisFontRem(fontSize) }}
              x={tick.position}
              y={plot.bottom + X_TICK_BASELINE_PX}
              textAnchor={textAnchor}
            >
              {tick.label}
            </text>
          </g>
        )
      })}
      {title ? (
        <text
          className="chart-x-axis__title"
          x={(plot.left + plot.right) / 2}
          y={plot.bottom + 38}
          textAnchor="middle"
        >
          {title}
        </text>
      ) : null}
    </g>
  )
}
