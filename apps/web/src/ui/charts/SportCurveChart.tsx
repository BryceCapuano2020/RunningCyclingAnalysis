import { useState } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { Curve, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration, formatWkg } from '@rca/core/units'
import { SPORT_PLURAL, SPORT_TITLE } from '../sports'
import { activityCell, sourceNote } from './activityText'
import { ChartFrame } from './ChartFrame'
import type { ChartLegendEntry } from './ChartLegend'
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
import type { AxisTick, ChartSize, Point, TooltipContent, TooltipRow } from './chartTypes'
import { durationRows } from './curveRows'
import { areaPath, linePath } from './paths'
import { logScale } from './scale'
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
import { axisFontSize, durationTicks, fitTicks } from './ticks'
import './ChartSeries.css'

/** The best efforts of the period before, and the label it is named by, such as "Previous 6 weeks". */
export interface PreviousCurve {
  curve: Curve
  label: string
}

export interface SportCurveChartProps {
  sport: Sport
  /** Best value at each duration in the sport's own number: m/s for running, watts for cycling. */
  curve: Curve
  /** The same curve for the period before, drawn dashed. */
  previous: PreviousCurve | null
  /** Body mass in kg, for the W/kg in a cycling tooltip. */
  massKg: number
  units: UnitSystem
  /** Activity id to name. When given, tooltips and the table say which activity each value is from. */
  activityNames?: Record<string, string>
}

interface CurveRow {
  durationS: number
  /** NaN where the sport has no effort of this duration. */
  value: number
  /** NaN where the period before has none. */
  previous: number
  activityId: string | null
}

/** One row per duration of at least a minute with a value in either period. */
function buildRows(curve: Curve, before: Curve): CurveRow[] {
  return durationRows([curve, before])
    .map(({ durationS, points: [current, earlier] }) => ({
      durationS,
      value: usable(current?.value ?? NaN),
      previous: usable(earlier?.value ?? NaN),
      activityId: current?.activityId ?? null,
    }))
    .filter((row) => Number.isFinite(row.value) || Number.isFinite(row.previous))
}

/** The best 20 minutes when there is one, else the longest effort. Its index in rows, or -1. */
function emphasisIndex(rows: CurveRow[]): number {
  const headline = rows.findIndex(
    (row) => row.durationS === HEADLINE_DURATION_S && Number.isFinite(row.value),
  )
  return headline >= 0 ? headline : rows.findLastIndex((row) => Number.isFinite(row.value))
}

