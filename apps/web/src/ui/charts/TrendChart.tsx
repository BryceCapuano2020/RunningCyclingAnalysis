import { useMemo, useState } from 'react'
import type { Sport } from '@rca/core/types'
import type { TrendPoint } from '@rca/core/digest'
import type { UnitSystem } from '@rca/core/units'
import { formatWkg } from '@rca/core/units'
import { plural } from '../components/plural'
import { formatSpan } from '../format/date'
import { effortLabel } from '../records'
import { SPORT_FORMAT, SPORT_LABEL, SPORT_PLURAL } from '../sports'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { Crosshair } from './Crosshair'
import { ChartYAxis } from './ChartYAxis'
import { AxisBreaks } from './AxisBreaks'
import { ChartAbout } from './ChartAbout'
import { ChartAnnotations } from './ChartAnnotations'
import { markerRadii, plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import { useChartHeight } from './chartHeight'
import type { ChartSize, TooltipContent } from './chartTypes'
import { nearestByX } from './hover'
import { SHORT_RUN_POINTS, isIsolated, smoothAreaPath, smoothLinePath } from './smoothPath'
import { axisTitle, formatNative, nativeLabel } from './sportAxis'
import {
  hasValue,
  latestText,
  sportGutter,
  sportRowsOf,
  sportTrendLayout,
  weekRows,
} from './sportTrend'
import type { SportRows, WeekRow } from './sportTrend'
import { sportTakeaway } from './sportTakeaway'
import { MONTHLY_NOTE, MONTHLY_ROWS } from './sharedTrendText'
import { axisGapDescription, axisGapNote, axisGapTable, gapNote, longestGap } from './trendGap'
import { utcDayLocal } from './trendTicks'
import { weekDay, windowPhrase } from './trendText'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { axisFontSize } from './ticks'
import './ChartHeadings.css'
import './ChartSeries.css'
import './TrendChart.css'

export interface TrendChartProps {
  sport: Sport
  /** The weekly points of the period, in metabolic W/kg as the analysis gives them. */
  points: readonly TrendPoint[]
  /** Body mass in kg, for the W/kg of a cycling value. */
  massKg: number
  units: UnitSystem
  /** The trailing window of each value, in days. */
  windowDays: number
  /** The effort length each value is the best of, in seconds. */
  effortS: number
}

/** What the tooltip and the table need. */
interface View {
  sport: Sport
  units: UnitSystem
}

/** The sport's name as a column heading, and as the chart describes its values. */
const COUNT_HEADING: Record<Sport, string> = { run: 'Runs', ride: 'Rides' }
const TREND_NOUN: Record<Sport, string> = { run: 'flat pace, faster up', ride: 'power in watts' }
/** What a week needs to have a value in a sport's trend, after its length: nothing for a run, power for a ride. */
const NEEDS: Record<Sport, string> = { run: '', ride: ' with power' }
const ACTIVITY: Record<Sport, string> = { run: 'run', ride: 'ride' }
const LATEST_WEEK = 'The latest week'

/**
 * A cycling value also states its mechanical W/kg; a run states only its pace. A month, which averages its weeks, says
 * how many weeks and not how many activities, since the count is one week's.
 */
function noteOf(row: WeekRow, view: View, span: string | undefined): string {
  const count = plural(row.count, SPORT_LABEL[view.sport].toLowerCase(), SPORT_PLURAL[view.sport])
  if (!hasValue(row)) return `No ${SPORT_PLURAL[view.sport]} in the window`
  const counted = span === undefined || span === LATEST_WEEK ? `${count} in the window` : undefined
  const parts = [row.wkg === null ? undefined : formatWkg(row.wkg), counted, span].filter(
    (part): part is string => part !== undefined,
  )
  return parts.join(' · ')
}

function tooltipFor(
  data: SportRows,
  index: number,
  x: number,
  y: number,
  view: View,
): TooltipContent | null {
  const row = data.rows[index]
  if (row === undefined) return null
  const weeks = data.weeksIn[index] ?? 1
  const latest = index === data.rows.length - 1
  const span = !data.monthly
    ? undefined
    : latest
      ? LATEST_WEEK
      : `Average of ${plural(weeks, 'week')}`
  return {
    x,
    y,
    title: `${data.monthly ? 'Month to' : 'Week ending'} ${weekDay(row.endMs)}`,
    rows: [
      {
        kind: view.sport,
        label: nativeLabel(view.sport),
        value: row.value === null ? '—' : formatNative(view.sport, row.value, view.units),
        note: noteOf(row, view, span),
      },
    ],
  }
}

/**
 * A row of the table twin: the week or month, the value, its W/kg where the sport has one, and the count of activities.
 * A month is an average, so it has no count of its own: a dash stands for it.
 */
function tableRowOf(row: WeekRow, sport: Sport, units: UnitSystem, average: boolean): string[] {
  const cells = [
    weekDay(row.endMs),
    row.value === null ? '—' : formatNative(sport, row.value, units),
  ]
  if (SPORT_FORMAT[sport].showsWkg) cells.push(row.wkg === null ? '—' : formatWkg(row.wkg))
  cells.push(average ? '—' : String(row.count))
  return cells
}

/** The descriptive line under the title: the unit, the effort and the window the values are the best of. */
function describedAs(sport: Sport, units: UnitSystem, effort: string, windowText: string): string {
  return `${SPORT_LABEL[sport]} ${SPORT_FORMAT[sport].titleUnit(units)}, best ${effort}, trailing ${windowText}`
}

/**
 * One sport's best effort of a length in each week, in its own unit, on an axis fitted to its values. Each
 * value is the best in a trailing window that ends that Sunday; the line is smoothed through them, by the
 * month past 26 weeks, and breaks where eight weeks or more had no effort. The weeks before the sport's first
 * value and after its last are not drawn. The title says what the line found.
 */
export function TrendChart({ sport, points, massKg, units, windowDays, effortS }: TrendChartProps) {
  const weekly = useMemo(() => weekRows(points, sport, massKg), [points, sport, massKg])
  const data = useMemo(() => sportRowsOf(weekly), [weekly])
  const { rows, monthly } = data
  const hasData = rows.filter(hasValue).length >= 2
  const gap = longestGap(
    weekly.map((row) => row.endMs),
    weekly.map(hasValue),
    windowDays,
  )
  const [active, setActive] = useState<number | null>(null)
  const windowText = windowPhrase(windowDays)
  // The effort is named as its segment's label is, so the title and the control read the same.
  const effort = effortLabel(effortS)
  const first = rows[0]
  const last = rows.at(-1)
  const covers =
    data.trimmed && first !== undefined && last !== undefined
      ? `Covers ${formatSpan(utcDayLocal(first.endMs), utcDayLocal(last.endMs)).replace(' – ', ' to ')}, from your first to your last ${ACTIVITY[sport]} of ${effort} or longer${NEEDS[sport]}.`
      : null
  const about = [
    ...(gap === null ? [] : [gapNote(sport, gap, effortS)]),
    ...(covers === null ? [] : [covers]),
    ...(axisGapNote(data.axis?.gaps ?? []) ?? []),
    ...(monthly ? [MONTHLY_NOTE] : []),
  ]
  const view: View = { sport, units }
  const latest = rows.findLastIndex(hasValue)
  const height = useChartHeight()
  const layoutOf = sizedOnce((size: ChartSize) => sportTrendLayout(data, sport, units, size))
  const described = describedAs(sport, units, effort, windowText)
  // Judged on the weeks, not the months, so the latest week is compared with weeks.
  const takeaway = sportTakeaway(
    data.weekly.map((row) => ({ endMs: row.endMs, value: row.value })),
    sport,
    units,
    effort,
  )
  const gaps = data.axis?.gaps ?? []
  const withWkg = SPORT_FORMAT[sport].showsWkg

  return (
    <div className="takeaway-chart">
      <ChartFrame
        height={height}
        plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
        plotRightMargin={() => sportGutter(latestText(rows, sport, units))}
        title={hasData && takeaway !== null ? takeaway : described}
        lede={hasData && takeaway !== null ? described : undefined}
        description={`Best ${effort} of ${SPORT_PLURAL[sport]} in the ${windowText} that end each week, as ${TREND_NOUN[sport]}.${axisGapDescription(gaps)}`}
        note={
          hasData
            ? `Each point is your best ${effort} of the ${windowText} to that Sunday.`
            : undefined
        }
        table={{
          columns: [
            monthly ? 'Month to' : 'Week ending',
            nativeLabel(sport),
            ...(withWkg ? ['W/kg'] : []),
            COUNT_HEADING[sport],
          ],
          rows: rows.map((row, i) => tableRowOf(row, sport, units, monthly && i < rows.length - 1)),
          caption: `Each value is the best ${effort} in the ${windowText} that end that week; ${SPORT_PLURAL[sport]} count the activities in that window. The line is smoothed between weeks.${monthly ? MONTHLY_ROWS : ''}`,
        }}
        summary={axisGapTable(gaps)}
        empty={
          hasData ? undefined : `Add ${SPORT_PLURAL[sport]} in more than one week to see a trend`
        }
        surface={(size) =>
          plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive, nearestByX)
        }
        overlay={(size) =>
          tooltipOverlay(
            size,
            tooltipAt(
              size,
              layoutOf(size)?.xs ?? null,
              active,
              (index, x, y) => tooltipFor(data, index, x, y, view),
              layoutOf(size)?.ys,
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
          const short = new Set(m.runs.filter((run) => run.length < SHORT_RUN_POINTS).flat())
          const isolated = new Set(m.runs.filter((run, i) => isIsolated(run, i, m.runs)).flat())
          return (
            <>
              <ChartXAxis ticks={m.xTicks} plot={plot} fontSize={axisFontSize(size.width)} />
              <ChartYAxis
                ticks={m.yTicks}
                plot={plot}
                title={axisTitle(sport, units)}
                fontSize={axisFontSize(size.width)}
              />
              <AxisBreaks breaks={m.breaks} plot={plot} />
              {activeX !== undefined ? <Crosshair x={activeX} plot={plot} /> : null}
              <path
                data-testid="trend-wash"
                className="trend-wash"
                data-sport={sport}
                d={smoothAreaPath(
                  m.runs.filter((run) => run.length >= SHORT_RUN_POINTS),
                  plot.bottom,
                )}
              />
              <path
                data-testid="trend-line"
                className={`chart-series__line chart-series__line--${sport}`}
                d={smoothLinePath(m.lines)}
              />
              {m.isolated.map((at) => (
                <circle
                  key={at.x}
                  data-testid="trend-marker"
                  data-isolated="true"
                  className={`chart-series__marker chart-series__marker--${sport}`}
                  cx={at.x}
                  cy={at.y}
                  r={activeR}
                />
              ))}
              {m.points.map((point, i) => {
                const row = rows[i]
                if (!point || !row) return null
                if (isolated.has(point) && i !== active) return null
                const end = i === latest || i === active
                if (!(m.markers || short.has(point) || end)) return null
                return (
                  <circle
                    key={row.endMs}
                    data-testid={i === latest ? 'trend-latest' : 'trend-marker'}
                    className={`chart-series__marker chart-series__marker--${sport}`}
                    cx={point.x}
                    cy={point.y}
                    r={end ? activeR : markerR}
                  />
                )
              })}
              <ChartAnnotations annotations={m.annotations} size={size} obstacles={m.obstacles} />
            </>
          )
        }}
      </ChartFrame>
      {hasData ? <ChartAbout notes={about} /> : null}
    </div>
  )
}
