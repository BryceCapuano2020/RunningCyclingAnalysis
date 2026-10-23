import { useState } from 'react'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import type { Curve } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration, formatPace, formatPower, formatWkg } from '@rca/core/units'
import { ChartFrame } from './ChartFrame'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import type { AxisTick, ChartSize, Point, TooltipContent } from './chartTypes'
import { markerRadii, plotSurface, tooltipOverlay } from './chartInteraction'
import { linePath } from './paths'
import { linearScale, logScale, niceDomain, tickDecimals } from './scale'
import { NARROW_WIDTH, axisFontSize, fitTicks } from './ticks'
import './CurveChart.css'

export interface CurveChartProps {
  runCurve: Curve
  rideMetabolicCurve: Curve
  rideCurve: Curve
  units: UnitSystem
  /** Activity id to name. When given, tooltips and the table say which activity each value is from. */
  activityNames?: Record<string, string>
}

const MIN_DURATION_S = 60
/** Candidate x ticks. Only those inside the data range are drawn. */
const TICK_DURATIONS_S = [60, 300, 1200, 3600, 7200, 10800]
/** Right margin that holds the end-of-line labels. */
const LABEL_MARGIN = 64
const LABEL_OFFSET_X = 8
/** Vertical offset that centres a 12 px label on its point. */
const LABEL_BASELINE_OFFSET = 4
const LABEL_MIN_GAP = 14

const LEGEND: ChartLegendEntry[] = [
  { label: 'Running', kind: 'run' },
  { label: 'Cycling', kind: 'ride' },
]

const TABLE_COLUMNS = [
  'Duration',
  'Running (W/kg)',
  'Flat pace',
  'Cycling (W/kg)',
  'Cycling power',
  'Running from',
  'Cycling from',
]

interface CurveRow {
  durationS: number
  /** Gross metabolic power, W/kg. NaN where there is no run at this duration. */
  runWkg: number
  /** Gross metabolic power, W/kg. NaN where there is no ride at this duration. */
  rideWkg: number
  /** Mechanical power, W. */
  ridePowerW: number
  runActivityId: string | null
  rideActivityId: string | null
}

function valueMap(curve: Curve): Map<number, number> {
  return new Map(curve.map((point): [number, number] => [point.durationS, point.value]))
}

function activityMap(curve: Curve): Map<number, string | null> {
  return new Map(curve.map((point): [number, string | null] => [point.durationS, point.activityId]))
}

/** One row per duration of at least a minute that has a value for either sport. */
function buildRows(runCurve: Curve, rideMetabolicCurve: Curve, rideCurve: Curve): CurveRow[] {
  const run = valueMap(runCurve)
  const rideWkg = valueMap(rideMetabolicCurve)
  const ridePower = valueMap(rideCurve)
  const runIds = activityMap(runCurve)
  const rideIds = activityMap(rideMetabolicCurve)
  const durations = new Set([...run.keys(), ...rideWkg.keys(), ...ridePower.keys()])
  return [...durations]
    .filter((durationS) => durationS >= MIN_DURATION_S)
    .sort((a, b) => a - b)
    .map((durationS) => ({
      durationS,
      runWkg: run.get(durationS) ?? NaN,
      rideWkg: rideWkg.get(durationS) ?? NaN,
      ridePowerW: ridePower.get(durationS) ?? NaN,
      runActivityId: runIds.get(durationS) ?? null,
      rideActivityId: rideIds.get(durationS) ?? null,
    }))
    .filter((row) => Number.isFinite(row.runWkg) || Number.isFinite(row.rideWkg))
}

