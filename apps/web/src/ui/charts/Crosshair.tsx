import type { PlotBox } from './chartTypes'

/** The vertical line through the active point, from the top of the plot to its bottom. */
export function Crosshair({ x, plot }: { x: number; plot: PlotBox }) {
  return <line className="chart-crosshair" x1={x} x2={x} y1={plot.top} y2={plot.bottom} />
}
