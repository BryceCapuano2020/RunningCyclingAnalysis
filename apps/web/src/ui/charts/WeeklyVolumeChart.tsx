import { useMemo, useState } from 'react'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'
import { formatHours, totalSeconds, trained } from '../weeklyVolume'
import type { VolumeWeek } from '../weeklyVolume'
import { ChartFrame } from './ChartFrame'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { AxisBreaks } from './AxisBreaks'
import { ChartAbout } from './ChartAbout'
import { plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize, TooltipContent, TooltipRow } from './chartTypes'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { axisFontSize } from './ticks'
import { weekDay } from './trendText'
import { useChartHeight } from './chartHeight'
import { MONTHLY_VOLUME_NOTE, volumeRowsOf } from './monthlyVolume'
import { axisGapDescription, axisGapNote, axisGapTable } from './trendGap'
import type { TimeAxis } from '@rca/core/digest/trendSeries'
import type { VolumeRows } from './monthlyVolume'
import { weeklyVolumeLayout } from './weeklyVolumeLayout'
import './ChartHeadings.css'
import './WeeklyVolumeChart.css'

export interface WeeklyVolumeChartProps {
  /** One entry per week of the trend above it, in order, so the two share their time axis. */
  weeks: readonly VolumeWeek[]
  /** What the hours show, which is the chart's title: the split between the sports and how it shifted. */
  lede: string
  /** The plot's right margin, so the strip lines up with a trend above it that keeps a gutter for its labels. */
  plotRightMargin?: (width: number) => number
  /** The time axis of the trend above, so the two skip the same years; the weeks' own when not given. */
  axis?: TimeAxis | null
}

const TITLE = 'Training hours per week'
const DESCRIPTION = 'Stacked bars of the hours trained each week, one colour for each sport.'
const MONTHLY_DESCRIPTION =
  'Stacked bars of the hours a week trained, averaged over each month, one colour for each sport.'
/** The plot of the strip is shorter than the trend's, since it carries one measure. */
const PLOT_PX = { phone: 150, wide: 190 }

/** A row's tooltip: the hours in each sport it trained, and the total, or a note that it did not train. */
function tooltipFor(data: VolumeRows, index: number, x: number, y: number): TooltipContent | null {
  const week = data.rows[index]
  if (week === undefined) return null
  const weeks = data.weeksIn[index] ?? 1
  const title = data.monthly
    ? `Month to ${weekDay(week.endMs)}, hours a week`
    : `Week ending ${weekDay(week.endMs)}`
  if (!trained(week)) {
    const none = data.monthly ? 'No training this month' : 'No training this week'
    return { x, y, title, rows: [{ label: 'Training', value: '—', note: none }] }
  }
  const rows: TooltipRow[] = SPORT_ORDER.filter((sport) => week.seconds[sport] > 0).map(
    (sport) => ({
      kind: sport,
      label: SPORT_LABEL[sport],
      value: `${formatHours(week.seconds[sport])} h`,
    }),
  )
  if (rows.length > 1) {
    rows.push({ kind: 'neutral', label: 'Total', value: `${formatHours(totalSeconds(week))} h` })
  }
  const first = rows[0]
  if (data.monthly && first !== undefined) first.note = `Average of ${weeks} weeks`
  return { x, y, title, rows }
}

/**
 * The hours trained each week, stacked by sport, on the time axis of the trend above it: a week's bar
 * stands under that week's point, and a week with no training is a gap. It shows when the trend moved
 * because training moved.
 */
export function WeeklyVolumeChart({
  weeks: given,
  lede,
  plotRightMargin,
  axis,
}: WeeklyVolumeChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const data = useMemo(() => volumeRowsOf(given, axis), [given, axis])
  const { rows: weeks, monthly } = data
  const gaps = data.axis?.gaps ?? []
  const gapNote = axisGapNote(gaps, 'training')
  const axisNotes = gapNote === null ? [] : [gapNote]
  const height = useChartHeight(PLOT_PX)
  const layoutOf = sizedOnce((size: ChartSize) => weeklyVolumeLayout(weeks, size, gaps))
  const legend: ChartLegendEntry[] = SPORT_ORDER.filter((sport) =>
    weeks.some((week) => week.seconds[sport] > 0),
  ).map((sport) => ({ label: SPORT_LABEL[sport], kind: sport }))

  return (
    <div className="takeaway-chart">
      <ChartFrame
        title={lede}
        description={`${monthly ? MONTHLY_DESCRIPTION : DESCRIPTION}${axisGapDescription(gaps)}`}
        summary={axisGapTable(gaps)}
        lede={TITLE}
        note={monthly ? MONTHLY_VOLUME_NOTE : undefined}
        height={height}
        plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
        plotRightMargin={plotRightMargin}
        legend={legend}
        table={{
          caption: monthly
            ? 'Average hours trained a week, in each month, by sport'
            : 'Hours trained each week, by sport',
          columns: [
            monthly ? 'Month to' : 'Week ending',
            ...SPORT_ORDER.map((sport) => `${SPORT_LABEL[sport]} (h)`),
            'Total (h)',
          ],
          rows: weeks.map((week) => [
            weekDay(week.endMs),
            ...SPORT_ORDER.map((sport) =>
              week.seconds[sport] > 0 ? formatHours(week.seconds[sport]) : '—',
            ),
            trained(week) ? formatHours(totalSeconds(week)) : '—',
          ]),
        }}
        surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
        overlay={(size) =>
          tooltipOverlay(
            size,
            tooltipAt(
              size,
              layoutOf(size)?.xs ?? null,
              active,
              (index, x, y) => tooltipFor(data, index, x, y),
              layoutOf(size)?.ys,
            ),
          )
        }
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
                title="Hours a week"
                fontSize={axisFontSize(size.width)}
              />
              <AxisBreaks breaks={m.breaks} plot={plot} />
              {activeX !== undefined ? <Crosshair x={activeX} plot={plot} /> : null}
              {m.bars.flatMap((bar, i) =>
                bar.segments.map((segment) => (
                  <path
                    key={`${weeks[i]?.endMs}-${segment.sport}`}
                    data-testid="volume-bar"
                    data-sport={segment.sport}
                    data-left={bar.left}
                    data-width={bar.width}
                    className="volume-bar"
                    d={segment.path}
                  />
                )),
              )}
              {m.peak ? (
                <text
                  data-testid="volume-peak"
                  className="chart-series__label"
                  textAnchor={m.peak.anchor}
                  x={m.peak.x}
                  y={m.peak.y}
                >
                  {m.peak.text}
                </text>
              ) : null}
            </>
          )
        }}
      </ChartFrame>
      <ChartAbout notes={axisNotes} />
    </div>
  )
}
