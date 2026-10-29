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
  /** Id of the arrow-key hint, which describes the plot surface. */
  hintId: string
  /** Id of the figure's title, which names the plot surface. */
  titleId: string
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
  /** A dashed key for an estimate, or a thinner grey line for the previous period. Solid when omitted. */
  swatch?: 'solid' | 'dashed' | 'previous'
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
  /** Columns of words, set on the left rather than the right as numbers are. */
  textColumns?: number[]
  /** Columns a phone does not show, so its table fits the page. */
  phoneHidden?: number[]
}
