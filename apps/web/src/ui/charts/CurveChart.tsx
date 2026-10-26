import { useState } from 'react'
import type { Curve } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import {
  ENERGY_RATE_UNIT,
  formatDuration,
  formatEnergyRate,
  formatEnergyRateValue,
  formatPower,
} from '@rca/core/units'
import { SPORT_LABEL, SPORT_NOUN, SPORT_TITLE } from '../sports'
import { ChartFrame } from './ChartFrame'
import { activityCell, sourceNote } from './activityText'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import type { AxisTick, ChartSize, Point, TooltipContent } from './chartTypes'
import {
  diamondPath,
  markerRadii,
  plotSurface,
  sizedOnce,
  spreadApart,
  tooltipAt,
  tooltipOverlay,
} from './chartInteraction'
import { Crosshair } from './Crosshair'
import { durationRows } from './curveRows'
import { runPace } from '../records'
import { linePath } from './paths'
import { linearScale, logScale, niceDomain, tickDecimals } from './scale'
import { NARROW_WIDTH, axisFontSize, durationTicks, fitTicks } from './ticks'
import './ChartSeries.css'

export interface CurveChartProps {
  runCurve: Curve
  rideMetabolicCurve: Curve
  rideCurve: Curve
  units: UnitSystem
  /** Activity id to name. When given, tooltips and the table say which activity each value is from. */
  activityNames?: Record<string, string>
}

/** Right margin that holds the end-of-line labels. */
const LABEL_MARGIN = 64
const LABEL_OFFSET_X = 8
/** Vertical offset that centres a 12 px label on its point. */
const LABEL_BASELINE_OFFSET = 4
const LABEL_MIN_GAP = 14

/** Each sport's key has the shape of its points: a dot for running, a diamond for riding. */
const LEGEND: ChartLegendEntry[] = [
  { label: SPORT_LABEL.run, kind: 'run', swatch: 'dot' },
  { label: SPORT_LABEL.ride, kind: 'ride', swatch: 'diamond' },
]

const TABLE_CAPTION = `Best energy rate (${ENERGY_RATE_UNIT}) for each duration, with the flat pace and power it equals and the activity behind each.`

