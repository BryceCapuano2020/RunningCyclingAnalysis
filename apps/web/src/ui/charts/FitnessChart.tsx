import { useState } from 'react'
import type { FitnessPoint, FitnessStatus } from '@rca/core/fitness'
import type { UnitSystem } from '@rca/core/units'
import { FITNESS_WORDS } from '../fitnessWords'
import { formatMonthName } from '../format/date'
import { ChartAnnotations } from './ChartAnnotations'
import { lineObstacles } from './annotations'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { insideLabelBoxes } from './yAxisLabels'
import { Crosshair } from './Crosshair'
import { markerRadii, plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize, TooltipContent } from './chartTypes'
import { fitnessLayout } from './fitnessChartLayout'
import { bandPath, linePath } from './paths'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { axisTitle, formatNative, nativeLabel, plottedValue } from './sportAxis'
import { axisFontSize } from './ticks'
import { shortDate } from './trendTicks'
import './ChartSeries.css'
import './FitnessChart.css'

export interface FitnessChartProps {
  status: FitnessStatus
  units: UnitSystem
}

/** A chart at least this wide, px, keeps a right gutter for the reference line's value and the end label. */
const WIDE_CHART_PX = 560
const GUTTER_PX = 96
/** Narrower, the plot still stops this far from the edge, so the ring for now is not cut off. */
const EDGE_PX = 24
/** How thick, px, the level's line is as an obstacle to text: wider than its stroke, so a label sits clear of it. */
const LINE_CLEARANCE_PX = 16
/** How far the onset's label sits from its rule, px. */
const ONSET_LABEL_GAP = 6
/** How far above the plot's floor the onset's label sits, px: clear of the date ticks below the plot, and of the level, which is higher. */
const ONSET_LABEL_LIFT = 8
/** The room a label needs left of its rule, px. */
const ONSET_LABEL_ROOM_PX = 90

/** The two ends of a point's range as text, the faster first as the axis reads: "7:12 /km to 7:40 /km". */
function rangeText(p: FitnessPoint, status: FitnessStatus, units: UnitSystem): string {
  const [first, second] = [p.low, p.high].sort(
    (a, b) => plottedValue(status.sport, a, units) - plottedValue(status.sport, b, units),
  )
  return `${formatNative(status.sport, first!, units)} to ${formatNative(status.sport, second!, units)}`
}

/** The month a change began, with its year when it is not the year the status is as of: a change years old names its year. */
function onsetMonth(status: FitnessStatus, onsetMs: number): string {
  const older = new Date(onsetMs).getUTCFullYear() !== new Date(status.asOfMs).getUTCFullYear()
  return formatMonthName(utcNoon(onsetMs), older)
}

/** What the line is read against, in the words the chart's reference label and table use. */
function referenceLabel(status: FitnessStatus): string {
  return status.onsetMs === null ? 'Earlier level' : `Before ${onsetMonth(status, status.onsetMs)}`
}

/** Local noon on the UTC date of a moment, so a month is named by the UTC calendar the weeks use. */
const utcNoon = (ms: number) => {
  const d = new Date(ms)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12).getTime()
}

/**
 * What the empty chart says: which of its two needs failed. A line needs two steps four weeks apart, and the
 * reference line needs an earlier level to stand at.
 */
function emptyText(steps: number, before: number | null): string | undefined {
  if (steps < 2) {
    return `A line needs 2 steps four weeks apart; ${steps === 0 ? 'there are none yet' : 'there is 1 so far'}`
  }
  return before === null
    ? 'The reference line needs an earlier level to stand at, and there is none yet'
    : undefined
}

/**
 * The level over time, as the evidence behind a fitness status: a hollow ring and a shaded 90% range for
 * each four-week step (a level is an estimate, which is drawn as a ring and a band), the frozen level it is
 * read against as a labelled line, the month the change began as a rule, and now as the largest ring with
 * its value. The chart is named by what it plots, the status's own sentence is the finding.
 */
