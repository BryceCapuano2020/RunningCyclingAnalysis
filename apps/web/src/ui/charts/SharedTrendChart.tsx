import { useState } from 'react'
import { SPORT_PLURAL } from '../sports'
import { ChartFrame } from './ChartFrame'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { GapMarks } from './GapMarks'
import {
  endLabelAt,
  markerRadii,
  plotSurface,
  pointBefore,
  sizedOnce,
  spreadApart,
  tooltipAt,
  tooltipOverlay,
} from './chartInteraction'
import type { AxisTick, ChartSize, Point, TooltipContent, TooltipRow } from './chartTypes'
import type { SharedWeek } from './gradeTrend'
import type { SharedMeasure } from './sharedTrendText'
import { copyOf, formatValue, levelNote, plotted, rideNote, withRideHeld } from './sharedTrendText'
export type { SharedMeasure } from './sharedTrendText'
import { lastAtOrBefore } from './hover'
import { stepBandPath, stepPath } from './paths'
import { linearScale, niceDomain, tickDecimals } from './scale'
import { axisFontSize, fitTicks } from './ticks'
import { trendDateTicks } from './trendTicks'
import { weekDay, windowPhrase } from './trendText'
import './ChartSeries.css'

export interface SharedTrendChartProps {
  /** One entry per week, in order, each sport's value that week or null. */
  weeks: readonly SharedWeek[]
  measure: SharedMeasure
  /** The trailing window of each value, in days. */
  windowDays: number
  /** The effort length each value is the best of, in seconds. */
  effortS: number
  /** False while the athlete's weight is unknown: cycling is then held, with no value. Default true. */
  rideKnown?: boolean
  /** Replaces the usual empty message, such as the ages the standards cover. */
  emptyText?: string
}

/** A value at the end of a line, labelled with its window, and where its label sits. */
interface EndLabel {
  kind: 'run' | 'ride'
  text: string
  at: Point
}

