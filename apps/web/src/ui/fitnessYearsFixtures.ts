import { WEEK_ORIGIN_MS } from '@rca/core/calendar'
import { DAY_MS } from '@rca/core/constants'
import type { DotsSpan, DotsYear, FitnessDots } from '@rca/core/history'
import type { Sport } from '@rca/core/types'

/** What a step is worth, and where a synthetic sport's level sits: 3.2 m/s (5:12 a kilometre) for a run, 200 W for a ride. */
const SHAPE: Record<Sport, { step: number; base: number }> = {
  run: { step: 0.01, base: 320 },
  ride: { step: 1, base: 200 },
}

const startOf = (year: number): number => (Date.UTC(year, 0, 1) - WEEK_ORIGIN_MS) / DAY_MS
const middle = (sorted: number[], q: number): number => sorted[Math.floor((sorted.length - 1) * q)]!

export interface DotsOptions {
  sport?: Sport
  /** The calendar years with dots: one for each, `perYear` spread through it. A year left out between two is a gap. */
  years: number[]
  perYear?: number
  spans?: DotsSpan[]
  /** The dots' level (in steps) at a day count, to draw a shape. A gentle wave by default. */
  level?: (index: number) => number
}

/** The fitness dots of a synthetic library, built the way the core builds them, for the chart's tests. */
export function dotsFixture({
  sport = 'run',
  years,
  perYear = 40,
  spans = [],
  level,
}: DotsOptions): FitnessDots {
  const { step, base } = SHAPE[sport]
  const days = years.flatMap((year) =>
    Array.from({ length: perYear }, (_, k) => Math.floor(startOf(year) + 5 + (k * 355) / perYear)),
  )
  const wave = (n: number) => base + Math.round(10 * Math.sin(n / 9))
  const levels = days.map((_day, i) => (level ?? wave)(i))
  const knots = Math.floor((days.at(-1)! - days[0]!) / 28) + 1
  const line = Array.from({ length: knots }, (_, k) => {
    const at = days[0]! + k * 28
    const near = levels.filter((_level, i) => Math.abs(days[i]! - at) <= 42).sort((a, b) => a - b)
    return near.length < 4 ? null : middle(near, 0.5)
  })
  const rows = Array.from({ length: years.at(-1)! - years[0]! + 1 }, (_, i): DotsYear => {
    const year = years[0]! + i
    const own = levels.filter(
      (_level, j) => days[j]! >= startOf(year) && days[j]! < startOf(year + 1),
    )
    own.sort((a, b) => a - b)
    return own.length === 0
      ? { year, n: 0, median: 0, low: 0, high: 0 }
      : {
          year,
          n: own.length,
          median: middle(own, 0.5),
          low: middle(own, 0.1),
          high: middle(own, 0.9),
        }
  })
  return {
    referenceHr: 142,
    step,
    firstDay: days[0]!,
    gaps: days.map((day, i) => (i === 0 ? 0 : day - days[i - 1]!)),
    levels,
    line,
    years: rows,
    spans,
    horizonDay: days.at(-1)!,
  }
}

/** A slip from March to October of `year`, and a rise that began in the January after. */
export const slipAndRise = (year: number): DotsSpan[] => [
  { kind: 'slip', fromDay: startOf(year) + 60, toDay: startOf(year) + 280 },
  { kind: 'rise', fromDay: startOf(year + 1) + 10, toDay: startOf(year + 1) + 120 },
]

/** A slip that began in `year` and lasts to the horizon. */
export const openSlip = (year: number): DotsSpan[] => [
  { kind: 'slip', fromDay: startOf(year) + 90, toDay: null },
]
