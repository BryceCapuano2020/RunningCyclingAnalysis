import { useState } from 'react'
import type { Comparison, ComparisonPoint, Interval } from '../../core/types'
import { formatDuration, formatPercent } from '../../core/units'
import { ChartFrame } from './ChartFrame'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartTooltip } from './ChartTooltip'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import type { AxisTick, ChartSize, Point, TooltipContent, TooltipRow } from './chartTypes'
import { nearestByX, stepActive } from './hover'
import { bandPath, linePath } from './paths'
import { PlotSurface } from './PlotSurface'
import { linearScale, logScale, niceDomain } from './scale'
import './RatioChart.css'

export interface RatioChartProps {
  comparison: Comparison
}

const MIN_DURATION_S = 60
const TICK_DURATIONS_S = [60, 300, 1200, 3600, 7200, 10800]
const ACTIVE_MARKER_R = 5
const EMPTY = 'Add at least one run and one ride to compare them'

const LEGEND_CALIBRATED: ChartLegendEntry[] = [
  { label: 'Before heart-rate check (90% range)', kind: 'neutral' },
  { label: 'After heart-rate check (90% range and median)', kind: 'neutral' },
]

interface RatioRow {
  durationS: number
  prior: ComparisonPoint
  /** Null when the heart-rate check did not produce a value at this duration. */
  calibrated: ComparisonPoint | null
}

/** Signed percentage of running over cycling, for a ratio of running to cycling. */
const delta = (ratio: number): string => formatPercent(ratio - 1, true)

const rangeOf = (interval: Interval): string => `${delta(interval.p05)} to ${delta(interval.p95)}`

function buildRows(comparison: Comparison): RatioRow[] {
  const calibrated = new Map(
    (comparison.calibrated ?? []).map((point): [number, ComparisonPoint] => [
      point.durationS,
      point,
    ]),
  )
  return comparison.prior
    .filter((point) => point.durationS >= MIN_DURATION_S)
    .sort((a, b) => a.durationS - b.durationS)
    .map((prior) => ({
      durationS: prior.durationS,
      prior,
      calibrated: calibrated.get(prior.durationS) ?? null,
    }))
}

interface Series {
  upper: Point[]
  lower: Point[]
  /** Median per row, null where this series has no value. */
  median: (Point | null)[]
}

function seriesOf(
  rows: RatioRow[],
  pick: (row: RatioRow) => Interval | null,
  x: (durationS: number) => number,
  y: (offset: number) => number,
): Series {
  const upper: Point[] = []
  const lower: Point[] = []
  const median = rows.map((row) => {
    const interval = pick(row)
    if (interval === null) return null
    const px = x(row.durationS)
    upper.push({ x: px, y: y(interval.p95 - 1) })
    lower.push({ x: px, y: y(interval.p05 - 1) })
    return { x: px, y: y(interval.p50 - 1) }
  })
  return { upper, lower, median }
}

