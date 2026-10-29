import { meetsBoxes } from './chartBoxes'
import type { Box } from './chartBoxes'
import type { PlotBox } from './chartTypes'
import type { AxisTick, Point } from './chartTypes'
import { smallWidth } from './annotationTypes'
import { DEFAULT_ROOT_PX } from './rootFont'

/** What a direct label has to keep clear of: the data's marks as boxes, in the plot, at this root font size. */
export interface LabelSpace {
  plot: PlotBox
  obstacles: readonly Box[]
  rootPx: number
}

/** The label's display text is 1.125 rem in capitals with tracking: about this many ems a glyph. */
const MAIN_GLYPH_EM = 0.65
const MAIN_REM = 1.125
/** The range line under (or over) it is a 0.75 rem line set 1.35 em from the main line's baseline. */
const RANGE_RISE_REM = 1.35 * 0.75
const GAP = 2
/** How far, px, a label may stand off the place it was first set, nearest first. */
const LABEL_AWAY = [0, 6, 12]
/** A label may rise this far above the plot's top edge, into the margin the axis title shares. */
const ABOVE_PLOT = 10

/** A direct label's text, set at an anchor point, as the box its ink takes. */
export interface LabelShape {
  x: number
  y: number
  anchor: 'start' | 'end'
  text: string
  range: string | null
  below: boolean
}

/** The box a label takes, the range line included. */
export function labelBox(label: LabelShape, rootPx: number): Box {
  const scale = rootPx / DEFAULT_ROOT_PX
  const mainPx = MAIN_REM * DEFAULT_ROOT_PX * scale
  const mainWidth = label.text.length * MAIN_GLYPH_EM * mainPx
  const rangeWidth = label.range === null ? 0 : smallWidth(label.range, rootPx)
  const width = Math.max(mainWidth, rangeWidth)
  const left = label.anchor === 'start' ? label.x : label.x - width
  const rise = RANGE_RISE_REM * DEFAULT_ROOT_PX * scale
  const top = label.y - mainPx * 0.8 - (label.range !== null && !label.below ? rise + 10 : 0)
  const bottom = label.y + 4 + (label.range !== null && label.below ? rise + 3 : 0)
  return { left, right: left + width, top, bottom }
}

function changed(label: LabelShape, patch: Partial<LabelShape>): LabelShape {
  return { ...label, ...patch }
}

/** The boxes a phone's y tick labels take, set inside the plot above their gridlines (see ChartYAxis). */
export function insideTickBoxes(
  ticks: readonly AxisTick[],
  plot: PlotBox,
  rootPx: number,
  gutterPx = INSIDE_TICK_GUTTER_PX,
): Box[] {
  if (plot.left >= gutterPx) return []
  const scale = rootPx / DEFAULT_ROOT_PX
  const em = 12 * scale
  return ticks.map((tick) => {
    const width = smallWidth(tick.label, rootPx)
    const baseline = tick.position - 5
    return {
      left: plot.left + 4,
      right: plot.left + 4 + width,
      top: baseline - em,
      bottom: baseline + 3,
    }
  })
}

/** The ride band as boxes, one stretch between each pair of neighbouring durations where both have both ends. */
export function bandBoxes(
  xs: readonly number[],
  upper: readonly (Point | null)[],
  lower: readonly (Point | null)[],
): Box[] {
  return xs.flatMap((left, i) => {
    const right = xs[i + 1]
    const high = upper[i] ?? null
    const low = lower[i] ?? null
    const nextHigh = upper[i + 1] ?? null
    const nextLow = lower[i + 1] ?? null
    if (right === undefined || !high || !low || !nextHigh || !nextLow) return []
    return [
      {
        left,
        right,
        top: Math.min(high.y, nextHigh.y),
        bottom: Math.max(low.y, nextLow.y),
      },
    ]
  })
}

/** A y gutter narrower than this, px, is too small for its tick labels, so they sit inside the plot. */
export const INSIDE_TICK_GUTTER_PX = 48

/** Whether a label sits in the plot and keeps off the data and the labels placed before it. */
function clear(label: LabelShape, space: LabelSpace, placed: readonly Box[]): boolean {
  const box = labelBox(label, space.rootPx)
  const { plot } = space
  return (
    box.left >= plot.left &&
    box.right <= plot.right &&
    box.top >= plot.top - ABOVE_PLOT &&
    box.bottom <= plot.bottom &&
    !meetsBoxes(box, space.obstacles, GAP) &&
    !meetsBoxes(box, placed, GAP)
  )
}

/**
 * Where a label can go: as it was first set, then turned to the other side of its point (`mirror` is that
 * placement), each with its range line and then without it. A label with no clear place is left out, since the
 * readout and the table carry the value, and a label over the line or its band is worse than none.
 */
export function fitLabel(
  label: LabelShape,
  mirror: Pick<LabelShape, 'x' | 'anchor'>,
  space: LabelSpace,
  placed: readonly Box[],
): LabelShape | null {
  const turned = { ...label, ...mirror }
  // Each placement is tried at its own height and then a little further from its point, clear of a flat line.
  const away = (option: LabelShape): LabelShape[] =>
    LABEL_AWAY.map((rise) => changed(option, { y: option.y + (option.below ? rise : -rise) }))
  const options = [label, turned].flatMap(away)
  const withoutRange = options.map((option) => changed(option, { range: null }))
  const choices = label.range === null ? options : [...options, ...withoutRange]
  return choices.find((choice) => clear(choice, space, placed)) ?? null
}

/** The box a placed label takes, for the labels after it to keep off. */
export function placedBox(label: LabelShape, rootPx: number): Box {
  return labelBox(label, rootPx)
}
