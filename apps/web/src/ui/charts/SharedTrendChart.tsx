import { useState } from 'react'
import { SPORT_PLURAL } from '../sports'
import { ChartFrame } from './ChartFrame'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { GapMarks } from './GapMarks'
import { markerRadii, plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize, TooltipContent, TooltipRow } from './chartTypes'
import type { SharedWeek } from './gradeTrend'
import type { SharedMeasure } from './sharedTrendText'
export type { SharedMeasure } from './sharedTrendText'
import { lastAtOrBefore } from './hover'
import { stepBandPath, stepPath } from './paths'
import { sharedTrendLayout } from './sharedTrendLayout'
import {
  HELD_EMPTY,
  HELD_NOTE,
  copyOf,
  formatValue,
  levelNote,
  singleValueText,
  tableValue,
  withEndedNotes,
  withRideHeld,
} from './sharedTrendText'
import { effortLabel } from '../records'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { axisFontSize } from './ticks'
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

/**
 * A week's tooltip: each sport's value, or a dash and a note where a sport has none that week. A grade's
 * cycling is an estimate, so its key is dashed and its name says so.
 */
function tooltipFor(
  week: SharedWeek,
  x: number,
  y: number,
  measure: SharedMeasure,
  rideKnown: boolean,
): TooltipContent {
  const estimate = measure === 'grade'
  const rideLabel = estimate ? 'Ride, estimated' : 'Ride'
  const rows: TooltipRow[] = [
    week.run === null
      ? { kind: 'run', label: 'Run', value: '—', note: `No ${SPORT_PLURAL.run} in the window` }
      : {
          kind: 'run',
          label: 'Run',
          value: formatValue(measure, week.run),
          note: levelNote(measure, week.run),
        },
  ]
  if (rideKnown) {
    rows.push(
      week.ride === null
        ? {
            kind: 'ride',
            label: rideLabel,
            value: '—',
            note: `No ${SPORT_PLURAL.ride} in the window`,
          }
        : {
            kind: 'ride',
            label: rideLabel,
            value: formatValue(measure, week.ride),
            swatch: estimate ? 'dashed' : 'solid',
            note: levelNote(measure, week.ride),
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
  // The effort is named as its segment's label is, so the title reads "best 20 min", as the sport trend's does.
  const effort = effortLabel(effortS)
  const windowText = windowPhrase(windowDays)
  const copy = copyOf(measure, effort, windowText)
  // Only an age-graded trend grades cycling through its running equivalent, so only it estimates it.
  const estimate = measure === 'grade'
  const hasData = weeks.filter((week) => week.run !== null || week.ride !== null).length >= 2
  // A held ride is one the trend has, which a missing weight keeps off the chart.
  const heldRide = !rideKnown && given.some((week) => week.ride !== null)
  const [active, setActive] = useState<number | null>(null)
  const layoutOf = sizedOnce((size: ChartSize) => sharedTrendLayout(weeks, measure, size))
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
  const note = rideKnown ? copy.note : `${copy.note} ${HELD_NOTE}`
  const columns = [
    'Week ending',
    copy.runHeading,
    ...(rideKnown ? [copy.rideHeading] : []),
    'Runs',
    ...(rideKnown ? ['Rides'] : []),
  ]
  // The count columns are the last ones, and a phone shows the grades alone.
  const counts = rideKnown ? [columns.length - 2, columns.length - 1] : [columns.length - 1]
  // One week with a value is named in a line under the chart's own title, since one point shows no trend.
  const valued = weeks.filter((week) => week.run !== null || week.ride !== null)
  const single = valued.length === 1 ? valued[0] : undefined

  return (
    <ChartFrame
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      title={copy.title}
      description={copy.description}
      legend={single === undefined ? legend : undefined}
      note={hasData ? withEndedNotes(note, weeks) : heldRide ? HELD_NOTE : undefined}
      table={{
        caption: copy.caption,
        columns,
        rows: weeks.map((week) => [
          weekDay(week.endMs),
          week.run === null ? '—' : tableValue(measure, week.run),
          ...(rideKnown ? [week.ride === null ? '—' : tableValue(measure, week.ride)] : []),
          String(week.runCount),
          ...(rideKnown ? [String(week.rideCount)] : []),
        ]),
        phoneHidden: counts,
      }}
      empty={
        single !== undefined
          ? singleValueText(single, measure, rideKnown)
          : hasData
            ? undefined
            : heldRide
              ? HELD_EMPTY
              : (emptyText ?? copy.empty)
      }
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
        const hasBand = m.rideLow.some((point) => point !== null)
        return (
          <>
            <ChartXAxis ticks={m.xTicks} plot={plot} fontSize={axisFontSize(size.width)} />
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
                  r={i === runLatest || i === active ? activeR : markerR}
                />
              ) : null
            })}
            {weeks.map((week, i) => {
              const point = m.ride[i]
              if (!point) return null
              const r = i === rideLatest || i === active ? activeR : markerR
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
            {m.labels.map((label) => (
              <text
                key={label.kind}
                className="chart-series__label"
                textAnchor={label.anchor}
                x={label.at.x}
                y={label.at.y}
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
