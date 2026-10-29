import { axisPosition } from './timeSeriesModel'
import type { PixelMap } from './timeSeriesModel'
import type { StackChannel } from './timeSeriesTypes'

/**
 * A reading is marked as past the axis only where it is well past: by more than this share of the axis's
 * span. A reading just over the edge is clipped without a mark, so the edge is not a row of ticks.
 */
export const CLIP_SHARE = 0.15
/** Ticks on a row's edge are one to a bucket this wide, in px, however many columns clip in it. */
const BUCKET_PX = 8
const TICK_PX = 5
const TICK_HEIGHT_PX = 3

/** Which columns reach well past the axis at the top and at the bottom. */
export function clippedColumns(channel: StackChannel): { top: boolean[]; bottom: boolean[] } {
  // Read as the axis is drawn, so a pace's margin is a share of its height in pace and not in speed.
  const at = (value: number) => axisPosition(channel.scale, channel.low, channel.high, value)
  return {
    top: channel.columns.hi.map((value) => at(value) > 1 + CLIP_SHARE),
    bottom: channel.columns.lo.map((value) => at(value) < -CLIP_SHARE),
  }
}

/** Whether any reading in the window is marked as past the axis, so the key says what the ticks are. */
export function hasClips(channel: StackChannel): boolean {
  const { top, bottom } = clippedColumns(channel)
  return top.includes(true) || bottom.includes(true)
}

/**
 * A short tick on a row's top or bottom edge for each stretch where the raw readings went well past the axis,
 * so a spike the axis leaves out is seen where it happened. Columns within one bucket share a tick.
 */
export function edgeTicks(
  channel: StackChannel,
  row: { top: number; bottom: number },
  x: PixelMap['x'],
): string {
  const { top, bottom } = clippedColumns(channel)
  const ticks: string[] = []
  for (const [edge, past] of [
    ['top', top],
    ['bottom', bottom],
  ] as const) {
    const buckets = new Set<number>()
    channel.columns.x.forEach((t, i) => {
      if (past[i]) buckets.add(Math.floor(x(t) / BUCKET_PX))
    })
    for (const bucket of buckets) {
      const left = bucket * BUCKET_PX + (BUCKET_PX - TICK_PX) / 2
      const [near, far] =
        edge === 'top'
          ? [row.top, row.top + TICK_HEIGHT_PX]
          : [row.bottom, row.bottom - TICK_HEIGHT_PX]
      ticks.push(
        `M ${left} ${near} L ${left + TICK_PX} ${near} L ${left + TICK_PX} ${far} L ${left} ${far} Z`,
      )
    }
  }
  return ticks.join(' ')
}

/**
 * How strong a band is drawn: full where a column is a second or two, so a close view shows nearly each reading,
 * and about half where a column spans twenty seconds or more, so an overview's spread is quiet behind its trend.
 */
export function bandOpacity(secondsPerColumn: number): number {
  const share = Math.min(1, Math.max(0, (secondsPerColumn - 2) / 18))
  return 1 - 0.55 * share
}