interface Layout {
  xs: number[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
  zeroY: number
  prior: Series
  calibrated: Series | null
}

function layout(rows: RatioRow[], hasCalibrated: boolean, size: ChartSize): Layout | null {
  const first = rows[0]
  const last = rows[rows.length - 1]
  if (first === undefined || last === undefined) return null
  const { plot } = size
  const x = logScale([first.durationS, last.durationS], [plot.left, plot.right])

  // Offsets from equal (ratio minus one). Zero is always included so the reference line exists.
  const offsets = [0]
  for (const row of rows) {
    for (const interval of [row.prior.ratio, row.calibrated?.ratio]) {
      if (interval) offsets.push(interval.p05 - 1, interval.p95 - 1)
    }
  }
  const { domain, ticks } = niceDomain(offsets, 4)
  const y = linearScale(domain, [plot.bottom, plot.top])

  return {
    xs: rows.map((row) => x(row.durationS)),
    xTicks: TICK_DURATIONS_S.filter(
      (durationS) => durationS >= first.durationS && durationS <= last.durationS,
    ).map((durationS) => ({ position: x(durationS), label: formatDuration(durationS) })),
    yTicks: ticks.map((value) => ({ position: y(value), label: formatPercent(value, true) })),
    zeroY: y(0),
    prior: seriesOf(rows, (row) => row.prior.ratio, x, y),
    calibrated: hasCalibrated ? seriesOf(rows, (row) => row.calibrated?.ratio ?? null, x, y) : null,
  }
}

function tooltipFor(row: RatioRow, x: number, y: number): TooltipContent {
  const prior = row.prior.ratio
  const rows: TooltipRow[] = row.calibrated
    ? [
        {
          kind: 'neutral',
          value: delta(row.calibrated.ratio.p50),
          label: 'median after heart-rate check',
        },
        {
          kind: 'neutral',
          value: rangeOf(row.calibrated.ratio),
          label: '90% range after heart-rate check',
        },
        { kind: 'neutral', value: delta(prior.p50), label: 'median before heart-rate check' },
        { kind: 'neutral', value: rangeOf(prior), label: '90% range before heart-rate check' },
      ]
    : [
        { kind: 'neutral', value: delta(prior.p50), label: 'median' },
        { kind: 'neutral', value: rangeOf(prior), label: '90% range' },
      ]
  return { x, y, title: formatDuration(row.durationS), rows }
}

function tableFor(
  rows: RatioRow[],
  hasCalibrated: boolean,
): { columns: string[]; rows: string[][] } {
  if (!hasCalibrated) {
    return {
      columns: ['Duration', 'Median', '90% range'],
      rows: rows.map((row) => [
        formatDuration(row.durationS),
        delta(row.prior.ratio.p50),
        rangeOf(row.prior.ratio),
      ]),
    }
  }
  return {
    columns: ['Duration', 'Median', '90% range', 'Prior median', 'Prior 90% range'],
    rows: rows.map((row) => {
      const calibrated = row.calibrated?.ratio
      return [
        formatDuration(row.durationS),
        calibrated ? delta(calibrated.p50) : '—',
        calibrated ? rangeOf(calibrated) : '—',
        delta(row.prior.ratio.p50),
        rangeOf(row.prior.ratio),
      ]
    }),
  }
}

export function RatioChart({ comparison }: RatioChartProps) {
  const rows = buildRows(comparison)
  const hasCalibrated = comparison.calibrated !== null
  const [active, setActive] = useState<number | null>(null)

  return (
    <ChartFrame
      title="Running compared with cycling by duration"
      description="Running gross metabolic power as a percentage of cycling at each duration, with 90% ranges. Zero means equal. Duration is on a log scale."
      legend={rows.length > 0 && hasCalibrated ? LEGEND_CALIBRATED : undefined}
      table={tableFor(rows, hasCalibrated)}
      empty={rows.length > 0 ? undefined : EMPTY}
      overlay={(size) => {
        const m = layout(rows, hasCalibrated, size)
        const row = active === null ? undefined : rows[active]
        const anchor =
          m && active !== null
            ? (m.calibrated?.median[active] ?? m.prior.median[active] ?? null)
            : null
        const content = row && anchor ? tooltipFor(row, anchor.x, anchor.y) : null
        return (
          <ChartTooltip bounds={{ width: size.width, height: size.height }} content={content} />
        )
      }}
    >
      {(size) => {
        const m = layout(rows, hasCalibrated, size)
        if (m === null) return null
        const { plot } = size
        const primary = m.calibrated ?? m.prior
        const activeX = active === null ? undefined : m.xs[active]
        const activeMedian = active === null ? null : (primary.median[active] ?? null)
        return (
          <>
            <ChartXAxis ticks={m.xTicks} plot={plot} title="Duration" />
            <ChartYAxis ticks={m.yTicks} plot={plot} title="Running compared with cycling" />
            <path
              data-testid="ratio-band"
              className="ratio-chart__band"
              d={bandPath(m.prior.upper, m.prior.lower)}
            />
            {m.calibrated ? (
              <path
                data-testid="ratio-band"
                className="ratio-chart__band"
                d={bandPath(m.calibrated.upper, m.calibrated.lower)}
              />
            ) : null}
            <path
              data-testid="ratio-median"
              className="ratio-chart__median"
              d={linePath(primary.median)}
            />
            <line
              className="ratio-chart__zero"
              x1={plot.left}
              x2={plot.right}
              y1={m.zeroY}
              y2={m.zeroY}
            />
            <text
              className="ratio-chart__label"
              x={plot.right - 6}
              y={m.zeroY - 6}
              textAnchor="end"
            >
              Equal
            </text>
            <text className="ratio-chart__label" x={plot.left + 8} y={plot.top + 14}>
              Running stronger
            </text>
            <text className="ratio-chart__label" x={plot.left + 8} y={plot.bottom - 8}>
              Cycling stronger
            </text>
            {activeX !== undefined ? (
              <line
                className="ratio-chart__crosshair"
                x1={activeX}
                x2={activeX}
                y1={plot.top}
                y2={plot.bottom}
              />
            ) : null}
            {activeMedian ? (
              <circle
                className="ratio-chart__marker"
                cx={activeMedian.x}
                cy={activeMedian.y}
                r={ACTIVE_MARKER_R}
              />
            ) : null}
            <PlotSurface
              size={size}
              label="Running compared with cycling. Use the left and right arrow keys to move between durations, Escape to clear"
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
