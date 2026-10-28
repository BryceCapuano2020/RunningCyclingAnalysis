import { useState } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { Curve, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration, formatWkg } from '@rca/core/units'
import { CURVE_START_S, RECORD_DURATIONS_S, effortLabel } from '../records'
import { SPORT_FORMAT, SPORT_LABEL, SPORT_PLURAL } from '../sports'
import { sharedSourceOf, sourceNote } from './activityText'
import { ChartFrame } from './ChartFrame'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartXAxis } from './ChartXAxis'
import { Crosshair } from './Crosshair'
import { ChartYAxis } from './ChartYAxis'
import {
  endLabelAt,
  markerRadii,
  plotSurface,
  pointBefore,
  sizedOnce,
  tooltipAt,
  tooltipOverlay,
} from './chartInteraction'
import type { AxisTick, ChartSize, Point, TooltipContent, TooltipRow } from './chartTypes'
import { durationRows } from './curveRows'
import { captionOf, columnsOf, tableRow } from './curveTable'
import type { CurveRow, View } from './curveTable'
import { areaPath, linePath } from './paths'
import { labelWidthPx, rootFontPx } from './rootFont'
import { logScale } from './scale'
import { keyOf } from './sportCurveKey'
import {
  axisTitle,
  fillsArea,
  formatNative,
  nativeLabel,
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

/** One row per duration from the sport's curve start with a value in either period. */
function buildRows(sport: Sport, curve: Curve, before: Curve): CurveRow[] {
  return durationRows([curve, before])
    .filter(({ durationS }) => durationS >= CURVE_START_S[sport])
    .map(({ durationS, points: [current, earlier] }) => ({
      durationS,
      value: usable(current?.value ?? NaN),
      previous: usable(earlier?.value ?? NaN),
      activityId: current?.activityId ?? null,
    }))
    .filter((row) => Number.isFinite(row.value) || Number.isFinite(row.previous))
}

/**
 * The last point's value, placed at its point, or null when there is none to show. It is left out
 * when its text would start left of the emphasised point, since the emphasised label sits there.
 */
function lastLabelOf(
  m: Layout,
  lastIndex: number,
  emphasis: number,
  sport: Sport,
  units: UnitSystem,
  row: CurveRow | undefined,
  rootPx: number,
): { at: Point; text: string } | null {
  const last = m.points[lastIndex] ?? null
  const emphasised = m.points[emphasis] ?? null
  if (last === null || row === undefined || lastIndex === emphasis) return null
  const text = formatNative(sport, row.value, units)
  const at = endLabelAt(last, pointBefore(m.points, lastIndex), m.floor)
  const clear = emphasised === null || at.x - labelWidthPx(text, rootPx) > emphasised.x
  return clear ? { at, text } : null
}

/** A duration the records list names, which the curve marks at each of its points. */
function isRecordDuration(sport: Sport, durationS: number): boolean {
  return RECORD_DURATIONS_S[sport].includes(durationS)
}

/** The curve's first duration in words: "a minute", or "3 min" from two minutes up. */
function startText(sport: Sport): string {
  return CURVE_START_S[sport] === 60 ? 'a minute' : effortLabel(CURVE_START_S[sport])
}

/** The best 20 minutes when there is one, else the longest effort. Its index in rows, or -1. */
function emphasisIndex(rows: CurveRow[]): number {
  const headline = rows.findIndex(
    (row) => row.durationS === HEADLINE_DURATION_S && Number.isFinite(row.value),
  )
  return headline >= 0 ? headline : rows.findLastIndex((row) => Number.isFinite(row.value))
}

interface Layout {
  /** The plot's bottom edge, which an end label keeps clear of. */
  floor: number
  xs: number[]
  points: (Point | null)[]
  /** The y of each duration's point, for anchoring its tooltip beside it. */
  ys: (number | null)[]
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
  const points = pointsOf((row) => row.value)
  return {
    floor: plot.bottom,
    xs: rows.map((row) => x(row.durationS)),
    points,
    ys: points.map((point) => point?.y ?? null),
    earlier: pointsOf((row) => row.previous),
    xTicks: fitTicks(durationTicks(first.durationS, last.durationS, x), {
      axis: 'x',
      width,
      // The 20 minute tick is the one the emphasised point names, so thinning keeps it.
      keep: (tick) => tick.label === formatDuration(HEADLINE_DURATION_S),
    }),
    yTicks: fitTicks(ticks, { axis: 'y', width }),
  }
}

/** Cycling tooltips and tables give the mechanical W/kg; running names only its activity. */
function noteOf(row: CurveRow, view: View): string | undefined {
  const source = sourceNote(row.activityId, view.names)
  if (!SPORT_FORMAT[view.sport].showsWkg) return source
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
      swatch: 'dashed',
    })
  }
  return { x, y, title: formatDuration(row.durationS), rows }
}

