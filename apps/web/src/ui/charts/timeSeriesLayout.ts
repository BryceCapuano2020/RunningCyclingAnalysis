import type { PlotBox } from './chartTypes'
import { STACK_MARGIN } from './timeSeriesModel'
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

export interface StackLayout {
  height: number
  /** The box the cursor reads: every row and the lane. */
  plot: PlotBox
  rows: { top: number; bottom: number }[]
  laneTop: number
  laneBottom: number
}

/** Where each row sits for a stack this wide, with real pixels per second and per unit: nothing is stretched. */
export function layoutOf(width: number, channels: readonly StackChannel[]): StackLayout {
  const base = width < NARROW_WIDTH ? BASE_ROW_PX.phone : BASE_ROW_PX.wide
  let top = TOP_PX
  const rows = channels.map((channel) => {
    const height = Math.round(base * channel.weight)
    const row = { top, bottom: top + height }
    top = row.bottom + ROW_GAP_PX
    return row
  })
  const laneTop = (rows.at(-1)?.bottom ?? TOP_PX) + LANE_GAP_PX
  const laneBottom = laneTop + LANE_PX
  return {
    height: laneBottom + AXIS_PX,
    plot: {
      left: STACK_MARGIN.left,
      right: Math.max(STACK_MARGIN.left + 1, width - STACK_MARGIN.right),
      top: TOP_PX,
      bottom: laneBottom,
    },
    rows,
    laneTop,
    laneBottom,
  }
}

/** A reading's pixel row, clamped to it so one past the axis sits on its edge. */
export function valueMap(channel: StackChannel, row: { top: number; bottom: number }) {
  const span = channel.high - channel.low || 1
  return (value: number) => {
    const share = Math.min(1, Math.max(0, (value - channel.low) / span))
    return row.bottom - share * (row.bottom - row.top)
  }
}