interface Layout {
  xs: number[]
  points: (Point | null)[]
  earlier: (Point | null)[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

function layout(rows: CurveRow[], view: View, size: ChartSize): Layout | null {
  const first = rows[0]
  const last = rows.at(-1)
  if (rows.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const x = logScale([first.durationS, last.durationS], [plot.left, plot.right])
  const plotted = (value: number) => plottedValue(view.sport, value, view.units)
  const values = rows.flatMap((row) => [row.value, row.previous]).filter(Number.isFinite)
  const { y, ticks } = sportYAxis(view.sport, values.map(plotted), plot)
  const pointsOf = (pick: (row: CurveRow) => number): (Point | null)[] =>
    rows.map((row) =>
      Number.isFinite(pick(row)) ? { x: x(row.durationS), y: y(plotted(pick(row))) } : null,
    )
  return {
    xs: rows.map((row) => x(row.durationS)),
    points: pointsOf((row) => row.value),
    earlier: pointsOf((row) => row.previous),
    xTicks: fitTicks(durationTicks(first.durationS, last.durationS, x), { axis: 'x', width }),
    yTicks: fitTicks(ticks, { axis: 'y', width }),
  }
}

/** What the tooltips and the table need, bundled so that they are passed together. */
interface View {
  sport: Sport
  units: UnitSystem
  massKg: number
  previous: PreviousCurve | null
  names: Record<string, string> | undefined
}

/** Cycling tooltips and tables give the mechanical W/kg; running names only its activity. */
function noteOf(row: CurveRow, view: View): string | undefined {
  const source = sourceNote(row.activityId, view.names)
  if (view.sport === 'run') return source
  const wkg = formatWkg(row.value / view.massKg)
  return source === undefined ? wkg : `${wkg}, ${source}`
}

function tooltipFor(row: CurveRow, x: number, y: number, view: View): TooltipContent {
  const rows: TooltipRow[] = []
  if (Number.isFinite(row.value)) {
    rows.push({
      kind: view.sport,
      label: nativeLabel(view.sport),
      value: formatNative(view.sport, row.value, view.units),
      note: noteOf(row, view),
    })
  }
  if (view.previous && Number.isFinite(row.previous)) {
    rows.push({
      kind: 'neutral',
      label: view.previous.label,
      value: formatNative(view.sport, row.previous, view.units),
    })
  }
  return { x, y, title: formatDuration(row.durationS), rows }
}

/** The name of the chart, with the unit spelt out: "per kilometre", "in watts". */
function titleOf(sport: Sport, units: UnitSystem): string {
  return sport === 'run'
    ? `${SPORT_TITLE.run} grade-adjusted pace ${paceUnitName(units)} by duration`
    : `${SPORT_TITLE.ride} power in watts by duration`
}

/** The table's caption, saying what its values are. */
function captionOf(view: View): string {
  return view.sport === 'run'
    ? `Best grade-adjusted pace at each duration, ${paceUnitName(view.units)}.`
    : 'Best power at each duration, in watts, with W/kg at your body mass.'
}

function columnsOf(view: View): string[] {
  return [
    'Duration',
    nativeLabel(view.sport),
    ...(view.sport === 'ride' ? ['W/kg'] : []),
    ...(view.previous ? [view.previous.label] : []),
    'From',
  ]
}

function tableRow(row: CurveRow, view: View): string[] {
  return [
    formatDuration(row.durationS),
    formatNative(view.sport, row.value, view.units),
    ...(view.sport === 'ride' ? [formatWkg(row.value / view.massKg)] : []),
    ...(view.previous ? [formatNative(view.sport, row.previous, view.units)] : []),
    activityCell(row.activityId, view.names),
  ]
}

/**
 * A sport's best efforts by duration, in its own unit: pace for running, faster up, and power for
 * cycling. The 20-minute effort is marked, and the period before is a dashed line when given.
 */
export function SportCurveChart({
  sport,
  curve,
  previous,
  massKg,
  units,
  activityNames,
}: SportCurveChartProps) {
  const view: View = { sport, units, massKg, previous, names: activityNames }
  const rows = buildRows(curve, previous?.curve ?? [])
  const hasData = rows.filter((row) => Number.isFinite(row.value)).length >= 2
  const [active, setActive] = useState<number | null>(null)
  const emphasis = emphasisIndex(rows)
  const layoutOf = sizedOnce((size: ChartSize) => layout(rows, view, size))
  const legend: ChartLegendEntry[] | undefined =
    previous && hasData
      ? [
          { label: SPORT_TITLE[sport], kind: sport },
          { label: previous.label, kind: 'neutral', swatch: 'dashed' },
        ]
      : undefined

  return (
    <ChartFrame
      title={titleOf(sport, units)}
      description={`Best ${sport === 'run' ? 'grade-adjusted pace' : 'power'} for each duration. Duration is on a log scale.${previous ? ` Dashed line: ${previous.label}.` : ''}`}
      legend={legend}
      table={{
        caption: captionOf(view),
        columns: columnsOf(view),
        rows: rows.map((row) => tableRow(row, view)),
      }}
      empty={
        hasData ? undefined : `Add ${SPORT_PLURAL[sport]} of a minute or more to see this curve`
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
        const emphasised = m.points[emphasis] ?? null
        const emphasisRow = rows[emphasis]
        const activePoint = active === null ? null : (m.points[active] ?? null)
        const activeEarlier = active === null ? null : (m.earlier[active] ?? null)
        return (
          <>
            <ChartXAxis
              ticks={m.xTicks}
              plot={size.plot}
              title="Duration"
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
            {previous ? (
              <path
                data-testid="sport-curve-previous"
                className="chart-series__line chart-series__line--previous"
                d={linePath(m.earlier)}
              />
            ) : null}
            <path
              data-testid="sport-curve-line"
              className={`chart-series__line chart-series__line--${sport}`}
              d={linePath(m.points)}
            />
            {emphasised && emphasisRow ? (
              <>
                <circle
                  data-testid="sport-curve-emphasis"
                  className={`chart-series__marker chart-series__marker--${sport}`}
                  cx={emphasised.x}
                  cy={emphasised.y}
                  r={activeR}
                />
                <text
                  className="chart-series__label"
                  textAnchor="end"
                  x={emphasised.x + ENDPOINT_LABEL_OFFSET.x}
                  y={emphasised.y + ENDPOINT_LABEL_OFFSET.y}
                >
                  {formatDuration(emphasisRow.durationS)}
                </text>
              </>
            ) : null}
            {activePoint ? (
              <circle
                className={`chart-series__marker chart-series__marker--${sport}`}
                cx={activePoint.x}
                cy={activePoint.y}
                r={activeR}
              />
            ) : null}
            {activeEarlier ? (
              <circle
                className="chart-series__marker chart-series__marker--previous"
                cx={activeEarlier.x}
                cy={activeEarlier.y}
                r={markerR}
              />
            ) : null}
          </>
        )
      }}
    </ChartFrame>
  )
}
