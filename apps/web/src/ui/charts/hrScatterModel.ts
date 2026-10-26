import { formatCount } from '../format/count'
import type { HrCrossCheck, HrPoint, LinearFit, Sport } from '@rca/core/types'
import { formatWkg } from '@rca/core/units'
import { SPORT_LABEL, SPORT_NOUN } from '../sports'
import type { AxisTick, ChartSize, Point, TooltipContent } from './chartTypes'
import { linearScale, niceDomain, tickDecimals } from './scale'
import { fitTicks } from './ticks'

/** What the HR scatter chart draws and says, as plain data: its blocks, layout, notes and table. */
/** The empty state. With the rides held, only running is in question, so it names running alone. */
export function emptyTextFor(includeRides: boolean): string {
  const subject = includeRides ? 'per sport' : 'of running'
  return `Not enough steady heart-rate data yet. It takes roughly 8 five-minute blocks ${subject} across a range of efforts`
}

/** Most dots drawn at once. Longer libraries keep every block in the table view and the summary. */
export const MAX_DOTS = 2000

export interface SportData {
  sport: Sport
  points: HrPoint[]
  fit: LinearFit
}

export interface Dot extends Point {
  sport: Sport
  metabolicWkg: number
  bpm: number
}

export interface FitLine {
  sport: Sport
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Layout {
  dots: Dot[]
  fits: FitLine[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

export interface Block {
  sport: Sport
  point: HrPoint
}

export interface Plotted {
  /** The blocks drawn as dots, in data order. */
  blocks: Block[]
  /** Every block in the data, whether or not it is drawn. */
  total: number
}

export function sportsOf(hr: HrCrossCheck, includeRides: boolean): SportData[] {
  const sports: SportData[] = []
  if (hr.run) sports.push({ sport: 'run', points: hr.run.points, fit: hr.run.fit })
  if (hr.ride && includeRides)
    sports.push({ sport: 'ride', points: hr.ride.points, fit: hr.ride.fit })
  return sports
}

/**
 * What the chart says about the data it draws. Both sports drawn: their slopes. One sport drawn while
 * the other has no data: a note naming it. One sport drawn while the other is held back: no note, as
 * the page says why it is held.
 */
export function noteFor(hr: HrCrossCheck, drawn: readonly Sport[]): string | undefined {
  if (drawn.length === 2 && hr.run && hr.ride) {
    return `Slopes: ${SPORT_NOUN.run} ${hr.run.fit.slope.toFixed(1)} and ${SPORT_NOUN.ride} ${hr.ride.fit.slope.toFixed(1)} bpm per W/kg`
  }
  const first = drawn[0]
  if (first === undefined) return undefined
  const missing = (['run', 'ride'] as const).find((sport) => hr[sport] === null)
  if (missing === undefined) return undefined
  return `Not enough steady heart-rate data for ${SPORT_NOUN[missing]} yet, so only ${SPORT_NOUN[first]} is shown.`
}

/** The description of what is drawn, for a screen reader: both sports, or the one that is drawn. */
export function descriptionFor(drawn: readonly Sport[]): string {
  const [only] = drawn
  if (drawn.length === 1 && only !== undefined) {
    return `Average heart rate against energy rate for each block of steady ${SPORT_NOUN[only]} effort, with a fitted line.`
  }
  return 'Average heart rate against energy rate for each block of steady effort, with a fitted line for each sport.'
}

/** Indices of the blocks with the lowest and highest power and the lowest and highest heart rate. */
export function extremeIndices(blocks: Block[]): number[] {
  const found = new Set<number>()
  const axes: ((point: HrPoint) => number)[] = [
    (point) => point.metabolicPower,
    (point) => point.heartRate,
  ]
  for (const axis of axes) {
    const values = blocks.map((block) => axis(block.point))
    found.add(values.indexOf(Math.min(...values)))
    found.add(values.indexOf(Math.max(...values)))
  }
  return [...found]
}

/**
 * Keeps at most MAX_DOTS blocks. They are spaced evenly through the data, so the first and last
 * are always kept, and the blocks at each axis extreme are added too: each replaces the spaced block
 * nearest to it, which keeps the cap. The choice depends only on the data, so the same file always
 * draws the same dots.
 */
export function plotted(sports: SportData[]): Plotted {
  const blocks = sports.flatMap(({ sport, points }) => points.map((point) => ({ sport, point })))
  const total = blocks.length
  if (total <= MAX_DOTS) return { blocks, total }

  const indices = new Set(
    Array.from({ length: MAX_DOTS }, (_, i) => Math.round((i * (total - 1)) / (MAX_DOTS - 1))),
  )
  const extremes = extremeIndices(blocks)
  const protectedIndices = new Set([0, total - 1, ...extremes])
  for (const extreme of extremes) {
    if (indices.has(extreme)) continue
    let nearest: number | null = null
    for (const index of indices) {
      if (protectedIndices.has(index)) continue
      if (nearest === null || Math.abs(index - extreme) < Math.abs(nearest - extreme)) {
        nearest = index
      }
    }
    if (nearest !== null) indices.delete(nearest)
    indices.add(extreme)
  }

  return {
    blocks: [...indices]
      .sort((a, b) => a - b)
      .map((index) => blocks[index])
      .filter((block): block is Block => block !== undefined),
    total,
  }
}

export function layout(sports: SportData[], blocks: Block[], size: ChartSize): Layout | null {
  const all = sports.flatMap((data) => data.points)
  if (all.length === 0) return null
  const { plot, width } = size
  const xDomain = niceDomain(
    all.map((point) => point.metabolicPower),
    4,
  )
  const yDomain = niceDomain(
    all.map((point) => point.heartRate),
    4,
  )
  const x = linearScale(xDomain.domain, [plot.left, plot.right])
  const y = linearScale(yDomain.domain, [plot.bottom, plot.top])

  const dots = blocks
    .map(({ sport, point }): Dot => ({
      sport,
      x: x(point.metabolicPower),
      y: y(point.heartRate),
      metabolicWkg: point.metabolicPower,
      bpm: point.heartRate,
    }))
    .sort((a, b) => a.x - b.x)

  // Each fitted line runs across the range of its own sport's data.
  const fits = sports.map(({ sport, points, fit }): FitLine => {
    const xs = points.map((point) => point.metabolicPower)
    const low = Math.min(...xs)
    const high = Math.max(...xs)
    return {
      sport,
      x1: x(low),
      y1: y(fit.intercept + fit.slope * low),
      x2: x(high),
      y2: y(fit.intercept + fit.slope * high),
    }
  })

  return {
    dots,
    fits,
    xTicks: fitTicks(
      xDomain.ticks.map((value) => ({
        position: x(value),
        label: value.toFixed(tickDecimals(xDomain.ticks)),
      })),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      yDomain.ticks.map((value) => ({
        position: y(value),
        label: value.toFixed(tickDecimals(yDomain.ticks)),
      })),
      { axis: 'y', width },
    ),
  }
}

/**
 * A layout function that recomputes only when the chart's size changes. The chart calls it several
 * times per render, and every pointer move re-renders it, so the dots are not re-sorted each time.
 */
export function layoutCache(
  sports: SportData[],
  blocks: Block[],
): (size: ChartSize) => Layout | null {
  let cachedKey: string | null = null
  let cached: Layout | null = null
  return (size) => {
    const { plot } = size
    const key = [size.width, size.height, plot.left, plot.right, plot.top, plot.bottom].join(',')
    if (key !== cachedKey) {
      cached = layout(sports, blocks, size)
      cachedKey = key
    }
    return cached
  }
}

export function thinningNote(total: number, drawn: number): string {
  return `To keep the chart responsive, ${formatCount(drawn)} of ${formatCount(total)} blocks are plotted, spaced evenly through your data.`
}

export function tooltipFor(dot: Dot): TooltipContent {
  return {
    x: dot.x,
    y: dot.y,
    title: SPORT_LABEL[dot.sport],
    rows: [
      { kind: dot.sport, value: formatWkg(dot.metabolicWkg), label: 'Energy rate' },
      { kind: dot.sport, value: `${Math.round(dot.bpm)} bpm`, label: 'Heart rate' },
    ],
  }
}
