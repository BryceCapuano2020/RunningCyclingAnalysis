import { useState } from 'react'
import type { Sport } from '@rca/core/types'
import type { TrendPoint } from '@rca/core/digest'
import type { UnitSystem } from '@rca/core/units'
import { formatWkg } from '@rca/core/units'
import { plural } from '../components/plural'
import { formatDay } from '../format/date'
import { nativeValue } from '../records'
import { SPORT_LABEL, SPORT_PLURAL, SPORT_TITLE } from '../sports'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { Crosshair } from './Crosshair'
import { ChartYAxis } from './ChartYAxis'
import {
  ENDPOINT_LABEL_OFFSET,
  markerRadii,
  plotSurface,
  sizedOnce,
  tooltipAt,
  tooltipOverlay,
} from './chartInteraction'
import type { AxisTick, ChartSize, Point, TooltipContent } from './chartTypes'
import { areaPath, linePath } from './paths'
import { linearScale } from './scale'
import {
  axisTitle,
  fillsArea,
  formatNative,
  nativeLabel,
  paceUnitName,
  plottedValue,
  sportYAxis,
  usable,
} from './sportAxis'
import { axisFontSize, fitTicks } from './ticks'
import './ChartSeries.css'

export interface TrendChartProps {
  sport: Sport
  /** The weekly points of the period, in metabolic W/kg as the analysis gives them. */
  points: readonly TrendPoint[]
  /** Body mass in kg, for the W/kg of a cycling value. */
  massKg: number
  units: UnitSystem
  /** The trailing window of each value, in days. */
  windowDays: number
  /** The effort length each value is the best of, in seconds. */
  effortS: number
}

interface WeekRow {
  endMs: number
  /** The sport's own number: a speed in m/s for running, watts for cycling. NaN where none. */
  value: number
  /** Activities in the window with a value. */
  count: number
}

/** What the tooltip and the table need. */
interface View {
  sport: Sport
  units: UnitSystem
  massKg: number
}

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/**
 * formatDay names the viewer's calendar day, but each week ends on a UTC Sunday. Local noon on that
 * UTC date names the same day in every zone.
 */
function weekDay(ms: number): string {
  const date = new Date(ms)
  return formatDay(
    new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12).getTime(),
  )
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

/** "2 weeks", or "30 days" for a window that is not a whole number of weeks. */
function windowPhrase(days: number): string {
  return days % 7 === 0 ? plural(days / 7, 'week') : plural(days, 'day')
}

function weekRows(points: readonly TrendPoint[], sport: Sport, massKg: number): WeekRow[] {
  return points.map((point) => {
    const wkg = sport === 'run' ? point.runWkg : point.rideWkg
    return {
      endMs: point.endMs,
      value: wkg === null ? NaN : usable(nativeValue(sport, wkg, massKg)),
      count: sport === 'run' ? point.runCount : point.rideCount,
    }
  })
}

function hasValue(row: WeekRow): boolean {
  return Number.isFinite(row.value)
}

