import type { AxisTick, PlotBox } from './chartTypes'
import { axisFontRem } from './ticks'
import './ChartYAxis.css'

export interface ChartYAxisProps {
  ticks: AxisTick[]
  plot: PlotBox
  /** Optional axis title above the plot. Leave it out when the card heading says what is shown. */
  title?: string
  /** Tick text size in px. */
  fontSize?: number
}

/** Horizontal hairline gridlines, tick labels to the left, and an optional title above the plot. */
export function ChartYAxis({ ticks, plot, title, fontSize = 12 }: ChartYAxisProps) {
  return (
    <g className="chart-y-axis">
      {ticks.map((tick) => (
        <g key={tick.position}>
          <line
            className="chart-y-axis__grid"
            x1={plot.left}
            x2={plot.right}
            y1={tick.position}
            y2={tick.position}
          />
          <text
            className="chart-y-axis__tick"
            style={{ fontSize: axisFontRem(fontSize) }}
            x={plot.left - 8}
            y={tick.position}
            textAnchor="end"
            dominantBaseline="central"
          >
            {tick.label}
          </text>
        </g>
      ))}
      {title ? (
        <text className="chart-y-axis__title" x={plot.left} y={plot.top - 12} textAnchor="start">
          {title}
        </text>
      ) : null}
    </g>
  )
}
