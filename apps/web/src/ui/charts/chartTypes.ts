/** Pixel box of the plotting area inside the chart's SVG. */
export interface PlotBox {
  left: number
  right: number
  top: number
  bottom: number
}

export interface ChartSize {
  width: number
  height: number
  plot: PlotBox
  /** Id of the tooltip's status element, for aria-describedby on the plot surface. */
  tooltipId: string
  /** The chart's visible title, which the plot surface names the chart by. */
  title: string
}

export interface Point {
  x: number
  y: number
}

export type SeriesKind = 'run' | 'ride' | 'neutral'

export interface AxisTick {
  position: number
  label: string
}

export interface TooltipRow {
  label: string
  value: string
  kind?: SeriesKind
  /** Muted line shown under the row. */
  note?: string
}

/** Anchor is in SVG pixels, the same space as the plot. */
export interface TooltipContent {
  x: number
  y: number
  title: string
  rows: TooltipRow[]
}

export interface ChartTableData {
  columns: string[]
  rows: string[][]
  /** Names the table for screen readers and sighted readers alike. */
  caption?: string
}
