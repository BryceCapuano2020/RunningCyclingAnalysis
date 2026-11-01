import type { BestsModel } from './bestsByYearModel'
import type { AxisTick, ChartSize, PlotBox, Point } from './chartTypes'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, PLOT_MARGIN, geometryScale } from './plotBox'
import { fittedYAxis } from './sportAxis'
import { axisFontSize, fitTicks, labelWidth, rootScale } from './ticks'

/** The height of one panel's plot, px, at the default text size: room for four or so rows of 13 px labels. */
const PANEL_PX = 84
/** The space between two panels, px: the next panel's name sits in it. */
const GAP_PX = 30
/** The room kept at a panel's top for the all-time best's label, px: the label lies inside the panel. */
const LABEL_ROOM_PX = 18
/** How far above its mark the all-time best's label sits, px. */
const LABEL_LIFT_PX = 9
/** Steps a panel's pace or power axis is cut into at most: three labels in a small panel. */
const PANEL_INTERVALS = 2

/** The height of a chart of this many panels: the plot's margins, the panels and the gaps between them. */
export function bestsChartHeight(panels: number): number {
  const gaps = Math.max(0, panels - 1)
  return (
    (PLOT_MARGIN.top + panels * PANEL_PX + gaps * GAP_PX + PLOT_BOTTOM_WITHOUT_X_TITLE) *
    geometryScale()
  )
}

/** The all-time best's label: its text, and where it sits and which way it runs from there so it stays in the plot. */
export interface BestLabel {
  text: string
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
}

export interface PanelLayout {
  /** The panel's plotting area, whose top is where its name sits above it. */
  box: PlotBox
  yTicks: AxisTick[]
  /** One point for each year of the axis, null where the year has no best. */
  points: (Point | null)[]
  label: BestLabel | null
}

export interface BestsLayout {
  /** The x of each year's room, shared by every panel. */
  xs: number[]
  xTicks: AxisTick[]
  panels: PanelLayout[]
}

/** The anchor that keeps a label of this width, centred on x, inside the plot's left and right edges. */
function anchorWithin(x: number, width: number, plot: PlotBox): BestLabel['anchor'] {
  if (x - width / 2 < plot.left) return 'start'
  return x + width / 2 > plot.right ? 'end' : 'middle'
}

/**
 * The panels one above the other on one run of years: each year has an equal room whose middle is its x in every panel, and
 * each panel has its own axis fitted to its own values, faster or higher up. Null without panels.
 */
export function bestsLayout(model: BestsModel, size: ChartSize): BestsLayout | null {
  const count = model.panels.length
  if (count === 0) return null
  const { plot, width } = size
  const scale = geometryScale()
  const gap = GAP_PX * scale
  const panelH = (plot.bottom - plot.top - gap * (count - 1)) / count
  const room = (plot.right - plot.left) / model.years.length
  const xs = model.years.map((_, i) => plot.left + room * (i + 0.5))
  const fontSize = axisFontSize(width)
  const textScale = rootScale()
  const panels = model.panels.map((panel, p): PanelLayout => {
    const top = plot.top + p * (panelH + gap)
    const box: PlotBox = { left: plot.left, right: plot.right, top, bottom: top + panelH }
    // The axis stops short of the panel's top, which keeps the label of the best.
    const inner: PlotBox = { ...box, top: top + LABEL_ROOM_PX * scale }
    const plotted = panel.marks.flatMap((mark) => (mark === null ? [] : [mark.plotted]))
    const { y, ticks } = fittedYAxis(model.sport, plotted, inner, PANEL_INTERVALS)
    const points = panel.marks.map((mark, i) =>
      mark === null ? null : { x: xs[i]!, y: y(mark.plotted) },
    )
    const best = points[panel.best] ?? null
    const text = panel.marks[panel.best]?.text
    const label =
      best === null || text === undefined
        ? null
        : {
            text,
            x: best.x,
            y: best.y - LABEL_LIFT_PX,
            anchor: anchorWithin(best.x, labelWidth(text, fontSize, textScale), plot),
          }
    return { box, yTicks: fitTicks(ticks, { axis: 'y', width }), points, label }
  })
  return {
    xs,
    xTicks: fitTicks(
      model.years.map((year, i) => ({ position: xs[i]!, label: String(year) })),
      { axis: 'x', width },
    ),
    panels,
  }
}