interface Layout {
  rows: CurveRow[]
  /** Pixel x of each row, for hover. */
  xs: number[]
  runPoints: (Point | null)[]
  ridePoints: (Point | null)[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

function layout(rows: CurveRow[], size: ChartSize): Layout | null {
  const first = rows[0]
  const last = rows[rows.length - 1]
  if (rows.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const x = logScale([first.durationS, last.durationS], [plot.left, plot.right])
  // A line chart need not start at zero: the domain starts at a nice value below the minimum.
  const { domain, ticks } = niceDomain(
    rows.flatMap((row) => [row.runWkg, row.rideWkg]),
    4,
  )
  const y = linearScale(domain, [plot.bottom, plot.top])
  return {
    rows,
    xs: rows.map((row) => x(row.durationS)),
    runPoints: rows.map((row) =>
      Number.isFinite(row.runWkg) ? { x: x(row.durationS), y: y(row.runWkg) } : null,
    ),
    ridePoints: rows.map((row) =>
      Number.isFinite(row.rideWkg) ? { x: x(row.durationS), y: y(row.rideWkg) } : null,
    ),
    xTicks: fitTicks(
      TICK_DURATIONS_S.filter(
        (durationS) => durationS >= first.durationS && durationS <= last.durationS,
      ).map((durationS) => ({ position: x(durationS), label: formatDuration(durationS) })),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      ticks.map((value) => ({ position: y(value), label: value.toFixed(tickDecimals(ticks)) })),
      { axis: 'y', width },
    ),
  }
}

function lastPoint(points: (Point | null)[]): Point | null {
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i]
    if (point) return point
  }
  return null
}

interface EndLabel {
  text: string
  x: number
  /** Baseline. */
  y: number
}

/**
 * Labels just right of each line's last point. Two labels that would sit closer than the
 * minimum gap are pushed apart, symmetrically about their midpoint.
 */
function endLabels(m: Layout): EndLabel[] {
  const ends: EndLabel[] = []
  const run = lastPoint(m.runPoints)
  if (run) {
    ends.push({ text: 'Running', x: run.x + LABEL_OFFSET_X, y: run.y + LABEL_BASELINE_OFFSET })
  }
  const ride = lastPoint(m.ridePoints)
  if (ride) {
    ends.push({ text: 'Cycling', x: ride.x + LABEL_OFFSET_X, y: ride.y + LABEL_BASELINE_OFFSET })
  }
  const [first, second] = ends
  if (first && second && Math.abs(first.y - second.y) < LABEL_MIN_GAP) {
    const middle = (first.y + second.y) / 2
    const upper = first.y <= second.y ? first : second
    const lower = upper === first ? second : first
    upper.y = middle - LABEL_MIN_GAP / 2
    lower.y = middle + LABEL_MIN_GAP / 2
  }
  return ends
}

/** Names the activity behind a value. Null when names were not given. */
function sourceNote(
  id: string | null,
  names: Record<string, string> | undefined,
): string | undefined {
  if (names === undefined || id === null) return undefined
  return `from ${names[id] ?? id}`
}

function activityCell(id: string | null, names: Record<string, string> | undefined): string {
  if (id === null) return '—'
  return names?.[id] ?? id
}

function tableRow(
  row: CurveRow,
  units: UnitSystem,
  names: Record<string, string> | undefined,
): string[] {
  return [
    formatDuration(row.durationS),
    formatWkg(row.runWkg),
    formatPace(metabolicToFlatSpeed(row.runWkg), units),
    formatWkg(row.rideWkg),
    formatPower(row.ridePowerW),
    activityCell(row.runActivityId, names),
    activityCell(row.rideActivityId, names),
  ]
}

function tooltipFor(
  row: CurveRow,
  x: number,
  y: number,
  units: UnitSystem,
  names: Record<string, string> | undefined,
): TooltipContent {
  return {
    x,
    y,
    title: formatDuration(row.durationS),
    rows: [
      {
        kind: 'run',
        value: formatWkg(row.runWkg),
        label: 'Running',
        note: sourceNote(row.runActivityId, names),
      },
      { value: formatPace(metabolicToFlatSpeed(row.runWkg), units), label: 'Flat pace' },
      {
        kind: 'ride',
        value: formatWkg(row.rideWkg),
        label: 'Cycling',
        note: sourceNote(row.rideActivityId, names),
      },
      { value: formatPower(row.ridePowerW), label: 'Mechanical power' },
    ],
  }
}

function contentOf(
  size: ChartSize,
  rows: CurveRow[],
  active: number | null,
  units: UnitSystem,
  names: Record<string, string> | undefined,
): TooltipContent | null {
  const m = layout(rows, size)
  const row = active === null ? undefined : rows[active]
  const anchorX = m && active !== null ? m.xs[active] : undefined
  return row && anchorX !== undefined
    ? tooltipFor(row, anchorX, (size.plot.top + size.plot.bottom) / 2, units, names)
    : null
}

export function CurveChart({
  runCurve,
  rideMetabolicCurve,
  rideCurve,
  units,
  activityNames,
}: CurveChartProps) {
  const rows = buildRows(runCurve, rideMetabolicCurve, rideCurve)
  const hasData = rows.length >= 2
  const [active, setActive] = useState<number | null>(null)

  return (
    <ChartFrame
      title="Running and cycling energy rate by duration"
      description="Best energy rate in watts per kilogram for running and for cycling, on one axis. Duration is on a log scale."
      legend={hasData ? LEGEND : undefined}
      table={{
        columns: TABLE_COLUMNS,
        rows: rows.map((row) => tableRow(row, units, activityNames)),
      }}
      empty={hasData ? undefined : 'Add at least one run and one ride to see both curves'}
      plotRightMargin={(width) => (width < NARROW_WIDTH ? 16 : LABEL_MARGIN)}
      surface={(size) => plotSurface(size, layout(rows, size)?.xs ?? null, active, setActive)}
      overlay={(size) => tooltipOverlay(size, contentOf(size, rows, active, units, activityNames))}
    >
      {(size) => {
        const m = layout(rows, size)
        if (m === null) return null
        const narrow = size.width < NARROW_WIDTH
        const { marker: markerR, active: activeR } = markerRadii(size.width)
        const activeX = active === null ? undefined : m.xs[active]
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
              title="Energy rate (W/kg)"
              fontSize={axisFontSize(size.width)}
            />
            {activeX !== undefined ? (
              <line
                className="curve-chart__crosshair"
                x1={activeX}
                x2={activeX}
                y1={size.plot.top}
                y2={size.plot.bottom}
              />
            ) : null}
            <path
              data-testid="curve-line"
              className="curve-chart__line curve-chart__line--run"
              d={linePath(m.runPoints)}
            />
            <path
              data-testid="curve-line"
              className="curve-chart__line curve-chart__line--ride"
              d={linePath(m.ridePoints)}
            />
            {m.rows.map((row, i) => {
              const point = m.runPoints[i]
              return point ? (
                <circle
                  key={row.durationS}
                  data-testid="curve-marker"
                  data-series="run"
                  className="curve-chart__marker curve-chart__marker--run"
                  cx={point.x}
                  cy={point.y}
                  r={i === active ? activeR : markerR}
                />
              ) : null
            })}
            {m.rows.map((row, i) => {
              const point = m.ridePoints[i]
              return point ? (
                <circle
                  key={row.durationS}
                  data-testid="curve-marker"
                  data-series="ride"
                  className="curve-chart__marker curve-chart__marker--ride"
                  cx={point.x}
                  cy={point.y}
                  r={i === active ? activeR : markerR}
                />
              ) : null
            })}
            {narrow
              ? null
              : endLabels(m).map((label) => (
                  <text key={label.text} className="curve-chart__end-label" x={label.x} y={label.y}>
                    {label.text}
                  </text>
                ))}
          </>
        )
      }}
    </ChartFrame>
  )
}
