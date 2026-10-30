import type { AxisTick, PlotBox } from './chartTypes'
import { labelLayout } from './labelLayout'
import { X_TICK_BASELINE_PX, geometryScale } from './plotBox'
import { DEFAULT_ROOT_PX, readRoot } from './rootFont'
import { axisFontRem, labelWidth } from './ticks'
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
  const root = readRoot()
  const scale = root.px / DEFAULT_ROOT_PX
  const offset = geometryScale()
  const baseline = plot.bottom + X_TICK_BASELINE_PX * offset
  const placed = ticks.map((tick) => {
    // A label centred on a tick near either end of the plot would run past it, so it is anchored
    // to the plot edge instead: the first label starts at its tick and the last ends at it.
    const width = labelWidth(tick.label, fontSize, scale, root)
    const textAnchor =
      tick.position - width / 2 < plot.left
        ? 'start'
        : tick.position + width / 2 > plot.right
          ? 'end'
          : 'middle'
    const left =
      textAnchor === 'start'
        ? tick.position
        : textAnchor === 'end'
          ? tick.position - width
          : tick.position - width / 2
    return { tick, textAnchor: textAnchor as 'start' | 'middle' | 'end', left, width }
  })
  // The thinning above this component works from estimates, and a reader's own text size or spacing can make
  // two neighbours meet anyway (the last one is anchored to the plot's edge, so it sits nearer than centred).
  // The ends are kept before the ticks between them, so what is dropped is a middle label, and the grid line stays.
  const shown = new Set(
    labelLayout(
      placed.map(({ left, width }, i) => ({
        id: String(i),
        priority: i === placed.length - 1 ? 0 : i === 0 ? 1 : 2,
        box: {
          left,
          right: left + width,
          top: baseline - fontSize * scale,
          bottom: baseline + fontSize * scale * 0.25,
        },
      })),
      { left: plot.left - 1, right: plot.right + 1, top: -Infinity, bottom: Infinity },
    ).kept,
  )
  return (
    <g className="chart-x-axis">
      {placed.map(({ tick, textAnchor }, i) => (
        <g key={tick.position}>
          <line
            className="chart-x-axis__grid"
            x1={tick.position}
            x2={tick.position}
            y1={plot.top}
            y2={plot.bottom}
          />
          {shown.has(String(i)) ? (
            <text
              className="chart-x-axis__tick"
              style={{ fontSize: axisFontRem(fontSize) }}
              x={tick.position}
              y={baseline}
              textAnchor={textAnchor}
            >
              {tick.label}
            </text>
          ) : null}
        </g>
      ))}
      {title ? (
        <text
          className="chart-x-axis__title"
          x={(plot.left + plot.right) / 2}
          y={plot.bottom + 38 * offset}
          textAnchor="middle"
        >
          {title}
        </text>
      ) : null}
    </g>
  )
}