const TABLE_COLUMNS = [
  'Duration',
  `${SPORT_LABEL.run} energy rate (${ENERGY_RATE_UNIT})`,
  'Flat pace',
  `${SPORT_LABEL.ride} energy rate (${ENERGY_RATE_UNIT})`,
  `${SPORT_LABEL.ride} power`,
  `${SPORT_LABEL.run} activity`,
  `${SPORT_LABEL.ride} activity`,
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

/** One row per duration with a run or a ride value, shortest first. */
function buildRows(runCurve: Curve, rideMetabolicCurve: Curve, rideCurve: Curve): CurveRow[] {
  return durationRows([runCurve, rideMetabolicCurve, rideCurve])
    .map(({ durationS, points: [run, rideWkg, ride] }) => ({
      durationS,
      runWkg: run?.value ?? NaN,
      rideWkg: rideWkg?.value ?? NaN,
      ridePowerW: ride?.value ?? NaN,
      runActivityId: run?.activityId ?? null,
      rideActivityId: rideWkg?.activityId ?? null,
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
    xTicks: fitTicks(durationTicks(first.durationS, last.durationS, x), { axis: 'x', width }),
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
    ends.push({
      text: SPORT_LABEL.run,
      x: run.x + LABEL_OFFSET_X,
      y: run.y + LABEL_BASELINE_OFFSET,
    })
  }
  const ride = lastPoint(m.ridePoints)
  if (ride) {
    ends.push({
      text: SPORT_LABEL.ride,
      x: ride.x + LABEL_OFFSET_X,
      y: ride.y + LABEL_BASELINE_OFFSET,
    })
  }
  const spread = spreadApart(
    ends.map((end) => end.y),
    LABEL_MIN_GAP,
  )
  return ends.map((end, i) => ({ text: end.text, x: end.x, y: spread[i] ?? end.y }))
}

function tableRow(
  row: CurveRow,
  units: UnitSystem,
  names: Record<string, string> | undefined,
): string[] {
  return [
    formatDuration(row.durationS),
    formatEnergyRateValue(row.runWkg),
    runPace(row.runWkg, units),
    formatEnergyRateValue(row.rideWkg),
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
        value: formatEnergyRate(row.runWkg),
        label: SPORT_LABEL.run,
        note: sourceNote(row.runActivityId, names),
      },
      { value: runPace(row.runWkg, units), label: 'Flat pace' },
      {
        kind: 'ride',
        value: formatEnergyRate(row.rideWkg),
        label: SPORT_LABEL.ride,
        note: sourceNote(row.rideActivityId, names),
      },
      { value: formatPower(row.ridePowerW), label: 'Mechanical power' },
    ],
  }
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
  const layoutOf = sizedOnce((size: ChartSize) => layout(rows, size))

  return (
    <ChartFrame
      title={`${SPORT_TITLE.run} and ${SPORT_NOUN.ride} energy rate (${ENERGY_RATE_UNIT}) by duration`}
      description={`Best energy rate in metabolic watts per kilogram for ${SPORT_NOUN.run} and for ${SPORT_NOUN.ride}, on one axis. Duration is on a log scale.`}
      legend={hasData ? LEGEND : undefined}
      table={{
        caption: TABLE_CAPTION,
        columns: TABLE_COLUMNS,
        rows: rows.map((row) => tableRow(row, units, activityNames)),
      }}
      empty={hasData ? undefined : 'Add at least one run and one ride to see both curves'}
      plotRightMargin={(width) => (width < NARROW_WIDTH ? 16 : LABEL_MARGIN)}
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
      overlay={(size) => {
        const m = layoutOf(size)
        // The tooltip sits beside the run's point, or the ride's where there is no run.
        const ys = m?.runPoints.map((point, i) => (point ?? m?.ridePoints[i] ?? null)?.y ?? null)
        return tooltipOverlay(
          size,
          tooltipAt(
            size,
            m?.xs ?? null,
            active,
            (index, x, y) => {
              const row = rows[index]
              return row ? tooltipFor(row, x, y, units, activityNames) : null
            },
            ys,
          ),
        )
      }}
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const narrow = size.width < NARROW_WIDTH
        const { active: activeR } = markerRadii(size.width)
        const activeX = active === null ? undefined : m.xs[active]
        const activeRun = active === null ? undefined : m.runPoints[active]
        const activeRide = active === null ? undefined : m.ridePoints[active]
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
              title={`Energy rate (${ENERGY_RATE_UNIT})`}
              fontSize={axisFontSize(size.width)}
            />
            {activeX !== undefined ? <Crosshair x={activeX} plot={size.plot} /> : null}
            <path
              data-testid="curve-line"
              className="chart-series__line chart-series__line--run"
              d={linePath(m.runPoints)}
            />
            <path
              data-testid="curve-line"
              className="chart-series__line chart-series__line--ride"
              d={linePath(m.ridePoints)}
            />
            {/* Markers only on the duration the reader is on: a dot at every duration breaks the lines. */}
            {activeRun ? (
              <circle
                data-testid="curve-marker"
                data-series="run"
                className="chart-series__marker chart-series__marker--run"
                cx={activeRun.x}
                cy={activeRun.y}
                r={activeR}
              />
            ) : null}
            {activeRide ? (
              <path
                data-testid="curve-marker"
                data-series="ride"
                data-shape="diamond"
                className="chart-series__marker chart-series__marker--ride"
                d={diamondPath(activeRide.x, activeRide.y, activeR)}
              />
            ) : null}
            {narrow
              ? null
              : endLabels(m).map((label) => (
                  <text key={label.text} className="chart-series__label" x={label.x} y={label.y}>
                    {label.text}
                  </text>
                ))}
          </>
        )
      }}
    </ChartFrame>
  )
}
