import { useId } from 'react'
import type { ReactNode } from 'react'
import { ChartLegend } from './ChartLegend'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartTable } from './ChartTable'
import type { ChartSize, ChartTableData } from './chartTypes'
import { PLOT_MARGIN, plotBoxOf } from './plotBox'
import { useSize } from './useSize'
import './ChartFrame.css'

export interface ChartFrameProps {
  title: string
  description: string
  /** One sentence under the title that says what the chart shows, such as its finding. */
  lede?: string
  /** Height of the whole SVG, axis labels included. */
  height?: number
  /**
   * Shown above the plot, in a row that is kept whenever the chart has a legend, so a key appearing
   * does not move the plot. An empty legend keeps the row, and then keyNote can take it. A chart that
   * keeps its key's row while the key is empty passes an empty array rather than undefined.
   */
  legend?: ChartLegendEntry[]
  /** Muted text in the key row, where a key would be, such as why a previous period has no line. */
  keyNote?: string
  table: ChartTableData
  /** A short table shown above `table` in the text view, for totals that are not per point. */
  summary?: ChartTableData
  /** Replaces the plot with a short message when set. */
  empty?: string
  /** Muted text under the plot, which shows even while the chart is empty, to say why it is. */
  note?: string
  /** Right margin of the plot, as a function of width. Default 16 px. */
  plotRightMargin?: (width: number) => number
  /** Bottom margin of the plot, which holds the x-axis title. A chart with no x title passes PLOT_BOTTOM_WITHOUT_X_TITLE. */
  plotBottomMargin?: number
  /** The static drawing: gridlines, axes and marks. Exposed to screen readers as one image. */
  children: (size: ChartSize) => ReactNode
  /** Interactive layer, drawn above the drawing: the focusable plot surface. */
  surface?: (size: ChartSize) => ReactNode
  /** HTML laid over the plot, such as a tooltip. */
  overlay?: (size: ChartSize) => ReactNode
}

/**
 * Whether a key is shown: two entries, or one line or dashed entry, which names a single series that the
 * plot would otherwise leave unnamed. A single dot or diamond is left out, as a point's shape needs no key.
 */
function showLegend(legend: ChartLegendEntry[] | undefined): boolean {
  if (legend === undefined) return false
  return (
    legend.length >= 2 ||
    legend.some((entry) => entry.swatch === 'dashed' || entry.swatch === 'line')
  )
}

const DEFAULT_HEIGHT = 320
/** Shown on a chart that can be read by keyboard, over the plot's top corner. The CSS reveals it while the plot has focus. */
const READING_HINT = 'Left and right arrows read values'
/** How far the hint sits below the top of the chart, in px: in the margin above the plot, which holds no data. */
const HINT_INSET = 2

export function ChartFrame({
  title,
  description,
  lede,
  height = DEFAULT_HEIGHT,
  legend,
  table,
  summary,
  empty,
  keyNote,
  note,
  plotRightMargin,
  plotBottomMargin,
  children,
  surface,
  overlay,
}: ChartFrameProps) {
  const [stageRef, width] = useSize()
  const id = useId()
  const titleId = `${id}-title`
  const hintId = `${id}-hint`
  const rightMargin = plotRightMargin ? plotRightMargin(width) : PLOT_MARGIN.right
  const size: ChartSize = {
    width,
    height,
    plot: plotBoxOf(width, height, rightMargin, plotBottomMargin),
    tooltipId: `${id}-tooltip`,
    hintId,
  }

  return (
    <figure className="chart-frame" aria-labelledby={titleId}>
      <figcaption id={titleId} className="chart-frame__title">
        {title}
      </figcaption>
      {lede ? <p className="chart-frame__lede">{lede}</p> : null}
      {/* The row is kept whenever the chart may have a key, so a key appearing does not move the plot. */}
      {legend === undefined ? null : (
        <div className="chart-frame__legend">
          {showLegend(legend) ? (
            <ChartLegend entries={legend} />
          ) : keyNote ? (
            <p className="chart-frame__note">{keyNote}</p>
          ) : null}
        </div>
      )}
      <div ref={stageRef} className="chart-frame__stage">
        {empty ? (
          <p className="chart-frame__empty">{empty}</p>
        ) : (
          <>
            <svg
              className="chart-frame__svg"
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
            >
              <g role="img" aria-label={description}>
                {children(size)}
              </g>
              {surface?.(size)}
            </svg>
            <div className="chart-frame__overlay">
              {overlay?.(size)}
              {surface ? (
                <p
                  id={hintId}
                  className="chart-frame__hint"
                  style={{ top: HINT_INSET, right: size.width - size.plot.right }}
                >
                  {READING_HINT}
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>
      {note ? <p className="chart-frame__note">{note}</p> : null}
      {!empty ? (
        <details className="chart-frame__details">
          <summary>View as table</summary>
          {summary ? <ChartTable {...summary} /> : null}
          <ChartTable {...table} />
        </details>
      ) : null}
    </figure>
  )
}
