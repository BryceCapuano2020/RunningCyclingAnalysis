import { useState } from 'react'
import type { Lack, SameHeartRate, SameHeartRateWeek } from '@rca/core/digest'
import { SAME_HEART_RATE } from '@rca/core/constants'
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
import type { ChartSize, TooltipContent } from './chartTypes'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { sameHeartRateLayout } from './sameHeartRateLayout'
import { axisTitle, formatNative, nativeLabel, plottedValue } from './sportAxis'
import { axisFontSize } from './ticks'
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

const weekHasFit = (week: SameHeartRateWeek): boolean => week.fit !== null

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
 * What the empty chart says when no week has a reading: the gate that failed, with its numbers. A week reads from
 * steady 5-minute stretches in enough activities over enough of its weeks, and the chart wants several such weeks.
 */
const NO_WEEKS_TEXT = `No week has a reading yet: a week needs ${SAME_HEART_RATE.minBlocks} steady 5-minute stretches from ${SAME_HEART_RATE.minActivities} activities in ${SAME_HEART_RATE.minWeeks} different weeks, and the chart needs ${SAME_HEART_RATE.minReportedWeeks} weeks with a reading`

/**
 * One sport's output at one heart rate: a light dot for each week that reports, with its 90% interval in the tooltip
 * and table, and a mark on the date axis for a week with too little data. There is no fitted line and no finding:
 * the weekly windows overlap and the level wanders, so a line through them would claim a trend the data cannot
 * show, and the fitness status is the sport's voice on change. Rides are diamonds.
 */
export function SameHeartRateChart({ sport, data, units, note }: SameHeartRateChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const { weeks, referenceHeartRate: reference } = data
  const hasData = reference !== null && weeks.filter(weekHasFit).length >= 2
  const layoutOf = sizedOnce((size: ChartSize) => sameHeartRateLayout(weeks, sport, units, size))
  const diamond = SPORT_FORMAT[sport].glyph === 'diamond'
  const title = sameHeartRateTitle(sport, reference ?? 0, units)

  return (
    <ChartFrame
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      title={title}
      description={`Output at ${reference} bpm in each week, fitted to the steady stretches of the 4 weeks to that Sunday, as ${SPORT_FORMAT[sport].titleUnit(units)}.`}
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
      empty={hasData ? undefined : NO_WEEKS_TEXT}
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
            layoutOf(size)?.dots.map((dot) => dot?.y ?? null),
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
          <g data-sport={sport}>
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
                  {diamond ? (
                    <path
                      data-testid="same-hr-marker"
                      data-shape="diamond"
                      className={`chart-series__marker chart-series__marker--${sport} chart-series__marker--light`}
                      d={diamondPath(dot.x, dot.y, r + 1)}
                    />
                  ) : (
                    <circle
                      data-testid="same-hr-marker"
                      data-shape="circle"
                      className={`chart-series__marker chart-series__marker--${sport} chart-series__marker--light`}
                      cx={dot.x}
                      cy={dot.y}
                      r={r}
                    />
                  )}
                </g>
              )
            })}
          </g>
        )
      }}
    </ChartFrame>
  )
}