interface Layout {
  xs: number[]
  points: (Point | null)[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

function layout(rows: WeekRow[], view: View, size: ChartSize): Layout | null {
  const first = rows[0]
  const last = rows.at(-1)
  if (rows.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const { sport, units } = view
  const x = linearScale([first.endMs, last.endMs], [plot.left, plot.right])
  const { y, ticks } = sportYAxis(
    sport,
    rows.filter(hasValue).map((row) => plottedValue(sport, row.value, units)),
    plot,
  )
  return {
    xs: rows.map((row) => x(row.endMs)),
    points: rows.map((row) =>
      hasValue(row) ? { x: x(row.endMs), y: y(plottedValue(sport, row.value, units)) } : null,
    ),
    xTicks: fitTicks(
      monthStartsBetween(first.endMs, last.endMs).map((ms) => ({
        position: x(ms),
        label: MONTH.format(ms),
      })),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(ticks, { axis: 'y', width }),
  }
}

/** A cycling value also states its mechanical W/kg; a run states only its pace. */
function noteOf(row: WeekRow, view: View): string {
  const count = plural(row.count, SPORT_LABEL[view.sport].toLowerCase(), SPORT_PLURAL[view.sport])
  if (!hasValue(row)) return `No ${SPORT_PLURAL[view.sport]} in the window`
  return view.sport === 'ride'
    ? `${formatWkg(row.value / view.massKg)}, ${count} in the window`
    : `${count} in the window`
}

function tooltipFor(row: WeekRow, x: number, y: number, view: View): TooltipContent {
  return {
    x,
    y,
    title: `Week ending ${weekDay(row.endMs)}`,
    rows: [
      {
        kind: view.sport,
        label: nativeLabel(view.sport),
        value: formatNative(view.sport, row.value, view.units),
        note: noteOf(row, view),
      },
    ],
  }
}

/** The name of the chart, with the unit and the effort length spelt out. */
function titleOf(sport: Sport, units: UnitSystem, effort: string): string {
  return sport === 'run'
    ? `${SPORT_TITLE.run} grade-adjusted pace ${paceUnitName(units)}, best ${effort} by week`
    : `${SPORT_TITLE.ride} power in watts, best ${effort} by week`
}

/**
 * One sport's best 20-minute value in each week, in its own unit. Each value is the best in a
 * trailing window that ends that week, so a value holds until a faster effort or the window passes.
 */
export function TrendChart({ sport, points, massKg, units, windowDays, effortS }: TrendChartProps) {
  const rows = weekRows(points, sport, massKg)
  const hasData = rows.filter(hasValue).length >= 2
  const [active, setActive] = useState<number | null>(null)
  const windowText = windowPhrase(windowDays)
  const effort = `${effortS / 60} minutes`
  const view: View = { sport, units, massKg }
  const latest = rows.findLastIndex(hasValue)
  const layoutOf = sizedOnce((size: ChartSize) => layout(rows, view, size))
  const ride = sport === 'ride'

  return (
    <ChartFrame
      title={titleOf(sport, units, effort)}
      description={`Best ${effort} of ${SPORT_PLURAL[sport]} in the ${windowText} that end each week, as ${ride ? 'power in watts' : 'grade-adjusted pace'}.`}
      note="A value holds until a faster effort, or until the window that set it passes."
      table={{
        columns: [
          'Week ending',
          nativeLabel(sport),
          ...(ride ? ['W/kg'] : []),
          ride ? 'Rides' : 'Runs',
        ],
        rows: rows.map((row) => [
          weekDay(row.endMs),
          formatNative(sport, row.value, units),
          ...(ride ? [formatWkg(row.value / massKg)] : []),
          String(row.count),
        ]),
        caption: `Each week ends on a Sunday, in UTC. Each value is the best ${effort} in the ${windowText} that end that week; ${SPORT_PLURAL[sport]} count the activities in that window.`,
      }}
      empty={
        hasData ? undefined : `Add ${SPORT_PLURAL[sport]} in more than one week to see a trend`
      }
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(size, layoutOf(size)?.xs ?? null, active, (index, x, y) => {
            const row = rows[index]
            return row ? tooltipFor(row, x, y, view) : null
          }),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const { marker: markerR, active: activeR } = markerRadii(size.width)
        const activeX = active === null ? undefined : m.xs[active]
        const latestPoint = m.points[latest] ?? null
        const latestRow = rows[latest]
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
              title={axisTitle(sport, units)}
              fontSize={axisFontSize(size.width)}
            />
            {activeX !== undefined ? <Crosshair x={activeX} plot={size.plot} /> : null}
            {fillsArea(sport) ? (
              <path
                className={`chart-series__area chart-series__area--${sport}`}
                d={areaPath(m.points, size.plot.bottom)}
              />
            ) : null}
            <path
              data-testid="trend-line"
              className={`chart-series__line chart-series__line--${sport}`}
              d={linePath(m.points)}
            />
            {m.points.map((point, i) => {
              const row = rows[i]
              if (!point || !row || i === latest) return null
              // A value with no neighbour has no line through it, so it gets a dot of its own.
              const alone = m.points[i - 1] == null && m.points[i + 1] == null
              return alone ? (
                <circle
                  key={row.endMs}
                  data-testid="trend-marker"
                  className={`chart-series__marker chart-series__marker--${sport}`}
                  cx={point.x}
                  cy={point.y}
                  r={markerR}
                />
              ) : null
            })}
            {latestPoint && latestRow ? (
              <>
                <circle
                  data-testid="trend-latest"
                  className={`chart-series__marker chart-series__marker--${sport}`}
                  cx={latestPoint.x}
                  cy={latestPoint.y}
                  r={activeR}
                />
                <text
                  className="chart-series__label"
                  textAnchor="end"
                  x={latestPoint.x + ENDPOINT_LABEL_OFFSET.x}
                  y={latestPoint.y + ENDPOINT_LABEL_OFFSET.y}
                >
                  {formatNative(sport, latestRow.value, units)}
                </text>
              </>
            ) : null}
          </>
        )
      }}
    </ChartFrame>
  )
}
