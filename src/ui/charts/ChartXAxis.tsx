import type { AxisTick, PlotBox } from './chartTypes'
import './ChartXAxis.css'

export interface ChartXAxisProps {
  ticks: AxisTick[]
  plot: PlotBox
  title: string
  /** Tick text size in px. */
  fontSize?: number
}

/** Vertical hairline gridlines, tick labels under the plot, and the axis title. */
export function ChartXAxis({ ticks, plot, title, fontSize = 12 }: ChartXAxisProps) {
  return (
    <g className="chart-x-axis">
      {ticks.map((tick) => (
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
            style={{ fontSize }}
            x={tick.position}
            y={plot.bottom + 18}
            textAnchor="middle"
          >
            {tick.label}
          </text>
        </g>
      ))}
      <text
        className="chart-x-axis__title"
        x={(plot.left + plot.right) / 2}
        y={plot.bottom + 38}
        textAnchor="middle"
      >
        {title}
      </text>
    </g>
  )
}