export function FitnessChart({ status, units }: FitnessChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const { series, sport, referenceHr: hr, before, now } = status
  const layoutOf = sizedOnce((size: ChartSize) => fitnessLayout(status, units, size))
  const word = FITNESS_WORDS[sport].output
  const reference = referenceLabel(status)
  const tooltipFor = (index: number, x: number, y: number): TooltipContent | null => {
    const p = series[index]
    if (p === undefined) return null
    return {
      x,
      y,
      title: `The ${p.weeks} weeks to ${shortDate(p.atMs)}`,
      rows: [
        {
          kind: sport,
          label: `${word} at ${hr} bpm`,
          value: formatNative(sport, p.value, units),
          note: `90% range ${rangeText(p, status, units)}; ${p.runs} ${FITNESS_WORDS[sport].steadyPlural}`,
        },
      ],
    }
  }
  return (
    <ChartFrame
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      title={`${word} at ${hr} bpm over time`}
      description={`${nativeLabel(sport)} at ${hr} bpm at steps four weeks apart, each read over the 4 to 16 weeks to it and given with its 90% range, against the level before the change${status.onsetMs === null ? '' : ` began in ${onsetMonth(status, status.onsetMs)}`} and the level now.`}
      plotRightMargin={(width) => (width >= WIDE_CHART_PX ? GUTTER_PX : EDGE_PX)}
      summary={{
        columns: ['Level', 'Value'],
        rows: [
          [reference, before === null ? '—' : formatNative(sport, before, units)],
          ...(status.onsetMs === null
            ? []
            : [['Change began', formatMonthName(utcNoon(status.onsetMs), true)]]),
          ['Now', now === null ? '—' : formatNative(sport, now, units)],
        ],
        textColumns: [0, 1],
      }}
      table={{
        columns: ['Weeks to', nativeLabel(sport), '90% range', FITNESS_WORDS[sport].steadyPlural],
        rows: series.map((p) => [
          `${p.weeks} weeks to ${shortDate(p.atMs)}`,
          formatNative(sport, p.value, units),
          rangeText(p, status, units),
          String(p.runs),
        ]),
        caption: `${word} at ${hr} bpm at steps four weeks apart. A step is read from the ${FITNESS_WORDS[sport].steadyPlural} of the 4 to 16 weeks to its date, the fewest that hold enough of them.`,
        phoneHidden: [3],
      }}
      empty={emptyText(series.length, before)}
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(
            size,
            layoutOf(size)?.xs ?? null,
            active,
            tooltipFor,
            layoutOf(size)?.line.map((p) => p.y),
          ),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null || before === null) return null
        const { plot } = size
        const { marker: markerR } = markerRadii(size.width)
        const activeX = active === null ? undefined : m.xs[active]
        // The label sits at the foot of the plot, left of its rule, where the earlier level (higher up) leaves it clear, unless there is no room there.
        const onsetRight = m.onsetX !== null && m.onsetX - plot.left < ONSET_LABEL_ROOM_PX
        return (
          <g data-sport={sport}>
            <ChartXAxis ticks={m.xTicks} plot={plot} fontSize={axisFontSize(size.width)} />
            <ChartYAxis
              ticks={m.yTicks}
              plot={plot}
              title={axisTitle(sport, units)}
              fontSize={axisFontSize(size.width)}
            />
            {m.onsetX === null ? null : (
              <g data-testid="fitness-onset">
                <line
                  className="fitness-chart__onset"
                  x1={m.onsetX}
                  x2={m.onsetX}
                  y1={plot.top}
                  y2={plot.bottom}
                />
                <text
                  className="annot__text annot__text--label"
                  x={m.onsetX + (onsetRight ? ONSET_LABEL_GAP : -ONSET_LABEL_GAP)}
                  y={plot.bottom - ONSET_LABEL_LIFT}
                  textAnchor={onsetRight ? 'start' : 'end'}
                >
                  {`Began ${onsetMonth(status, status.onsetMs!)}`}
                </text>
              </g>
            )}
            {activeX !== undefined ? <Crosshair x={activeX} plot={plot} /> : null}
            <path
              data-testid="fitness-band"
              className="chart-series__area chart-series__area--trend"
              d={bandPath(m.upper, m.lower)}
            />
            <path
              data-testid="fitness-line"
              className={`chart-series__line chart-series__line--${sport}`}
              d={linePath(m.line)}
            />
            {m.line.slice(0, -1).map((p, i) => (
              <circle
                key={series[i]!.atMs}
                data-testid="fitness-point"
                className={`chart-series__ring--${sport}`}
                cx={p.x}
                cy={p.y}
                r={i === active ? markerR + 2 : markerR}
              />
            ))}
            <circle
              data-testid="fitness-now"
              className={`chart-series__ring--${sport} fitness-chart__now`}
              cx={m.now.x}
              cy={m.now.y}
              r={markerR + 3}
            />
            <ChartAnnotations
              size={size}
              obstacles={lineObstacles(m.line, LINE_CLEARANCE_PX)}
              // The level's labels, where a phone sets them inside the plot, are not to be written over.
              ticks={insideLabelBoxes(
                m.yTicks,
                plot,
                axisTitle(sport, units),
                axisFontSize(size.width),
              )}
              annotations={[
                {
                  kind: 'reference',
                  id: 'before',
                  y: m.referenceY,
                  label: reference,
                  estimated: true,
                  value: formatNative(sport, before, units),
                },
                {
                  kind: 'end',
                  id: 'now',
                  optional: true,
                  tone: sport,
                  at: m.now,
                  text: now === null ? '' : formatNative(sport, now, units),
                  sub: 'now',
                },
              ]}
            />
            {/* The level's labels again, over the reference line, so a line across one does not strike it through. */}
            <ChartYAxis
              ticks={m.yTicks}
              plot={plot}
              title={axisTitle(sport, units)}
              fontSize={axisFontSize(size.width)}
              labelsOnly
            />
          </g>
        )
      }}
    </ChartFrame>
  )
}
