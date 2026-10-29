import { useMemo, useState } from 'react'
import type { Sport } from '@rca/core/types'
import type { TimeAxis } from '@rca/core/digest/trendSeries'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { AxisBreaks } from './AxisBreaks'
import { ChartAbout } from './ChartAbout'
import { ChartAnnotations } from './ChartAnnotations'
import { plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize } from './chartTypes'
import { useChartHeight, useNarrowChart } from './chartHeight'
import type { SharedWeek } from './gradeTrend'
import { nearestByX } from './hover'
import { smoothBandPath, smoothLinePath } from './smoothPath'
import { trendGutter } from './sharedTrendGutter'
import { sharedTrendLayout } from './sharedTrendLayout'
import { isolatedMarks, marksOf } from './sharedTrendMarks'
import { legendOf, tableRowOf, tooltipFor } from './sharedTrendParts'
import { trendRowsOf } from './sharedTrendRows'
import {
  BREAK_NOTE,
  HELD_EMPTY,
  HELD_NOTE,
  MONTHLY_NOTE,
  MONTHLY_ROWS,
  copyOf,
  endedNotes,
  singleValueText,
  trendNotes,
  withRideHeld,
} from './sharedTrendText'
import { effortLabel } from '../records'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { axisFontSize } from './ticks'
import { trendTakeaway } from './trendTakeaway'
import { axisGapDescription, axisGapNote, axisGapTable } from './trendGap'
import { windowPhrase } from './trendText'
import './ChartHeadings.css'
import './ChartSeries.css'
import './SharedTrendChart.css'

export interface SharedTrendChartProps {
  /** One entry per week, in order, each sport's age grade that week or null. */
  weeks: readonly SharedWeek[]
  /** The trailing window of each value, in days. */
  windowDays: number
  /** The effort length each value is the best of, in seconds. */
  effortS: number
  /** False while the athlete's weight is unknown: cycling is then held, with no value. Default true. */
  rideKnown?: boolean
  /** Replaces the usual empty message, such as the ages the standards cover. */
  emptyText?: string
  /** Each sport's latest activity of any length in the library, or null: a line that stops early is dated by it. */
  latestStartMs: Record<Sport, number | null>
  /** The time axis a chart under this one shares, so the two skip the same years; the weeks' own when not given. */
  axis?: TimeAxis | null
}

/**
 * Both sports' age-grade trend on one scale: each week's best effort of a length, smoothed, and by the month past 26
 * weeks. Running is solid and as recorded. Cycling is an estimate through its running equivalent: a ring at each point
 * and a band for its 90% range. The title says what the trend found about now.
 */
