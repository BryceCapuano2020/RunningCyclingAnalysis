import { useState } from 'react'
import type { Lack, SameHeartRate, SameHeartRateWeek } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { plural } from '../components/plural'
import { LACK_TEXT, sameHeartRateTitle } from '../sameHeartRateCopy'
import { SPORT_FORMAT, SPORT_LABEL, SPORT_PLURAL } from '../sports'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { GapMarks } from './GapMarks'
import {
  diamondPath,
  markerRadii,
  plotSurface,
  sizedOnce,
  tooltipAt,
  tooltipOverlay,
} from './chartInteraction'
import type { AxisTick, ChartSize, Point, TooltipContent } from './chartTypes'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { linearScale } from './scale'
import { axisTitle, formatNative, nativeLabel, plottedValue, sportYAxis } from './sportAxis'
import { axisFontSize, fitTicks } from './ticks'
import { trendDateTicks } from './trendTicks'
import { weekDay } from './trendText'
import './ChartSeries.css'

export interface SameHeartRateChartProps {
  sport: Sport
  /** The sport's weeks and reference heart rate. The reference is not null where a chart is drawn. */
  data: SameHeartRate
  units: UnitSystem
  /** Muted text under the plot: how to read it, and what it does not count. */
  note: string
}

interface Layout {
  xs: number[]
  /** Where each reported week's dot sits, and the ends of its interval; null for a week with none. */
  dots: ({ at: Point; top: number; bottom: number } | null)[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/** The axis spans at least this share of the middle reading either way: the size of change worth a look. */
const AXIS_FLOOR = 0.05

const weekHasFit = (week: SameHeartRateWeek): boolean => week.fit !== null

function layout(
  weeks: readonly SameHeartRateWeek[],
  sport: Sport,
  units: UnitSystem,
  size: ChartSize,
): Layout | null {
  const first = weeks[0]
  const last = weeks.at(-1)
  if (weeks.length < 2 || first === undefined || last === undefined) return null
  const { plot, width } = size
  const x = linearScale([first.endMs, last.endMs], [plot.left, plot.right])
  // Both ends of every interval set the axis, so no bar is cut off. Nothing is filled, so the axis is tight,
  // but it always covers a 5% change either way of the middle reading, so that a steady output reads as steady.
  const ends = weeks.flatMap((week) => (week.fit === null ? [] : [week.fit.low, week.fit.high]))
  const middle = (Math.min(...ends) + Math.max(...ends)) / 2
  const plotted = [...ends, middle * (1 - AXIS_FLOOR), middle * (1 + AXIS_FLOOR)].map((value) =>
    plottedValue(sport, value, units),
  )
  const { y, ticks } = sportYAxis(sport, plotted, plot, true)
  return {
    xs: weeks.map((week) => x(week.endMs)),
    dots: weeks.map((week) => {
      if (week.fit === null) return null
      const { output, low, high } = week.fit
      const [a, b] = [low, high].map((value) => y(plottedValue(sport, value, units)))
      return {
        at: { x: x(week.endMs), y: y(plottedValue(sport, output, units)) },
        top: Math.min(a!, b!),
        bottom: Math.max(a!, b!),
      }
    }),
    xTicks: fitTicks(
      trendDateTicks(
        weeks.map((week) => week.endMs),
        x,
      ),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(ticks, { axis: 'y', width }),
  }
}

/** The 90% interval as text, the lower number first as the axis reads: "5:24 /km to 5:44 /km", "194 W to 206 W". */
function rangeText(week: SameHeartRateWeek, sport: Sport, units: UnitSystem): string {
  if (week.fit === null) return '—'
  const [first, second] = [week.fit.low, week.fit.high].sort(
    (a, b) => plottedValue(sport, a, units) - plottedValue(sport, b, units),
  )
  return `${formatNative(sport, first!, units)} to ${formatNative(sport, second!, units)}`
}

function tooltipFor(
  week: SameHeartRateWeek,
  x: number,
  y: number,
  sport: Sport,
  units: UnitSystem,
  referenceHr: number,
): TooltipContent {
  const lacks: Lack | null = week.lacks
  return {
    x,
    y,
    title: `Week ending ${weekDay(week.endMs)}`,
    rows: [
      {
        kind: sport,
        label: `${nativeLabel(sport)} at ${referenceHr} bpm`,
        value: formatNative(sport, week.fit?.output ?? Number.NaN, units),
        note:
          lacks === null
            ? `90% range ${rangeText(week, sport, units)}; ${plural(week.blocks, 'stretch', 'stretches')} from ${plural(week.activities, SPORT_LABEL[sport].toLowerCase(), SPORT_PLURAL[sport])}`
            : LACK_TEXT[lacks](sport, referenceHr),
      },
    ],
  }
}

/**
 * One sport's output at one heart rate, a dot for each week that reports with its 90% interval as a
 * thin bar, and no line between them: a line would claim the weeks in between, and the bars are
 * the point. A week with too little data has no dot and a mark on the date axis. Rides are diamonds.
 */
export function SameHeartRateChart({ sport, data, units, note }: SameHeartRateChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const { weeks, referenceHeartRate: reference } = data
  const hasData = reference !== null && weeks.filter(weekHasFit).length >= 2
  const layoutOf = sizedOnce((size: ChartSize) => layout(weeks, sport, units, size))
  const diamond = SPORT_FORMAT[sport].glyph === 'diamond'
  const title = sameHeartRateTitle(sport, reference ?? 0, units)

  return (
    <ChartFrame
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      title={title}
      description={`Output at ${reference} bpm in each week, fitted to the steady stretches of the 4 weeks to that Sunday, as ${SPORT_FORMAT[sport].titleUnit(units)}, with its 90% range.`}
      note={note}
      table={{
        columns: ['Week ending', nativeLabel(sport), '90% range', 'Stretches'],
        rows: weeks.map((week) => [
          weekDay(week.endMs),
          formatNative(sport, week.fit?.output ?? Number.NaN, units),
          rangeText(week, sport, units),
          String(week.blocks),
        ]),
        caption: `Output at ${reference} bpm, fitted to the steady 5-minute stretches of the 4 weeks to each Sunday. A week with too little data has no value.`,
        phoneHidden: [3],
      }}
      empty={hasData ? undefined : 'Not enough weeks with a reading to draw'}
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(
            size,
            layoutOf(size)?.xs ?? null,
            active,
            (index, x, y) => {
              const week = weeks[index]
              return week && reference !== null
                ? tooltipFor(week, x, y, sport, units, reference)
                : null
            },
            layoutOf(size)?.dots.map((dot) => dot?.at.y ?? null),
          ),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const { plot } = size
        const { marker: markerR, active: activeR } = markerRadii(size.width)
        const activeX = active === null ? undefined : m.xs[active]
        return (
          <>
            <ChartXAxis ticks={m.xTicks} plot={plot} fontSize={axisFontSize(size.width)} />
            <ChartYAxis
              ticks={m.yTicks}
              plot={plot}
              title={axisTitle(sport, units)}
              fontSize={axisFontSize(size.width)}
            />
            <GapMarks xs={m.xs} gaps={weeks.map((week) => week.fit === null)} plot={plot} />
            {activeX !== undefined ? <Crosshair x={activeX} plot={plot} /> : null}
            {m.dots.map((dot, i) => {
              const week = weeks[i]
              if (dot === null || week === undefined) return null
              const r = i === active ? activeR : markerR
              return (
                <g key={week.endMs} data-testid="same-hr-week">
                  <line
                    data-testid="same-hr-interval"
                    data-sport={sport}
                    className="chart-series__interval"
                    x1={dot.at.x}
                    x2={dot.at.x}
                    y1={dot.top}
                    y2={dot.bottom}
                  />
                  {diamond ? (
                    <path
                      data-testid="same-hr-marker"
                      data-shape="diamond"
                      className={`chart-series__marker chart-series__marker--${sport}`}
                      d={diamondPath(dot.at.x, dot.at.y, r + 1)}
                    />
                  ) : (
                    <circle
                      data-testid="same-hr-marker"
                      data-shape="circle"
                      className={`chart-series__marker chart-series__marker--${sport}`}
                      cx={dot.at.x}
                      cy={dot.at.y}
                      r={r}
                    />
                  )}
                </g>
              )
            })}
          </>
        )
      }}
    </ChartFrame>
  )
}
