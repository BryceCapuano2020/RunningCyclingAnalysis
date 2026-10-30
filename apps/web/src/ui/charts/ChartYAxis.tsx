import type { AxisTick, PlotBox } from './chartTypes'
import { axisFontRem } from './ticks'
import { INSIDE_LIFT, TICK_GAP, TITLE_RISE, yLabelLayout } from './yAxisLabels'
import './ChartYAxis.css'

export interface ChartYAxisProps {
  ticks: AxisTick[]
  plot: PlotBox
  /** Optional axis title above the plot. Leave it out when the card heading says what is shown. */
  title?: string
  /** Tick text size in px. */
  fontSize?: number
  /**
   * Draws the tick labels alone, no gridlines and not the title (which still decides which labels would run into it): a chart that lays marks over the plot draws the labels once
   * more on top of them, so a line that crosses an inside label does not strike it through (the halo hides it).
   */
  labelsOnly?: boolean
}

/**
 * Gridlines, tick labels to the left of the plot, and an optional title above it. Where the widest label
 * does not fit the gutter (a phone's 40 px), every label is set inside the plot instead, above its
 * gridline and over a halo, so the gutter can stay narrow and no label is cut off. An inside label near the
 * plot's top would run up into the title, so its text is left off there; its gridline stays.
 */
export function ChartYAxis({
  ticks,
  plot,
  title,
  fontSize = 12,
  labelsOnly = false,
}: ChartYAxisProps) {
  const { inside, reachesTitle } = yLabelLayout(ticks, plot, title, fontSize)
  return (
    <g className="chart-y-axis">
      {ticks.map((tick) => (
        <g key={tick.position}>
          {labelsOnly ? null : (
            <line
              className="chart-y-axis__grid"
              x1={plot.left}
              x2={plot.right}
              y1={tick.position}
              y2={tick.position}
            />
          )}
          {reachesTitle(tick) ? null : (
            <text
              className={
                inside ? 'chart-y-axis__tick chart-y-axis__tick--inside' : 'chart-y-axis__tick'
              }
              style={{ fontSize: axisFontRem(fontSize) }}
              x={inside ? plot.left + 4 : plot.left - TICK_GAP}
              y={inside ? tick.position - INSIDE_LIFT : tick.position}
              textAnchor={inside ? 'start' : 'end'}
              dominantBaseline={inside ? 'auto' : 'central'}
            >
              {tick.label}
            </text>
          )}
        </g>
      ))}
      {title && !labelsOnly ? (
        <text
          className="chart-y-axis__title"
          x={plot.left}
          y={plot.top - TITLE_RISE}
          textAnchor="start"
        >
          {title}
        </text>
      ) : null}
    </g>
  )
}