interface Layout {
  xs: number[]
  run: (Point | null)[]
  ride: (Point | null)[]
  rideLow: (Point | null)[]
  rideHigh: (Point | null)[]
  /** Where each week's tooltip is anchored: beside its first point. */
  ys: (number | null)[]
  labels: EndLabel[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

const LABEL_GAP_PX = 14

function layout(
  weeks: readonly SharedWeek[],
  measure: SharedMeasure,
  windowText: string,
  size: ChartSize,
): Layout | null {
  const first = weeks[0]
  const last = weeks.at(-1)
  if (weeks.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const x = linearScale([first.endMs, last.endMs], [plot.left, plot.right])
  const values = weeks
    .flatMap((week) => [week.run, week.ride, week.rideLow, week.rideHigh])
    .filter((value): value is number => value !== null)
    .map((value) => plotted(measure, value))
  const { domain, ticks } = niceDomain(values, 4, 0.05)
  const decimals = tickDecimals(ticks)
  const y = linearScale(domain, [plot.bottom, plot.top])
  const pointsOf = (pick: (week: SharedWeek) => number | null): (Point | null)[] =>
    weeks.map((week) => {
      const value = pick(week)
      return value === null ? null : { x: x(week.endMs), y: y(plotted(measure, value)) }
    })
  const run = pointsOf((week) => week.run)
  const ride = pointsOf((week) => week.ride)
  const labels = [
    endLabel('run', weeks, run, (week) => week.run, measure, windowText),
    endLabel('ride', weeks, ride, (week) => week.ride, measure, windowText),
  ].flatMap((label) => (label === null ? [] : [label]))
  return {
    xs: weeks.map((week) => x(week.endMs)),
    run,
    ride,
    rideLow: pointsOf((week) => week.rideLow),
    rideHigh: pointsOf((week) => week.rideHigh),
    ys: weeks.map((_, i) => (run[i] ?? ride[i])?.y ?? null),
    labels,
    xTicks: fitTicks(
      trendDateTicks(
        weeks.map((week) => week.endMs),
        x,
      ),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(
      ticks.map((tick) => ({
        position: y(tick),
        label: measure === 'grade' ? `${tick.toFixed(decimals)}%` : tick.toFixed(decimals),
      })),
      { axis: 'y', width },
    ),
  }
}

/**
 * The label at the latest value of one sport, with the window it covers, so that a reader can tell
 * why it differs from the card's best. Null when the sport has no value.
 */
function endLabel(
  kind: 'run' | 'ride',
  weeks: readonly SharedWeek[],
  points: readonly (Point | null)[],
  pick: (week: SharedWeek) => number | null,
  measure: SharedMeasure,
  windowText: string,
): EndLabel | null {
  const latest = points.findLastIndex((point) => point !== null)
  const point = points[latest] ?? null
  const week = weeks[latest]
  const value = week === undefined ? null : pick(week)
  if (point === null || value === null) return null
  return {
    kind,
    text: `${formatValue(measure, value)}, last ${windowText}`,
    at: endLabelAt(point, pointBefore(points, latest)),
  }
}

/** A week's tooltip: each sport's value, or a dash and a note where a sport has none that week. */
function tooltipFor(
  week: SharedWeek,
  x: number,
  y: number,
  measure: SharedMeasure,
  rideKnown: boolean,
): TooltipContent {
  const rows: TooltipRow[] = [
    week.run === null
      ? { kind: 'run', label: 'Running', value: '—', note: `No ${SPORT_PLURAL.run} in the window` }
      : {
          kind: 'run',
          label: 'Running',
          value: formatValue(measure, week.run),
          note: levelNote(measure, week.run),
        },
  ]
  if (rideKnown) {
    rows.push(
      week.ride === null
        ? {
            kind: 'ride',
            label: 'Cycling',
            value: '—',
            note: `No ${SPORT_PLURAL.ride} in the window`,
          }
        : {
            kind: 'ride',
            label: 'Cycling',
            value: formatValue(measure, week.ride),
            note: rideNote(measure, week.ride),
          },
    )
  }
  return { x, y, title: `Week ending ${weekDay(week.endMs)}`, rows }
}

/**
 * Both sports' trend on one scale: each week's best effort of a length, as an age grade or as an
 * energy rate. Running is solid and as recorded. On an age-graded trend, cycling is an estimate
 * through its running equivalent, so it is dashed with a ring at each week, and its range is a band.
 * An energy trend draws cycling as measured.
 */
export function SharedTrendChart({
  weeks: given,
  measure,
  windowDays,
  effortS,
  rideKnown = true,
  emptyText,
}: SharedTrendChartProps) {
  const weeks = rideKnown ? given : given.map(withRideHeld)
  const effort = `${effortS / 60} minutes`
  const windowText = windowPhrase(windowDays)
  const copy = copyOf(measure, effort, windowText)
  // Only an age-graded trend grades cycling through its running equivalent, so only it estimates it.
  const estimate = measure === 'grade'
  const hasData = weeks.filter((week) => week.run !== null || week.ride !== null).length >= 2
  const [active, setActive] = useState<number | null>(null)
  const layoutOf = sizedOnce((size: ChartSize) => layout(weeks, measure, windowText, size))
  const hasRun = weeks.some((week) => week.run !== null)
  const hasRide = weeks.some((week) => week.ride !== null)
  const legend: ChartLegendEntry[] = [
    ...(hasRun ? [{ label: copy.runLegend, kind: 'run' as const, swatch: 'line' as const }] : []),
    ...(hasRide
      ? [
          {
            label: copy.rideLegend,
            kind: 'ride' as const,
            swatch: estimate ? ('dashed' as const) : ('line' as const),
          },
        ]
      : []),
  ]
  const note = rideKnown ? copy.note : `${copy.note} Cycling is held until a weight is added.`

  return (
    <ChartFrame
      title={copy.title}
      description={copy.description}
      legend={legend}
      note={hasData ? note : undefined}
      table={{
        caption: copy.caption,
        columns: [
          'Week ending',
          copy.runHeading,
          ...(rideKnown ? [copy.rideHeading] : []),
          'Runs',
          ...(rideKnown ? ['Rides'] : []),
        ],
        rows: weeks.map((week) => [
          weekDay(week.endMs),
          week.run === null ? '—' : formatValue(measure, week.run),
          ...(rideKnown ? [week.ride === null ? '—' : formatValue(measure, week.ride)] : []),
          String(week.runCount),
          ...(rideKnown ? [String(week.rideCount)] : []),
        ]),
      }}
      empty={hasData ? undefined : (emptyText ?? copy.empty)}
      surface={(size) =>
        plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive, lastAtOrBefore)
      }
      overlay={(size) => {
        const m = layoutOf(size)
        return tooltipOverlay(
          size,
          tooltipAt(
            size,
            m?.xs ?? null,
            active,
            (index, x, y) => {
              const week = weeks[index]
              return week ? tooltipFor(week, x, y, measure, rideKnown) : null
            },
            m?.ys,
          ),
        )
      }}
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const { plot } = size
        const { marker: markerR, active: activeR } = markerRadii(size.width)
        const activeX = active === null ? undefined : m.xs[active]
        const runLatest = m.run.findLastIndex((point) => point !== null)
        const rideLatest = m.ride.findLastIndex((point) => point !== null)
        const spread = spreadApart(
          m.labels.map((label) => label.at.y),
          LABEL_GAP_PX,
        )
        const hasBand = m.rideLow.some((point) => point !== null)
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
              title={copy.axisTitle}
              fontSize={axisFontSize(size.width)}
            />
            <GapMarks
              xs={m.xs}
              gaps={weeks.map((week) => week.run === null && week.ride === null)}
              plot={plot}
            />
            {activeX !== undefined ? <Crosshair x={activeX} plot={plot} /> : null}
            {hasBand ? (
              <path
                data-testid="trend-band"
                className="chart-series__band--ride"
                d={stepBandPath(m.rideHigh, m.rideLow)}
              />
            ) : null}
            <path
              data-testid="trend-line"
              data-sport="run"
              className="chart-series__line chart-series__line--run"
              d={stepPath(m.run)}
            />
            {hasRide ? (
              <path
                data-testid="trend-line"
                data-sport="ride"
                className={`chart-series__line chart-series__line--ride${estimate ? ' chart-series__line--estimate' : ''}`}
                d={stepPath(m.ride)}
              />
            ) : null}
            {weeks.map((week, i) => {
              const point = m.run[i]
              return point ? (
                <circle
                  key={week.endMs}
                  data-testid="trend-marker"
                  data-sport="run"
                  className="chart-series__marker chart-series__marker--run"
                  cx={point.x}
                  cy={point.y}
                  r={i === runLatest ? activeR : markerR}
                />
              ) : null
            })}
            {weeks.map((week, i) => {
              const point = m.ride[i]
              if (!point) return null
              const r = i === rideLatest ? activeR : markerR
              return estimate ? (
                <circle
                  key={week.endMs}
                  data-testid="trend-ring"
                  data-sport="ride"
                  className="chart-series__ring--ride"
                  cx={point.x}
                  cy={point.y}
                  r={r}
                />
              ) : (
                <circle
                  key={week.endMs}
                  data-testid="trend-marker"
                  data-sport="ride"
                  className="chart-series__marker chart-series__marker--ride"
                  cx={point.x}
                  cy={point.y}
                  r={r}
                />
              )
            })}
            {m.labels.map((label, i) => (
              <text
                key={label.kind}
                className="chart-series__label"
                textAnchor="end"
                x={label.at.x}
                y={spread[i]}
              >
                {label.text}
              </text>
            ))}
          </>
        )
      }}
    </ChartFrame>
  )
}
