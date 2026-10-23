import { useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { HrCrossCheck, HrPoint, LinearFit, Sport } from '@rca/core/types'
import { formatWkg } from '@rca/core/units'
import { keyByContent } from '../contentKeys'
import { SPORT_NOUN, SPORT_TITLE } from '../sports'
import { ChartFrame } from './ChartFrame'
import { ChartTooltip } from './ChartTooltip'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import type { AxisTick, ChartSize, Point, TooltipContent } from './chartTypes'
import { nearestByPoint, stepActive } from './hover'
import { PlotSurface } from './PlotSurface'
import { linearScale, niceDomain, tickDecimals } from './scale'
import { axisFontSize, fitTicks } from './ticks'
import './HrScatter.css'

export interface HrScatterProps {
  hr: HrCrossCheck
}

const EMPTY =
  'Not enough steady heart-rate data yet. It takes roughly 8 five-minute blocks per sport across a range of efforts'
const DOT_R = 4
const ACTIVE_DOT_R = 6
/** Pointer distance, in px, within which a dot counts as hovered. Wider than the dot. */
const HIT_RADIUS = 16
/** Most dots drawn at once. Longer libraries keep every block in the table view and the summary. */
const MAX_DOTS = 2000

interface SportData {
  sport: Sport
  points: HrPoint[]
  fit: LinearFit
}

interface Dot extends Point {
  sport: Sport
  metabolicWkg: number
  bpm: number
}

interface FitLine {
  sport: Sport
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Layout {
  dots: Dot[]
  fits: FitLine[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

interface Block {
  sport: Sport
  point: HrPoint
}

interface Plotted {
  /** The blocks drawn as dots, in data order. */
  blocks: Block[]
  /** Every block in the data, whether or not it is drawn. */
  total: number
}

function sportsOf(hr: HrCrossCheck): SportData[] {
  const sports: SportData[] = []
  if (hr.run) sports.push({ sport: 'run', points: hr.run.points, fit: hr.run.fit })
  if (hr.ride) sports.push({ sport: 'ride', points: hr.ride.points, fit: hr.ride.fit })
  return sports
}

/** Slope note when both sports are present; otherwise a note naming the missing sport. */
function noteFor(hr: HrCrossCheck): string | undefined {
  if (hr.run && hr.ride) {
    return `Slopes: ${SPORT_NOUN.run} ${hr.run.fit.slope.toFixed(1)} and ${SPORT_NOUN.ride} ${hr.ride.fit.slope.toFixed(1)} bpm per W/kg`
  }
  if (hr.run === null && hr.ride === null) return undefined
  const missing: Sport = hr.run === null ? 'run' : 'ride'
  const shown: Sport = missing === 'run' ? 'ride' : 'run'
  return `Not enough steady heart-rate data for ${SPORT_NOUN[missing]} yet, so only ${SPORT_NOUN[shown]} is shown.`
}

/** Indices of the blocks with the lowest and highest power and the lowest and highest heart rate. */
function extremeIndices(blocks: Block[]): number[] {
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
function plotted(sports: SportData[]): Plotted {
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

function layout(sports: SportData[], blocks: Block[], size: ChartSize): Layout | null {
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
function layoutCache(sports: SportData[], blocks: Block[]): (size: ChartSize) => Layout | null {
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

function thinningNote(total: number, drawn: number): string {
  return `To keep the chart responsive, ${drawn.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} blocks are plotted, spaced evenly through your data.`
}

function tooltipFor(dot: Dot): TooltipContent {
  return {
    x: dot.x,
    y: dot.y,
    title: SPORT_TITLE[dot.sport],
    rows: [
      { kind: dot.sport, value: formatWkg(dot.metabolicWkg), label: 'Energy rate' },
      { kind: dot.sport, value: `${Math.round(dot.bpm)} bpm`, label: 'Heart rate' },
    ],
  }
}

function surfaceOf(
  size: ChartSize,
  layoutFor: (size: ChartSize) => Layout | null,
  active: number | null,
  setActive: (index: number | null) => void,
): ReactNode {
  const m = layoutFor(size)
  if (m === null) return null
  return (
    <PlotSurface
      size={size}
      onPoint={(point) =>
        setActive(point === null ? null : nearestByPoint(m.dots, point, HIT_RADIUS))
      }
      onKey={(key) => {
        const next = stepActive(active, m.dots.length, key)
        if (next) setActive(next.index)
      }}
      onBlur={() => setActive(null)}
    />
  )
}

function overlayOf(
  size: ChartSize,
  layoutFor: (size: ChartSize) => Layout | null,
  active: number | null,
): ReactNode {
  const m = layoutFor(size)
  const dot = m && active !== null ? m.dots[active] : undefined
  return (
    <ChartTooltip
      bounds={{ width: size.width, height: size.height }}
      content={dot ? tooltipFor(dot) : null}
      id={size.tooltipId}
    />
  )
}

export function HrScatter({ hr }: HrScatterProps) {
  const sports = useMemo(() => sportsOf(hr), [hr])
  const blocks = useMemo(() => plotted(sports), [sports])
  const layoutFor = useMemo(() => layoutCache(sports, blocks.blocks), [sports, blocks])
  const clipId = `hr-scatter-clip-${useId().replace(/:/g, '')}`
  const [active, setActive] = useState<number | null>(null)

  const thinned = blocks.blocks.length < blocks.total
  const note = [noteFor(hr), thinned ? thinningNote(blocks.total, blocks.blocks.length) : null]
    .filter((line): line is string => line !== null)
    .join(' ')

  return (
    <ChartFrame
      title="Heart rate against energy rate"
      description="Average heart rate against energy rate for each block of steady effort, with a fitted line for each sport."
      legend={sports.map((data) => ({ label: SPORT_TITLE[data.sport], kind: data.sport }))}
      summary={{
        caption: 'Summary by sport',
        columns: ['Sport', 'Blocks', 'Slope (bpm per W/kg)', 'R squared'],
        rows: sports.map((data) => [
          SPORT_TITLE[data.sport],
          String(data.points.length),
          data.fit.slope.toFixed(1),
          data.fit.r2.toFixed(2),
        ]),
      }}
      table={{
        caption: 'Plotted blocks',
        columns: ['Sport', 'Energy rate (W/kg)', 'Heart rate (bpm)'],
        rows: blocks.blocks.map(({ sport, point }) => [
          SPORT_TITLE[sport],
          point.metabolicPower.toFixed(1),
          String(Math.round(point.heartRate)),
        ]),
      }}
      empty={sports.length > 0 ? undefined : EMPTY}
      note={note === '' ? undefined : note}
      overlay={(size) => overlayOf(size, layoutFor, active)}
      surface={(size) => surfaceOf(size, layoutFor, active, setActive)}
    >
      {(size) => {
        const m = layoutFor(size)
        if (m === null) return null
        const { plot } = size
        const fontSize = axisFontSize(size.width)
        return (
          <>
            <ChartXAxis
              ticks={m.xTicks}
              plot={plot}
              title="Energy rate (W/kg)"
              fontSize={fontSize}
            />
            <ChartYAxis ticks={m.yTicks} plot={plot} title="Heart rate (bpm)" fontSize={fontSize} />
            <clipPath id={clipId}>
              <rect
                x={plot.left}
                y={plot.top}
                width={plot.right - plot.left}
                height={plot.bottom - plot.top}
              />
            </clipPath>
            <g clipPath={`url(#${clipId})`}>
              {m.fits.map((fit) => (
                <line
                  key={fit.sport}
                  data-testid="hr-fit"
                  className={`hr-scatter__fit hr-scatter__fit--${fit.sport}`}
                  x1={fit.x1}
                  y1={fit.y1}
                  x2={fit.x2}
                  y2={fit.y2}
                />
              ))}
              {keyByContent(m.dots, (dot) => `${dot.sport}:${dot.bpm}:${dot.metabolicWkg}`).map(
                ({ key, item: dot, index: i }) => (
                  <circle
                    key={key}
                    data-testid="hr-dot"
                    data-sport={dot.sport}
                    className={`hr-scatter__dot hr-scatter__dot--${dot.sport}`}
                    cx={dot.x}
                    cy={dot.y}
                    r={i === active ? ACTIVE_DOT_R : DOT_R}
                  />
                ),
              )}
            </g>
          </>
        )
      }}
    </ChartFrame>
  )
}
