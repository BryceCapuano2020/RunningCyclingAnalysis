import type { TrendPoint } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { nativeValue } from '../records'
import { SPORT_FORMAT } from '../sports'
import { markerRadii } from './chartInteraction'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { timeScale } from './timeScale'
import { trendDateTicks } from './trendTicks'
import { fitTicks } from './ticks'
import { fittedYAxis, plottedValue, usable } from './sportAxis'

/** One dated best: the effort that led some trailing window, in the sport's own number. */
export interface BestDot {
  atMs: number
  /** The sport's own number: a speed in m/s for running, watts for cycling. */
  value: number
  /** The mechanical W/kg of the ride, at the body mass of the day it was ridden; null for a sport that names none. */
  wkg: number | null
}

/** The effort that led a week's window, read from the trend point of a sport: when it was done, and its W/kg. */
const LEADER: Record<
  Sport,
  (point: TrendPoint) => { atMs: number | null; wkg: number | null; massKg?: number }
> = {
  run: (point) => ({ atMs: point.runAtMs, wkg: point.runWkg }),
  ride: (point) => ({ atMs: point.rideAtMs, wkg: point.rideWkg, massKg: point.rideMassKg }),
}

/**
 * The dated bests of a sport's weekly points: each effort that led some week's trailing window, once, on the day it was
 * done. A window's best repeats from week to week until a better effort or the window's end replaces it, so the
 * weeks themselves say how long a window is, not how fit the athlete was; the efforts say what was done and when.
 * Oldest first.
 */
export function bestDots(points: readonly TrendPoint[], sport: Sport, massKg: number): BestDot[] {
  const seen = new Set<number>()
  const dots: BestDot[] = []
  for (const point of points) {
    const { atMs, wkg, massKg: rideMassKg } = LEADER[sport](point)
    if (atMs === null || wkg === null || seen.has(atMs)) continue
    const value = usable(nativeValue(sport, wkg, rideMassKg ?? massKg))
    if (!Number.isFinite(value)) continue
    seen.add(atMs)
    dots.push({
      atMs,
      value,
      wkg: SPORT_FORMAT[sport].showsWkg ? value / (rideMassKg ?? massKg) : null,
    })
  }
  return dots.sort((a, b) => a.atMs - b.atMs)
}

/** The least opacity of the oldest dot: faded, never gone. */
export const OLDEST_OPACITY = 0.35

/** How opaque a dot is by its age: the newest is solid, the oldest OLDEST_OPACITY, evenly between by date. */
export function opacityOf(dots: readonly BestDot[]): number[] {
  const first = dots[0]?.atMs ?? 0
  const span = (dots.at(-1)?.atMs ?? 0) - first
  return dots.map((dot) =>
    span > 0 ? OLDEST_OPACITY + (1 - OLDEST_OPACITY) * ((dot.atMs - first) / span) : 1,
  )
}

export interface DotsLayout {
  xs: number[]
  ys: number[]
  opacities: number[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
  points: Point[]
}

/** The drawn layout of the dots at a chart size, on a y axis fitted to their own values. Null with fewer than two dots. */
export function dotsLayout(
  dots: readonly BestDot[],
  sport: Sport,
  units: UnitSystem,
  size: ChartSize,
): DotsLayout | null {
  const first = dots[0]
  const last = dots.at(-1)
  if (dots.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const { x } = timeScale({ startMs: first.atMs, endMs: last.atMs, gaps: [] }, [
    plot.left,
    plot.right,
  ])
  const plotted = dots.map((dot) => plottedValue(sport, dot.value, units))
  const { y, ticks } = fittedYAxis(sport, plotted, plot)
  const points = dots.map((dot, i) => ({ x: x(dot.atMs), y: y(plotted[i]!) }))
  return {
    xs: points.map((p) => p.x),
    ys: points.map((p) => p.y),
    opacities: opacityOf(dots),
    xTicks: trendDateTicks([first.atMs, last.atMs], x),
    yTicks: fitTicks(ticks, { axis: 'y', width }),
    points,
  }
}

/** The radius of a dot at a chart width. */
export const dotRadius = (width: number): number => markerRadii(width).marker
