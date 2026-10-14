import { useState } from 'react'
import { metabolicToFlatSpeed } from '../../core/metabolic/converters'
import type { Curve } from '../../core/types'
import type { UnitSystem } from '../../core/units'
import { formatDuration, formatPace, formatPower, formatWkg } from '../../core/units'
import { ChartFrame } from './ChartFrame'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartTooltip } from './ChartTooltip'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import type { AxisTick, ChartSize, Point, TooltipContent } from './chartTypes'
import { nearestByX, stepActive } from './hover'
import { linePath } from './paths'
import { PlotSurface } from './PlotSurface'
import { linearScale, logScale, niceDomain } from './scale'
import './CurveChart.css'

export interface CurveChartProps {
  runCurve: Curve
  rideMetabolicCurve: Curve
  rideCurve: Curve
  units: UnitSystem
}

const MIN_DURATION_S = 60
/** Candidate x ticks. Only those inside the data range are drawn. */
const TICK_DURATIONS_S = [60, 300, 1200, 3600, 7200, 10800]
const MARKER_R = 4
const ACTIVE_MARKER_R = 6
/** End labels closer than this vertically would overlap, so one is moved. */
const LABEL_CLASH_PX = 16

const LEGEND: ChartLegendEntry[] = [
  { label: 'Running', kind: 'run' },
  { label: 'Cycling', kind: 'ride' },
]

const TABLE_COLUMNS = ['Duration', 'Running (W/kg)', 'Flat pace', 'Cycling (W/kg)', 'Cycling power']

interface CurveRow {
  durationS: number
  /** Gross metabolic power, W/kg. NaN where there is no run at this duration. */
  runWkg: number
  /** Gross metabolic power, W/kg. NaN where there is no ride at this duration. */
  rideWkg: number
  /** Mechanical power, W. */
  ridePowerW: number
}

function valueMap(curve: Curve): Map<number, number> {
  return new Map(curve.map((point): [number, number] => [point.durationS, point.value]))
}