/** The name of the chart, with the unit spelt out: "per kilometre", "in watts". */
function titleOf(sport: Sport, units: UnitSystem): string {
  return `${SPORT_LABEL[sport]} ${SPORT_FORMAT[sport].titleUnit(units)} by duration`
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
  const rows = buildRows(sport, curve, previous?.curve ?? [])
  // The previous period is drawn, listed and tabled only when it has a value to show.
  const shown =
    previous !== null && rows.some((row) => Number.isFinite(row.previous)) ? previous : null
  const view: View = {
    sport,
    units,
    massKg,
    previous: shown,
    names: activityNames,
    shared: sharedSourceOf(rows.map((row) => row.activityId)),
  }
  const hasData = rows.filter((row) => Number.isFinite(row.value)).length >= 2
  const [active, setActive] = useState<number | null>(null)
  const emphasis = emphasisIndex(rows)
  // The last effort with a value: the end of the line, which is labelled with its value.
  const lastIndex = rows.findLastIndex((row) => Number.isFinite(row.value))
  const [rootPx] = useState(rootFontPx)
  const layoutOf = sizedOnce((size: ChartSize) => layout(rows, view, size))
  const legend: ChartLegendEntry[] | undefined = hasData ? keyOf(sport, shown, previous) : undefined
  const noPrevious =
    previous && !shown && hasData
      ? `No ${SPORT_PLURAL[sport]} in the ${previous.label.toLowerCase()}`
      : undefined

  return (
    <ChartFrame
      title={titleOf(sport, units)}
      description={`Best ${SPORT_FORMAT[sport].nativeLabel.toLowerCase()} for each duration. Duration is on a log scale.${shown ? ` Dashed line: ${shown.label}.` : ''}`}
      legend={legend}
      keyNote={noPrevious}
      table={{
        caption: captionOf(view),
        columns: columnsOf(view),
        rows: rows.map((row) => tableRow(row, view)),
        // The From column holds words, so it is set on the left.
        textColumns: view.shared === null ? [columnsOf(view).length - 1] : [],
      }}
      empty={
        hasData
          ? undefined
          : `Add ${SPORT_PLURAL[sport]} of ${startText(sport)} or more to see this curve`
      }
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
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
        const { marker: markerR, active: activeR } = markerRadii(size.width)
        const activeX = active === null ? undefined : m.xs[active]
        const emphasised = m.points[emphasis] ?? null
        const emphasisRow = rows[emphasis]
        const lastLabel = lastLabelOf(m, lastIndex, emphasis, sport, units, rows[lastIndex], rootPx)
        const beforeEmphasis = pointBefore(m.points, emphasis)
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
                data-sport={sport}
                d={areaPath(m.points, size.plot.bottom)}
              />
            ) : null}
            {shown ? (
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
                  {...endLabelAt(emphasised, beforeEmphasis ?? null)}
                >
                  {formatNative(sport, emphasisRow.value, units)}
                </text>
              </>
            ) : null}
            {m.points.map((point, index) =>
              point !== null &&
              index !== emphasis &&
              isRecordDuration(sport, rows[index]?.durationS ?? NaN) ? (
                <circle
                  key={rows[index]?.durationS}
                  data-testid="sport-curve-record"
                  className={`chart-series__marker chart-series__marker--${sport}`}
                  cx={point.x}
                  cy={point.y}
                  r={markerR}
                />
              ) : null,
            )}
            {lastLabel !== null ? (
              <text className="chart-series__label" textAnchor="end" {...lastLabel.at}>
                {lastLabel.text}
              </text>
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
