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
/** The axis for no usable marks: the span a typical grade sits in, from Recreational to Regional. */
const DEFAULT_AXIS: Axis = { min: 40, max: 80 }

/**
 * The axis that holds every mark with room to read it: a whole number of tens that starts one step below
 * the lowest mark and ends at the next level above the highest. It is never narrower than MIN_SPAN, and
 * never below 0. The scale shows no more than 100% unless a mark or a range end is past it, so a mark at 60% has no
 * use for the width above 90, and a run graded at 132% still has its mark on the axis.
 */
export function fitAxis(percents: readonly number[]): Axis {
  const lowest = Math.min(...percents)
  const highest = Math.max(...percents)
  // No marks, or one that is not a number, has nothing to fit, and the widening below would never end on it.
  if (!Number.isFinite(lowest) || !Number.isFinite(highest)) return { ...DEFAULT_AXIS }
  let min = Math.max(0, Math.floor(lowest / STEP) * STEP - STEP)
  // A grade is not capped at 100%, so the axis runs on, in tens, as far as the highest mark or range end.
  const next = Math.floor(highest / STEP) * STEP
  let max = highest >= SCALE_TOP ? next + STEP : Math.min(SCALE_TOP, next + 2 * STEP)
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
    // The top band, World, runs on to the axis's end where a grade is past 100%.
    const upper = Math.round(
      (LEVEL_BANDS[index + 1]?.min ?? Math.max(SCALE_TOP, axis.max) / 100) * 100,
    )
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

/**
 * The levels the axis shows, each with the percentage it starts at, in plain words: "Recreational below 60%,
 * Local from 60%, Regional from 70%". The first level has no start of its own, so it is named by where the next begins.
 */
export function levelEdgesText(spans: readonly BandSpan[]): string {
  const percent = (index: number) => Math.round((LEVEL_BANDS[index]?.min ?? 0) * 100)
  return spans
    .map((span) =>
      span.level === 1
        ? `${span.name} below ${percent(1)}%`
        : `${span.name} from ${percent(span.level - 1)}%`,
    )
    .join(', ')
}
