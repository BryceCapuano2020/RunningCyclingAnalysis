import type { PlotBox } from './chartTypes'
import { geometryScale } from './plotBox'
import { axisShare, stackMargin } from './timeSeriesModel'
import { NARROW_WIDTH } from './ticks'
import type { StackChannel } from './timeSeriesTypes'

/** A row's height in px for a weight of one: a phone's rows are shorter so the whole stack stays under a screen. */
const BASE_ROW_PX = { phone: 56, wide: 96 }
/** The air between two rows, where the lower one's top label and the upper one's lowest tick sit. */
export const ROW_GAP_PX = 10
/** The room above the first row. */
const TOP_PX = 6
/** The strip under the rows that holds the pauses and gaps. */
export const LANE_PX = 8
const LANE_GAP_PX = 6
/** The room under the lane for the time labels. */
const AXIS_PX = 26

/** On a phone the gap above each row is deep enough to hold the row's name, and the first row has room for its own. */
const LABEL_GAP_PX = 18
const LABEL_TOP_PX = 14

export interface StackLayout {
  height: number
  /** Whether each row's name sits in the gap above it (a phone's rows are too short for it over the line). */
  labelAbove: boolean
  /** The box the cursor reads: every row and the lane. */
  plot: PlotBox
  rows: { top: number; bottom: number }[]
  laneTop: number
  laneBottom: number
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
  const gap = (phone ? LABEL_GAP_PX : ROW_GAP_PX) * scale
  const first = (phone ? LABEL_TOP_PX : TOP_PX) * scale
  let top = first
  const rows = channels.map((channel) => {
    const height = Math.round(base * channel.weight)
    const row = { top, bottom: top + height }
    top = row.bottom + gap
    return row
  })
  const laneTop = (rows.at(-1)?.bottom ?? TOP_PX * scale) + LANE_GAP_PX * scale
  const laneBottom = laneTop + LANE_PX * scale
  return {
    height: laneBottom + AXIS_PX * scale,
    labelAbove: phone,
    plot: {
      left: margin.left,
      right: Math.max(margin.left + 1, width - margin.right),
      top: first,
      bottom: laneBottom,
    },
    rows,
    laneTop,
    laneBottom,
  }
}

/** A reading's pixel row, clamped to it so one past the axis sits on its edge. */
export function valueMap(channel: StackChannel, row: { top: number; bottom: number }) {
  return (value: number) =>
    row.bottom - axisShare(channel.scale, channel.low, channel.high, value) * (row.bottom - row.top)
}
