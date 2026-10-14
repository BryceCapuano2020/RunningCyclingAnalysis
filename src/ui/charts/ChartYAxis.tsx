import type { AxisTick, PlotBox } from './chartTypes'
import './ChartYAxis.css'

export interface ChartYAxisProps {
  ticks: AxisTick[]
  plot: PlotBox
  title: string
}

/** Horizontal hairline gridlines, tick labels to the left, and the axis title above the plot. */
export function ChartYAxis({ ticks, plot, title }: ChartYAxisProps) {
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
            x={plot.left - 8}
            y={tick.position}
            textAnchor="end"
            dominantBaseline="central"
          >
            {tick.label}
          </text>
        </g>
      ))}
      <text className="chart-y-axis__title" x={plot.left} y={plot.top - 12} textAnchor="start">
        {title}
      </text>
    </g>
  )
}
