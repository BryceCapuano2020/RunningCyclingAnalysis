import { useState } from 'react'
import type { TrendPoint } from '@rca/core/digest'
import { weeksWithValue } from '@rca/core/digest/trendPoints'
import { formatWkg } from '@rca/core/units'
import { ChartFrame } from './ChartFrame'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { markerRadii, plotSurface, tooltipOverlay } from './chartInteraction'
import type { AxisTick, ChartSize, Point, TooltipContent } from './chartTypes'
import { linePath } from './paths'
import { linearScale, niceDomain, tickDecimals } from './scale'
import { axisFontSize, fitTicks } from './ticks'
import './TrendChart.css'

export interface TrendChartProps {
  points: TrendPoint[]
}

const LEGEND: ChartLegendEntry[] = [
  { label: 'Running', kind: 'run' },
  { label: 'Cycling', kind: 'ride' },
]

const TABLE_COLUMNS = ['Week ending', 'Running (W/kg)', 'Runs', 'Cycling (W/kg)', 'Rides']
const TABLE_CAPTION =
  'Each week ends on a Sunday, in UTC. Runs and rides count the activities with a value in the previous 6 weeks.'

const WEEK_DATE = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

interface Layout {
  /** Pixel x of each point, for hover. */
  xs: number[]
  runPoints: (Point | null)[]
  ridePoints: (Point | null)[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/** First instants of the calendar months, in UTC, that fall after fromMs and up to toMs. */
function monthStartsBetween(fromMs: number, toMs: number): number[] {
  const from = new Date(fromMs)
  const starts: number[] = []
  for (let month = from.getUTCMonth() + 1; ; month++) {
    const start = Date.UTC(from.getUTCFullYear(), month, 1)
    if (start > toMs) return starts
    starts.push(start)
  }
}

function layout(points: TrendPoint[], size: ChartSize): Layout | null {
  const first = points[0]
  const last = points.at(-1)
  if (points.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const x = linearScale([first.endMs, last.endMs], [plot.left, plot.right])
  const { domain, ticks } = niceDomain(
    points.flatMap((p) => [p.runWkg ?? NaN, p.rideWkg ?? NaN]),
    4,
  )
  const y = linearScale(domain, [plot.bottom, plot.top])
  return {
    xs: points.map((p) => x(p.endMs)),
    runPoints: points.map((p) => (p.runWkg === null ? null : { x: x(p.endMs), y: y(p.runWkg) })),
    ridePoints: points.map((p) => (p.rideWkg === null ? null : { x: x(p.endMs), y: y(p.rideWkg) })),
    xTicks: fitTicks(
      monthStartsBetween(first.endMs, last.endMs).map((ms) => ({
        position: x(ms),
        label: MONTH.format(ms),
      })),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      ticks.map((value) => ({ position: y(value), label: value.toFixed(tickDecimals(ticks)) })),
      { axis: 'y', width },
    ),
  }
}

function countNote(count: number, noun: string): string {
  if (count === 0) return `No ${noun}s in the previous 6 weeks`
  return `${count} ${count === 1 ? noun : `${noun}s`} in the previous 6 weeks`
}

function tableRow(point: TrendPoint): string[] {
  return [
    WEEK_DATE.format(point.endMs),
    formatWkg(point.runWkg ?? NaN),
    String(point.runCount),
    formatWkg(point.rideWkg ?? NaN),
    String(point.rideCount),
  ]
}

function tooltipFor(point: TrendPoint, x: number, y: number): TooltipContent {
  return {
    x,
    y,
    title: `Week ending ${WEEK_DATE.format(point.endMs)}`,
    rows: [
      {
        kind: 'run',
        label: 'Running',
        value: formatWkg(point.runWkg ?? NaN),
        note: countNote(point.runCount, 'run'),
      },
      {
        kind: 'ride',
        label: 'Cycling',
        value: formatWkg(point.rideWkg ?? NaN),
        note: countNote(point.rideCount, 'ride'),
      },
    ],
  }
}

function contentOf(
  size: ChartSize,
  points: TrendPoint[],
  active: number | null,
): TooltipContent | null {
  const m = layout(points, size)
  const point = active === null ? undefined : points[active]
  const anchorX = m && active !== null ? m.xs[active] : undefined
  return point && anchorX !== undefined
    ? tooltipFor(point, anchorX, (size.plot.top + size.plot.bottom) / 2)
    : null
}

export function TrendChart({ points }: TrendChartProps) {
  const hasData = weeksWithValue(points) >= 2
  const [active, setActive] = useState<number | null>(null)

  return (
    <ChartFrame
      title="Fitness over time"
      description="Best estimated energy rate in watts per kilogram over 20 minutes, for running and for cycling, at the end of each week. Each value is the best in the previous 6 weeks."
      legend={hasData ? LEGEND : undefined}
      table={{
        columns: TABLE_COLUMNS,
        rows: points.map(tableRow),
        caption: TABLE_CAPTION,
      }}
      empty={hasData ? undefined : 'Add runs and rides in more than one week to see a trend'}
      surface={(size) => plotSurface(size, layout(points, size)?.xs ?? null, active, setActive)}
      overlay={(size) => tooltipOverlay(size, contentOf(size, points, active))}
    >
      {(size) => {
        const m = layout(points, size)
        if (m === null) return null
        const { marker: markerR, active: activeR } = markerRadii(size.width)
        const activeX = active === null ? undefined : m.xs[active]
        return (
          <>
            <ChartXAxis
              ticks={m.xTicks}
              plot={size.plot}
              title="Week ending"
              fontSize={axisFontSize(size.width)}
            />
            <ChartYAxis
              ticks={m.yTicks}
              plot={size.plot}
              title="Energy rate (W/kg)"
              fontSize={axisFontSize(size.width)}
            />
            {activeX !== undefined ? (
              <line
                className="trend-chart__crosshair"
                x1={activeX}
                x2={activeX}
                y1={size.plot.top}
                y2={size.plot.bottom}
              />
            ) : null}
            <path
              data-testid="trend-line"
              data-series="run"
              className="trend-chart__line trend-chart__line--run"
              d={linePath(m.runPoints)}
            />
            <path
              data-testid="trend-line"
              data-series="ride"
              className="trend-chart__line trend-chart__line--ride"
              d={linePath(m.ridePoints)}
            />
            {m.runPoints.map((point, i) =>
              point ? (
                <circle
                  key={`run-${points[i]?.endMs}`}
                  data-testid="trend-marker"
                  data-series="run"
                  className="trend-chart__marker trend-chart__marker--run"
                  cx={point.x}
                  cy={point.y}
                  r={i === active ? activeR : markerR}
                />
              ) : null,
            )}
            {m.ridePoints.map((point, i) =>
              point ? (
                <circle
                  key={`ride-${points[i]?.endMs}`}
                  data-testid="trend-marker"
                  data-series="ride"
                  className="trend-chart__marker trend-chart__marker--ride"
                  cx={point.x}
                  cy={point.y}
                  r={i === active ? activeR : markerR}
                />
              ) : null,
            )}
          </>
        )
      }}
    </ChartFrame>
  )
}