/** One row per duration of at least a minute that has a value for either sport. */
function buildRows(runCurve: Curve, rideMetabolicCurve: Curve, rideCurve: Curve): CurveRow[] {
  const run = valueMap(runCurve)
  const rideWkg = valueMap(rideMetabolicCurve)
  const ridePower = valueMap(rideCurve)
  const durations = new Set([...run.keys(), ...rideWkg.keys(), ...ridePower.keys()])
  return [...durations]
    .filter((durationS) => durationS >= MIN_DURATION_S)
    .sort((a, b) => a - b)
    .map((durationS) => ({
      durationS,
      runWkg: run.get(durationS) ?? NaN,
      rideWkg: rideWkg.get(durationS) ?? NaN,
      ridePowerW: ridePower.get(durationS) ?? NaN,
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
  const { plot } = size
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
    xTicks: TICK_DURATIONS_S.filter(
      (durationS) => durationS >= first.durationS && durationS <= last.durationS,
    ).map((durationS) => ({ position: x(durationS), label: formatDuration(durationS) })),
    yTicks: ticks.map((value) => ({ position: y(value), label: value.toFixed(1) })),
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
  y: number
  labelY: number
}

/** Labels at the end of each line. When the two ends clash, one goes above and one below. */
function endLabels(m: Layout): EndLabel[] {
  const ends: { text: string; point: Point }[] = []
  const run = lastPoint(m.runPoints)
  if (run) ends.push({ text: 'Running', point: run })
  const ride = lastPoint(m.ridePoints)
  if (ride) ends.push({ text: 'Cycling', point: ride })
  const [first, second] = ends
  const clash =
    first !== undefined &&
    second !== undefined &&
    Math.abs(first.point.y - second.point.y) < LABEL_CLASH_PX
  const firstIsUpper =
    first !== undefined && second !== undefined && first.point.y <= second.point.y
  return ends.map((end, i) => {
    const above = !clash || (i === 0) === firstIsUpper
    return {
      text: end.text,
      x: end.point.x,
      y: end.point.y,
      labelY: above ? end.point.y - 10 : end.point.y + 18,
    }
  })
}

function tableRow(row: CurveRow, units: UnitSystem): string[] {
  return [
    formatDuration(row.durationS),
    formatWkg(row.runWkg),
    formatPace(metabolicToFlatSpeed(row.runWkg), units),
    formatWkg(row.rideWkg),
    formatPower(row.ridePowerW),
  ]
}

function tooltipFor(row: CurveRow, x: number, y: number, units: UnitSystem): TooltipContent {
  return {
    x,
    y,
    title: formatDuration(row.durationS),
    rows: [
      { kind: 'run', value: formatWkg(row.runWkg), label: 'Running' },
      { value: formatPace(metabolicToFlatSpeed(row.runWkg), units), label: 'Flat pace' },
      { kind: 'ride', value: formatWkg(row.rideWkg), label: 'Cycling' },
      { value: formatPower(row.ridePowerW), label: 'Mechanical power' },
    ],
  }
}

export function CurveChart({ runCurve, rideMetabolicCurve, rideCurve, units }: CurveChartProps) {
  const rows = buildRows(runCurve, rideMetabolicCurve, rideCurve)
  const hasData = rows.length >= 2
  const [active, setActive] = useState<number | null>(null)

  return (
    <ChartFrame
      title="Running and cycling gross metabolic power by duration"
      description="Best gross metabolic power in watts per kilogram for running and for cycling, on one axis. Duration is on a log scale."
      legend={hasData ? LEGEND : undefined}
      table={{ columns: TABLE_COLUMNS, rows: rows.map((row) => tableRow(row, units)) }}
      empty={hasData ? undefined : 'Add at least one run and one ride to see both curves'}
      overlay={(size) => {
        const m = layout(rows, size)
        const row = active === null ? undefined : rows[active]
        const anchorX = m && active !== null ? m.xs[active] : undefined
        const content =
          row && anchorX !== undefined
            ? tooltipFor(row, anchorX, (size.plot.top + size.plot.bottom) / 2, units)
            : null
        return (
          <ChartTooltip bounds={{ width: size.width, height: size.height }} content={content} />
        )
      }}
    >
      {(size) => {
        const m = layout(rows, size)
        if (m === null) return null
        const activeX = active === null ? undefined : m.xs[active]
        return (
          <>
            <ChartXAxis ticks={m.xTicks} plot={size.plot} title="Duration" />
            <ChartYAxis ticks={m.yTicks} plot={size.plot} title="Gross metabolic power (W/kg)" />
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
            {m.runPoints.map((point, i) =>
              point ? (
                <circle
                  key={`run-${i}`}
                  data-testid="curve-marker"
                  data-series="run"
                  className="curve-chart__marker curve-chart__marker--run"
                  cx={point.x}
                  cy={point.y}
                  r={i === active ? ACTIVE_MARKER_R : MARKER_R}
                />
              ) : null,
            )}
            {m.ridePoints.map((point, i) =>
              point ? (
                <circle
                  key={`ride-${i}`}
                  data-testid="curve-marker"
                  data-series="ride"
                  className="curve-chart__marker curve-chart__marker--ride"
                  cx={point.x}
                  cy={point.y}
                  r={i === active ? ACTIVE_MARKER_R : MARKER_R}
                />
              ) : null,
            )}
            {endLabels(m).map((label) => (
              <text
                key={label.text}
                className="curve-chart__end-label"
                x={label.x}
                y={label.labelY}
                textAnchor="end"
              >
                {label.text}
              </text>
            ))}
            <PlotSurface
              size={size}
              label="Running and cycling curves. Use the left and right arrow keys to move between durations, Escape to clear"
              onPoint={(point) => setActive(point === null ? null : nearestByX(m.xs, point.x))}
              onKey={(key) => {
                const next = stepActive(active, m.xs.length, key)
                if (next) setActive(next.index)
              }}
              onBlur={() => setActive(null)}
            />
          </>
        )
      }}
    </ChartFrame>
  )
}
