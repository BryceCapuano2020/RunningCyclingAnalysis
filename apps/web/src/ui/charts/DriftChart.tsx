import { useState } from 'react'
import { LATE_IN_EFFORT } from '@rca/core/constants'
import type { DriftPoint } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { formatDay, formatDayMonth } from '../format/date'
import { DECOUPLING_REFERENCE, driftChange, driftDescription } from '../lateInEffort'
import { SPORT_PLURAL } from '../sports'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { SportMark } from './SportMark'
import { markerRadii, plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { linearScale, niceDomain } from './scale'
import { axisFontSize, fitTicks } from './ticks'
import './ChartSeries.css'
import './LateInEffort.css'

export interface DriftChartProps {
  sport: Sport
  /** Every steady effort of the period, earliest first. */
  points: readonly DriftPoint[]
  /** Each activity's name by id, for the tooltip and the table. */
  names: Readonly<Record<string, string>>
  /** The finding, set as the chart's title. */
  takeaway: string
  /** The middle effort's decoupling in percent, a fall being positive: drawn as a line across the dots. */
  medianPct: number
  /** Muted text under the plot: how a dot is made, and what drift does not say. */
  note: string
}

/** A chart at least this wide, px, keeps a right gutter for the median's label. */
const WIDE_CHART_PX = 640
const GUTTER_PX = 96
const Y_INTERVALS = 4
/** Dates labelled along the axis, before thinning: the first, the last, and evenly between. */
const DATE_TICKS = 3

interface Layout {
  xs: number[]
  dots: Point[]
  referenceY: number
  medianY: number
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/** A steady effort's change in output per heartbeat, in percent: negative when it fell, so a fall is down. */
function changeOf(point: DriftPoint): number {
  return -point.decouplingPct
}

function layout(points: readonly DriftPoint[], medianPct: number, size: ChartSize): Layout | null {
  const first = points[0]
  const last = points.at(-1)
  if (first === undefined || last === undefined) return null
  const { plot, width } = size
  // The reference and zero lines are always on the axis, so a change is read against both.
  const { domain, ticks } = niceDomain(
    [...points.map(changeOf), -medianPct, 0, -LATE_IN_EFFORT.referenceDecouplingPct],
    Y_INTERVALS,
    0.1,
  )
  const y = linearScale(domain, [plot.bottom, plot.top])
  // Dots stay clear of the plot's edges; a period of one day puts them all in the middle.
  const x = linearScale(
    [first.startMs, Math.max(last.startMs, first.startMs + 1)],
    [plot.left + 8, plot.right - 8],
  )
  const span = last.startMs - first.startMs
  const dateTicks =
    span === 0
      ? [first.startMs]
      : Array.from({ length: DATE_TICKS + 1 }, (_, i) => first.startMs + (span * i) / DATE_TICKS)
  return {
    xs: points.map((p) => x(p.startMs)),
    dots: points.map((p) => ({ x: x(p.startMs), y: y(changeOf(p)) })),
    referenceY: y(-LATE_IN_EFFORT.referenceDecouplingPct),
    medianY: y(-medianPct),
    xTicks: fitTicks(
      dateTicks.map((ms) => ({ position: x(ms), label: formatDayMonth(ms) })),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      ticks.map((value) => ({ position: y(value), label: `${value}%` })),
      { axis: 'y', width },
    ),
  }
}

/** A steady effort's change as a table cell: "Fell 3%", "Rose 2%", "Held level". */
function changeCell(point: DriftPoint): string {
  const text = driftChange(point.decouplingPct)
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

/**
 * A dot for each steady effort: how much its output per heartbeat changed from the first half to the
 * second, by date, a fall below zero, with a line at the median across them and the finding as the title. A dashed line at the common 5% fall reference is named in the key. No line joins the
 * dots, since a line would claim the efforts between them.
 */
export function DriftChart({ sport, points, names, takeaway, medianPct, note }: DriftChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const layoutOf = sizedOnce((size: ChartSize) => layout(points, medianPct, size))
  const nameOf = (point: DriftPoint) => names[point.activityId] ?? formatDay(point.startMs)
  return (
    <ChartFrame
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      title={`Change in output per heartbeat on steady ${SPORT_PLURAL[sport]}, first half to second`}
      takeaway={takeaway}
      description={driftDescription(sport)}
      plotRightMargin={(width) => (width >= WIDE_CHART_PX ? GUTTER_PX : undefined)}
      legend={[{ label: DECOUPLING_REFERENCE, kind: 'neutral', swatch: 'dashed' }]}
      note={note}
      table={{
        columns: ['Date', 'Activity', 'Change', 'Moving time'],
        rows: points.map((point) => [
          formatDay(point.startMs),
          nameOf(point),
          changeCell(point),
          formatDuration(point.durationS),
        ]),
        caption: 'Output per heartbeat, first half of each steady effort against the second.',
        textColumns: [1],
        phoneHidden: [1, 3],
      }}
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(
            size,
            layoutOf(size)?.xs ?? null,
            active,
            (index, x, y) => {
              const point = points[index]
              return point === undefined
                ? null
                : {
                    x,
                    y,
                    title: formatDay(point.startMs),
                    rows: [
                      {
                        kind: sport,
                        label: nameOf(point),
                        value: `Output per heartbeat ${driftChange(point.decouplingPct)}`,
                        note: `${formatDuration(point.durationS)} of moving time`,
                      },
                    ],
                  }
            },
            layoutOf(size)?.dots.map((dot) => dot.y),
          ),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const { plot } = size
        const { marker, active: activeR } = markerRadii(size.width)
        const fontSize = axisFontSize(size.width)
        const wide = size.width >= WIDE_CHART_PX
        const activeX = active === null ? undefined : m.xs[active]
        return (
          <g data-sport={sport}>
            <ChartXAxis ticks={m.xTicks} plot={plot} fontSize={fontSize} />
            <ChartYAxis
              ticks={m.yTicks}
              plot={plot}
              title="Change in output per heartbeat (%)"
              fontSize={fontSize}
            />
            <line
              data-testid="drift-reference"
              className="drift-chart__reference"
              x1={plot.left}
              x2={plot.right}
              y1={m.referenceY}
              y2={m.referenceY}
            />
            {/* The middle effort, as a line across the dots: what most of them did, in the sport's colour. */}
            <line
              data-testid="drift-median"
              className="drift-chart__median"
              x1={plot.left}
              x2={plot.right}
              y1={m.medianY}
              y2={m.medianY}
            />
            {/* In the right margin where the chart is wide; over the line's left end where it is not. */}
            <text
              className="drift-chart__median-label"
              x={wide ? plot.right + 8 : plot.left + 4}
              y={wide ? m.medianY : m.medianY - 6}
              dominantBaseline={wide ? 'central' : undefined}
            >
              {`Median: ${driftChange(medianPct)}`}
            </text>
            {activeX === undefined ? null : <Crosshair x={activeX} plot={plot} />}
            {points.map((point, i) => (
              <SportMark
                key={point.activityId}
                sport={sport}
                x={m.dots[i]!.x}
                y={m.dots[i]!.y}
                r={i === active ? activeR : marker}
                testId="drift-dot"
              />
            ))}
          </g>
        )
      }}
    </ChartFrame>
  )
}
