import { LEVEL_BANDS } from '../grades'

/** The slice of the grade scale the level scale draws, in whole percent. */
export interface Axis {
  min: number
  max: number
}

/** The narrowest axis, in points: wide enough to show the level a mark sits in and the next one up. */
const MIN_SPAN = 40
/** The axis moves in tens, so its ends sit on the percentages the levels start at. */
const STEP = 10
const SCALE_TOP = 100

/**
 * The axis that holds every mark with room to read it: a whole number of tens that starts one step below
 * the lowest mark and ends at the next level above the highest. It is never narrower than MIN_SPAN, and
 * never past 0 or 100%. The grade scale runs to 100, but a mark at 60% has no use for the width above 90.
 */
export function fitAxis(percents: readonly number[]): Axis {
  const lowest = Math.min(...percents)
  const highest = Math.max(...percents)
  let min = Math.max(0, Math.floor(lowest / STEP) * STEP - STEP)
  let max = Math.min(SCALE_TOP, Math.floor(highest / STEP) * STEP + 2 * STEP)
  while (max - min < MIN_SPAN) {
    // Widen below first, as the marks crowd the top of the scale; at 0 there is only above to go.
    if (min > 0) min -= STEP
    else max += STEP
  }
  return { min, max }
}

/** A level band clipped to an axis: its name, its place among the five, and the percentages it covers. */
export interface BandSpan {
  name: string
  /** 1 for Recreational, up to 5 for World: the number of the level token that paints it. */
  level: number
  from: number
  to: number
}

/** The bands an axis shows, lowest first, each clipped to the axis. A band wholly off the axis is left out. */
export function bandsIn(axis: Axis): BandSpan[] {
  return LEVEL_BANDS.flatMap((band, index) => {
    const lower = Math.round(band.min * 100)
    const upper = Math.round((LEVEL_BANDS[index + 1]?.min ?? SCALE_TOP / 100) * 100)
    const from = Math.max(lower, axis.min)
    const to = Math.min(upper, axis.max)
    return from < to ? [{ name: band.name, level: index + 1, from, to }] : []
  })
}

/** The percentages labelled along the axis: every ten it spans, ends included. */
export function ticksIn(axis: Axis): number[] {
  const ticks: number[] = []
  for (let value = axis.min; value <= axis.max; value += STEP) ticks.push(value)
  return ticks
}

/** A percentage's x position along a plot, from its left edge (the axis minimum) to its right (the maximum). */
export function xAt(axis: Axis, left: number, width: number, percent: number): number {
  return left + ((percent - axis.min) / (axis.max - axis.min)) * width
}
