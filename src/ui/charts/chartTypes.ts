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
}