export function SharedTrendChart({
  weeks: given,
  windowDays,
  effortS,
  rideKnown = true,
  emptyText,
  latestStartMs,
  axis,
}: SharedTrendChartProps) {
  const weekly = useMemo(() => (rideKnown ? given : given.map(withRideHeld)), [given, rideKnown])
  const data = useMemo(() => trendRowsOf(weekly, axis), [weekly, axis])
  const { rows, monthly } = data
  const effort = effortLabel(effortS)
  const windowText = windowPhrase(windowDays)
  const copy = copyOf(effort, windowText)
  const hasData = rows.filter((week) => week.run !== null || week.ride !== null).length >= 2
  // A held ride is one the trend has, which a missing weight keeps off the chart.
  const heldRide = !rideKnown && given.some((week) => week.ride !== null)
  const [active, setActive] = useState<number | null>(null)
  const height = useChartHeight()
  const layoutOf = sizedOnce((size: ChartSize) => sharedTrendLayout(data, size))
  const hasRun = rows.some((week) => week.run !== null)
  const hasRide = rows.some((week) => week.ride !== null)
  const hasBand = rows.some((week) => week.rideLow !== null)
  const broken = [...data.breaks.run, ...data.breaks.ride].some(Boolean)
  const narrow = useNarrowChart()
  const gaps = data.axis?.gaps ?? []
  const about = [
    ...trendNotes(windowText),
    ...(broken ? [BREAK_NOTE] : []),
    ...(monthly ? [MONTHLY_NOTE] : []),
    ...(axisGapNote(gaps) ?? []),
    ...endedNotes(rows, latestStartMs),
  ]
  const columns = [
    monthly ? 'Month to' : 'Week ending',
    copy.runHeading,
    ...(rideKnown ? [copy.rideHeading] : []),
    'Runs',
    ...(rideKnown ? ['Rides'] : []),
  ]
  // The count columns are the last ones, and a phone shows the grades alone.
  const counts = rideKnown ? [columns.length - 2, columns.length - 1] : [columns.length - 1]
  // One row with a value is named in a line under the chart's own title, since one point shows no trend.
  const valued = rows.filter((week) => week.run !== null || week.ride !== null)
  const single = valued.length === 1 ? valued[0] : undefined
  // Judged on the weeks, not the months, so the latest week is compared with weeks.
  const takeaway = useMemo(() => trendTakeaway(data.weekly, { rideKnown }), [data, rideKnown])
  const legend = legendOf(copy, hasRun, hasRide, hasBand)
  const gutter = useMemo(() => trendGutter(given, rideKnown, axis), [given, rideKnown, axis])

  return (
    <div className="takeaway-chart">
      <ChartFrame
        height={height}
        plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
        plotRightMargin={gutter}
        title={hasData && takeaway !== null ? takeaway : copy.title}
        lede={hasData && takeaway !== null ? copy.title : undefined}
        description={`${copy.description}${axisGapDescription(gaps)}`}
        // Wide, each end label names its line, so no key is drawn; narrow, a label is a value and a mark.
        legend={single === undefined && narrow ? legend : undefined}
        note={
          hasData
            ? [copy.what, ...(heldRide ? [HELD_NOTE] : [])].join(' ')
            : heldRide
              ? HELD_NOTE
              : undefined
        }
        table={{
          caption: `${copy.caption}${monthly ? MONTHLY_ROWS : ''}`,
          columns,
          rows: rows.map((week, i) => tableRowOf(week, rideKnown, monthly && i < rows.length - 1)),
          phoneHidden: counts,
        }}
        summary={axisGapTable(gaps)}
        empty={
          single !== undefined
            ? singleValueText(single, rideKnown)
            : hasData
              ? undefined
              : heldRide
                ? HELD_EMPTY
                : (emptyText ?? copy.empty)
        }
        surface={(size) =>
          plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive, nearestByX)
        }
        overlay={(size) => {
          const m = layoutOf(size)
          return tooltipOverlay(
            size,
            tooltipAt(
              size,
              m?.xs ?? null,
              active,
              (index, x, y) => tooltipFor(data, index, x, y, rideKnown),
              m?.ys,
            ),
          )
        }}
      >
        {(size) => {
          const m = layoutOf(size)
          if (m === null) return null
          const { plot } = size
          const activeX = active === null ? undefined : m.xs[active]
          return (
            <>
              <ChartXAxis ticks={m.xTicks} plot={plot} fontSize={axisFontSize(size.width)} />
              <ChartYAxis
                ticks={m.yTicks}
                plot={plot}
                title={copy.axisTitle}
                fontSize={axisFontSize(size.width)}
              />
              <AxisBreaks breaks={m.breaks} plot={plot} />
              {activeX !== undefined ? <Crosshair x={activeX} plot={plot} /> : null}
              {hasBand ? (
                <path
                  data-testid="trend-band"
                  className="trend-band"
                  d={smoothBandPath(m.bandHigh, m.bandLow)}
                />
              ) : null}
              <path
                data-testid="trend-line"
                data-sport="run"
                className="chart-series__line chart-series__line--run"
                d={smoothLinePath(m.runLines)}
              />
              {hasRide ? (
                <path
                  data-testid="trend-line"
                  data-sport="ride"
                  className="chart-series__line chart-series__line--ride"
                  d={smoothLinePath(m.rideLines)}
                />
              ) : null}
              {isolatedMarks(m, size)}
              {marksOf('run', false, data, m, size, active)}
              {marksOf('ride', true, data, m, size, active)}
              <ChartAnnotations annotations={m.annotations} size={size} obstacles={m.obstacles} />
            </>
          )
        }}
      </ChartFrame>
      {hasData ? <ChartAbout notes={about} /> : null}
    </div>
  )
}
