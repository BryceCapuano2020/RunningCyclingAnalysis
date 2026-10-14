import type { ReactNode } from 'react'
import { ChartLegend } from './ChartLegend'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartTable } from './ChartTable'
import type { ChartSize, ChartTableData } from './chartTypes'
import { useSize } from './useSize'
import './ChartFrame.css'

export interface ChartFrameProps {
  title: string
  description: string
  /** Height of the whole SVG, axis labels included. */
  height?: number
  /** Shown above the plot only when it has two or more entries. */
  legend?: ChartLegendEntry[]
  table: ChartTableData
  /** Replaces the plot with a short message when set. */
  empty?: string
  /** Muted text under the plot. */
  note?: string
  /** Draws the marks, axes and hit surface inside the SVG. */
  children: (size: ChartSize) => ReactNode
  /** HTML laid over the plot, such as a tooltip. */
  overlay?: (size: ChartSize) => ReactNode
}

const DEFAULT_HEIGHT = 320
const MARGIN = { top: 28, right: 16, bottom: 52, left: 56 }

export function ChartFrame({
  title,
  description,
  height = DEFAULT_HEIGHT,
  legend,
  table,
  empty,
  note,
  children,
  overlay,
}: ChartFrameProps) {
  const [stageRef, width] = useSize()
  const size: ChartSize = {
    width,
    height,
    plot: {
      left: MARGIN.left,
      right: Math.max(MARGIN.left + 1, width - MARGIN.right),
      top: MARGIN.top,
      bottom: height - MARGIN.bottom,
    },
  }

  return (
    <figure className="chart-frame" aria-label={title}>
      {legend && legend.length >= 2 ? <ChartLegend entries={legend} /> : null}
      <div
        ref={stageRef}
        className="chart-frame__stage"
        style={empty ? { minHeight: height } : undefined}
      >
        {empty ? (
          <p className="chart-frame__empty">{empty}</p>
        ) : (
          <>
            <svg
              className="chart-frame__svg"
              role="img"
              aria-label={title}
              width={width}
              height={height}
              viewBox={`0 0 ${width} ${height}`}
            >
              <title>{title}</title>
              <desc>{description}</desc>
              {children(size)}
            </svg>
            <div className="chart-frame__overlay">{overlay?.(size)}</div>
          </>
        )}
      </div>
      {!empty && note ? <p className="chart-frame__note">{note}</p> : null}
      {!empty ? (
        <details className="chart-frame__details">
          <summary>View as table</summary>
          <ChartTable columns={table.columns} rows={table.rows} />
        </details>
      ) : null}
    </figure>
  )
}
