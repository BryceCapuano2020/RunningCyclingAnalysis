import { useState } from 'react'
import type { Sport } from '@rca/core/types'
import type { TrendPoint } from '@rca/core/digest'
import type { UnitSystem } from '@rca/core/units'
import { formatWkg } from '@rca/core/units'
import { plural } from '../components/plural'
import { effortLabel, nativeValue } from '../records'
import { SPORT_FORMAT, SPORT_LABEL, SPORT_PLURAL, SPORT_TITLE } from '../sports'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { Crosshair } from './Crosshair'
import { ChartYAxis } from './ChartYAxis'
import { GapMarks } from './GapMarks'
import {
  LABEL_GAP_X,
  endLabelAt,
  markerRadii,
  plotSurface,
  pointBefore,
  sizedOnce,
  tooltipAt,
  tooltipOverlay,
} from './chartInteraction'
import { ASCENT_EM, DESCENT_EM, meetsBoxes, stepBoxes, textBox } from './chartBoxes'
import type { AxisTick, ChartSize, Point, TooltipContent } from './chartTypes'
import { lastAtOrBefore } from './hover'
import { stepAreaPath, stepPath } from './paths'
import { labelSizePx, rootFontPx } from './rootFont'
import { linearScale } from './scale'
import {
  axisTitle,
  fillsArea,
  formatNative,
  nativeLabel,
  plottedValue,
  sportYAxis,
  usable,
} from './sportAxis'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { trendDateTicks } from './trendTicks'
import { STEPPED_LINE_TEXT, weekDay, windowPhrase } from './trendText'
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

/** A sport's weekly W/kg and activity count, read from the trend's own fields for that sport. */
const WEEK_OF: Record<Sport, (point: TrendPoint) => { wkg: number | null; count: number }> = {
  run: (point) => ({ wkg: point.runWkg, count: point.runCount }),
  ride: (point) => ({ wkg: point.rideWkg, count: point.rideCount }),
}

/** The sport's name as a column heading, and as the chart describes its values. */
const COUNT_HEADING: Record<Sport, string> = { run: 'Runs', ride: 'Rides' }
const TREND_NOUN: Record<Sport, string> = { run: 'flat pace, faster up', ride: 'power in watts' }

function weekRows(points: readonly TrendPoint[], sport: Sport, massKg: number): WeekRow[] {
  return points.map((point) => {
    const { wkg, count } = WEEK_OF[sport](point)
    return {
      endMs: point.endMs,
      value: wkg === null ? NaN : usable(nativeValue(sport, wkg, massKg)),
      count,
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
  /** The latest value, named by its value alone, and where its text sits. */
  label: LatestLabel | null
}

/** A spot a label's text can take: where its anchor sits, and which way the text runs from it. */
interface LabelSpot {
  at: Point
  anchor: 'start' | 'end'
}

/** The latest value's label: its text, and the spot it takes. */
interface LatestLabel extends LabelSpot {
  text: string
}

/**
 * The latest value's label. It sits left of its point, below it, or above it where the stepped line would
 * run under it. When both the spots below and above are crossed by the line, it sits to the right of the
 * point if there is room there, and otherwise above. Its box is kept clear of the line's own steps.
 */
function latestLabelOf(
  text: string,
  points: readonly (Point | null)[],
  latest: number,
  size: ChartSize,
): LatestLabel | null {
  const point = points[latest] ?? null
  if (point === null) return null
  const rootPx = rootFontPx()
  const line = stepBoxes(points, markerRadii(size.width).active)
  const crosses = (spot: LabelSpot) =>
    meetsBoxes(textBox(text, spot.at, rootPx, spot.anchor), line, 0)
  // A point with a line from below sits its label above, so the above spot is the one that line leaves.
  const preferred = endLabelAt(point, pointBefore(points, latest), size.plot.bottom)
  const above = endLabelAt(point, { x: point.x, y: point.y + 1 })
  // Beside the point, its text's middle level with the point, which needs room to the plot's right edge.
  const beside: LabelSpot = {
    at: {
      x: point.x + LABEL_GAP_X,
      y: point.y + ((ASCENT_EM - DESCENT_EM) / 2) * labelSizePx(rootPx),
    },
    anchor: 'start',
  }
  const room = textBox(text, beside.at, rootPx, 'start').right <= size.plot.right
  const vertical: LabelSpot[] = [
    { at: preferred, anchor: 'end' },
    { at: above, anchor: 'end' },
  ]
  for (const spot of vertical) {
    if (!crosses(spot)) return { text, ...spot }
  }
  if (room && !crosses(beside)) return { text, ...beside }
  return { text, at: above, anchor: 'end' }
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
  const latest = rows.findLastIndex(hasValue)
  const latestRow = rows[latest]
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
    label:
      latestRow === undefined
        ? null
        : latestLabelOf(formatNative(sport, latestRow.value, units), points, latest, size),
  }
}

/** A cycling value also states its mechanical W/kg; a run states only its pace. */
function noteOf(row: WeekRow, view: View): string {
  const count = plural(row.count, SPORT_LABEL[view.sport].toLowerCase(), SPORT_PLURAL[view.sport])
  if (!hasValue(row)) return `No ${SPORT_PLURAL[view.sport]} in the window`
  return SPORT_FORMAT[view.sport].showsWkg
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
  return `${SPORT_TITLE[sport]} ${SPORT_FORMAT[sport].titleUnit(units)}, best ${effort}, trailing ${windowText}`
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
  // The effort is named as its segment's label is, so the title and the control read the same.
  const effort = effortLabel(effortS)
  const view: View = { sport, units, massKg }
  const latest = rows.findLastIndex(hasValue)
  const layoutOf = sizedOnce((size: ChartSize) => layout(rows, view, size))

  return (
    <ChartFrame
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      title={titleOf(sport, units, effort, windowText)}
      description={`Best ${effort} of ${SPORT_PLURAL[sport]} in the ${windowText} that end each week, as ${TREND_NOUN[sport]}.`}
      note={hasData ? STEPPED_LINE_TEXT : undefined}
      table={{
        columns: [
          'Week ending',
          nativeLabel(sport),
          ...(SPORT_FORMAT[sport].showsWkg ? ['W/kg'] : []),
          COUNT_HEADING[sport],
        ],
        rows: rows.map((row) => [
          weekDay(row.endMs),
          formatNative(sport, row.value, units),
          ...(SPORT_FORMAT[sport].showsWkg ? [formatWkg(row.value / massKg)] : []),
          String(row.count),
        ]),
        caption: `Each value is the best ${effort} in the ${windowText} that end that week; ${SPORT_PLURAL[sport]} count the activities in that window.`,
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
        return (
          <>
            <ChartXAxis ticks={m.xTicks} plot={plot} fontSize={axisFontSize(size.width)} />
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
                data-sport={sport}
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
            {latestPoint && m.label ? (
              <>
                <circle
                  data-testid="trend-latest"
                  className={`chart-series__marker chart-series__marker--${sport}`}
                  cx={latestPoint.x}
                  cy={latestPoint.y}
                  r={activeR}
                />
                <text className="chart-series__label" textAnchor={m.label.anchor} {...m.label.at}>
                  {m.label.text}
                </text>
              </>
            ) : null}
          </>
        )
      }}
    </ChartFrame>
  )
}
