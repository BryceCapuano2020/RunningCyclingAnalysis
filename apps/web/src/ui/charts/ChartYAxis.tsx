import type { AxisTick, PlotBox } from './chartTypes'
import { axisFontRem, labelWidth, rootScale } from './ticks'
import './ChartYAxis.css'

export interface ChartYAxisProps {
  ticks: AxisTick[]
  plot: PlotBox
  /** Optional axis title above the plot. Leave it out when the card heading says what is shown. */
  title?: string
  /** Tick text size in px. */
  fontSize?: number
}

/** The gap, px, between a tick label and the plot's left edge. */
const TICK_GAP = 8

/** How far above its gridline an inside label's baseline sits, px. */
const INSIDE_LIFT = 5

/** How far above the plot's top edge the axis title's baseline sits, px. */
const TITLE_RISE = 12

/**
 * Gridlines, tick labels to the left of the plot, and an optional title above it. Where the widest label
 * does not fit the gutter (a phone's 40 px), every label is set inside the plot instead, above its
 * gridline and over a halo, so the gutter can stay narrow and no label is cut off. An inside label near the
 * plot's top would run up into the title, so its text is left off there; its gridline stays.
 */
export function ChartYAxis({ ticks, plot, title, fontSize = 12 }: ChartYAxisProps) {
  const scale = rootScale()
  const widest = Math.max(0, ...ticks.map((tick) => labelWidth(tick.label, fontSize, scale)))
  const inside = widest + TICK_GAP > plot.left
  // The title's descent reaches 3 px below its baseline; an inside label reaches fontSize + INSIDE_LIFT above its line.
  const reachesTitle = (tick: AxisTick) =>
    inside && Boolean(title) && tick.position - INSIDE_LIFT - fontSize < plot.top - TITLE_RISE + 3
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
      {title ? (
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
