import { useState } from 'react'
import type { Sport } from '@rca/core/types'
import type { TrendPoint } from '@rca/core/digest'
import type { UnitSystem } from '@rca/core/units'
import { formatWkg } from '@rca/core/units'
import { plural } from '../components/plural'
import { nativeValue } from '../records'
import { SPORT_LABEL, SPORT_PLURAL, SPORT_TITLE } from '../sports'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { Crosshair } from './Crosshair'
import { ChartYAxis } from './ChartYAxis'
import { GapMarks } from './GapMarks'
import {
  endLabelAt,
  markerRadii,
  plotSurface,
  pointBefore,
  sizedOnce,
  tooltipAt,
  tooltipOverlay,
} from './chartInteraction'
import type { AxisTick, ChartSize, Point, TooltipContent } from './chartTypes'
import { lastAtOrBefore } from './hover'
import { stepAreaPath, stepPath } from './paths'
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
import { trendDateTicks } from './trendTicks'
import { weekDay, windowPhrase } from './trendText'
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
  ys: (number | null)[]
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
  const points = rows.map((row) =>
    hasValue(row) ? { x: x(row.endMs), y: y(plottedValue(sport, row.value, units)) } : null,
  )
  return {
    xs: rows.map((row) => x(row.endMs)),
    points,
    ys: points.map((point) => point?.y ?? null),
    xTicks: fitTicks(
      trendDateTicks(
        rows.map((row) => row.endMs),
        x,
      ),
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

/** The name of the chart: the unit, the effort and the window it is the best of. */
function titleOf(sport: Sport, units: UnitSystem, effort: string, windowText: string): string {
  return sport === 'run'
    ? `${SPORT_TITLE.run} flat pace ${paceUnitName(units)}, best ${effort}, trailing ${windowText}`
    : `${SPORT_TITLE.ride} power in watts, best ${effort}, trailing ${windowText}`
}

/**
 * One sport's best effort of a length in each week, in its own unit. Each value is the best in a
 * trailing window that ends that Sunday. The line holds each value until the next Sunday, and each
 * week's value is marked.
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
      title={titleOf(sport, units, effort, windowText)}
      description={`Best ${effort} of ${SPORT_PLURAL[sport]} in the ${windowText} that end each week, as ${ride ? 'power in watts' : 'flat pace, faster up'}.`}
      note={`Each point is the best ${effort} in the ${windowText} to that Sunday. Each line steps from one Sunday to the next, and breaks where a week has no value.`}
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
        caption: `Each week ends on a Sunday. Each value is the best ${effort} in the ${windowText} that end that week; ${SPORT_PLURAL[sport]} count the activities in that window.`,
      }}
      empty={
        hasData ? undefined : `Add ${SPORT_PLURAL[sport]} in more than one week to see a trend`
      }
      surface={(size) =>
        plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive, lastAtOrBefore)
      }
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(
            size,
            layoutOf(size)?.xs ?? null,
            active,
            (index, x, y) => {
              const row = rows[index]
              return row ? tooltipFor(row, x, y, view) : null
            },
            layoutOf(size)?.ys,
          ),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const { plot } = size
        const { marker: markerR, active: activeR } = markerRadii(size.width)
        const activeX = active === null ? undefined : m.xs[active]
        const latestPoint = m.points[latest] ?? null
        const latestRow = rows[latest]
        const before = pointBefore(m.points, latest)
        return (
          <>
            <ChartXAxis
              ticks={m.xTicks}
              plot={plot}
              title="Date"
              fontSize={axisFontSize(size.width)}
            />
            <ChartYAxis
              ticks={m.yTicks}
              plot={plot}
              title={axisTitle(sport, units)}
              fontSize={axisFontSize(size.width)}
            />
            <GapMarks xs={m.xs} gaps={rows.map((row) => !hasValue(row))} plot={plot} />
            {activeX !== undefined ? <Crosshair x={activeX} plot={plot} /> : null}
            {fillsArea(sport) ? (
              <path
                className={`chart-series__area chart-series__area--${sport}`}
                d={stepAreaPath(m.points, plot.bottom)}
              />
            ) : null}
            <path
              data-testid="trend-line"
              className={`chart-series__line chart-series__line--${sport}`}
              d={stepPath(m.points)}
            />
            {m.points.map((point, i) => {
              const row = rows[i]
              if (!point || !row || i === latest) return null
              return (
                <circle
                  key={row.endMs}
                  data-testid="trend-marker"
                  className={`chart-series__marker chart-series__marker--${sport}`}
                  cx={point.x}
                  cy={point.y}
                  r={markerR}
                />
              )
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
                  {...endLabelAt(latestPoint, before)}
                >
                  {`${formatNative(sport, latestRow.value, units)}, last ${windowText}`}
                </text>
              </>
            ) : null}
          </>
        )
      }}
    </ChartFrame>
  )
}
