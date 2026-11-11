import type { PlotBox } from './chartTypes'
import { geometryScale } from './plotBox'
import { axisShare, stackMargin } from './timeSeriesModel'
import { NARROW_WIDTH } from './ticks'
import type { StackChannel } from './timeSeriesTypes'

/** A row's height in px for a weight of one: a phone's rows are shorter so the whole stack stays under a screen. */
const BASE_ROW_PX = { phone: 56, wide: 88 }
/** The air between two rows, which holds the lower row's name, so each row reads as a chart of its own. */
export const ROW_GAP_PX = 30
/** The room above the first row, for its name. */
const TOP_PX = 20
/** The room under the rows for the time labels. */
const AXIS_PX = 26

export interface StackLayout {
  height: number
  /** The box the cursor reads: every row. */
  plot: PlotBox
  rows: { top: number; bottom: number }[]
}

/**
 * Where each row sits for a stack this wide, with real pixels per second and per unit: nothing is stretched.
 * The rows, the gaps and the time axis are laid out for a 16 px root and grow with the reader's text size, so the
 * value ticks and the labels above the rows keep their room.
 */
export function layoutOf(width: number, channels: readonly StackChannel[]): StackLayout {
  const phone = width < NARROW_WIDTH
  const scale = geometryScale()
  const margin = stackMargin(scale)
  const base = (phone ? BASE_ROW_PX.phone : BASE_ROW_PX.wide) * scale
  const gap = ROW_GAP_PX * scale
  const first = TOP_PX * scale
  let top = first
  const rows = channels.map((channel) => {
    const height = Math.round(base * channel.weight)
    const row = { top, bottom: top + height }
    top = row.bottom + gap
    return row
  })
  const bottom = rows.at(-1)?.bottom ?? first
  return {
    height: bottom + AXIS_PX * scale,
    plot: {
      left: margin.left,
      right: Math.max(margin.left + 1, width - margin.right),
      top: first,
      bottom,
    },
    rows,
  }
}

/** A reading's pixel row, clamped to it so one past the axis sits on its edge. */
export function valueMap(channel: StackChannel, row: { top: number; bottom: number }) {
  return (value: number) =>
    row.bottom - axisShare(channel.scale, channel.low, channel.high, value) * (row.bottom - row.top)
}
