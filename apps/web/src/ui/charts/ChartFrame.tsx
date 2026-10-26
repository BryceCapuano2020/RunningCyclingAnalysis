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
  /** Height of the whole SVG, axis labels included. */
  height?: number
  /**
   * Shown above the plot when it has two or more entries, or one dashed entry, since a dashed key
   * names an estimate or a comparison that a reader must be able to find. A chart that keeps its key's
   * row while the key is empty passes an empty array rather than undefined, so the plot does not move.
   */
  legend?: ChartLegendEntry[]
  table: ChartTableData
  /** A short table shown above `table` in the text view, for totals that are not per point. */
  summary?: ChartTableData
  /** Replaces the plot with a short message when set. */
  empty?: string
  /** Muted text under the plot. */
  note?: string
  /** Right margin of the plot, as a function of width. Default 16 px. */
  plotRightMargin?: (width: number) => number
  /** The static drawing: gridlines, axes and marks. Exposed to screen readers as one image. */
  children: (size: ChartSize) => ReactNode
  /** Interactive layer, drawn above the drawing: the focusable plot surface. */
  surface?: (size: ChartSize) => ReactNode
  /** HTML laid over the plot, such as a tooltip. */
  overlay?: (size: ChartSize) => ReactNode
}

/** Whether a legend is shown: two entries, or one that is dashed. */
function showLegend(legend: ChartLegendEntry[] | undefined): boolean {
  if (legend === undefined) return false
  return legend.length >= 2 || legend.some((entry) => entry.swatch === 'dashed')
}

const DEFAULT_HEIGHT = 320
/** Shown under a chart that can be read by keyboard. The CSS reveals it while the plot has focus. */
const READING_HINT = 'Left and right arrows read values'

export function ChartFrame({
  title,
  description,
  height = DEFAULT_HEIGHT,
  legend,
  table,
  summary,
  empty,
  note,
  plotRightMargin,
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
    plot: plotBoxOf(width, height, rightMargin),
    tooltipId: `${id}-tooltip`,
    titleId,
    hintId,
  }

  return (
    <figure className="chart-frame" aria-labelledby={titleId}>
      <figcaption id={titleId} className="chart-frame__title">
        {title}
      </figcaption>
      {/* The row is kept whenever the chart may have a key, so a key appearing does not move the plot. */}
      {legend === undefined ? null : (
        <div className="chart-frame__legend">
          {showLegend(legend) ? <ChartLegend entries={legend} /> : null}
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
            <div className="chart-frame__overlay">{overlay?.(size)}</div>
          </>
        )}
      </div>
      {!empty && surface ? (
        <p id={hintId} className="chart-frame__hint">
          {READING_HINT}
        </p>
      ) : null}
      {!empty && note ? <p className="chart-frame__note">{note}</p> : null}
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
