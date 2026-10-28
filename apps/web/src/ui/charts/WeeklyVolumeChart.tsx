import { useState } from 'react'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'
import { formatHours, totalSeconds, trained } from '../weeklyVolume'
import type { VolumeWeek } from '../weeklyVolume'
import { ChartFrame } from './ChartFrame'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { GapMarks } from './GapMarks'
import { plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize, TooltipContent, TooltipRow } from './chartTypes'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { axisFontSize } from './ticks'
import { weekDay } from './trendText'
import { weeklyVolumeLayout } from './weeklyVolumeLayout'
import './WeeklyVolumeChart.css'

export interface WeeklyVolumeChartProps {
  /** One entry per week of the trend above it, in order, so the two share their time axis. */
  weeks: readonly VolumeWeek[]
  /** The one line under the title that says what the bars show. */
  lede: string
  /** The plot's right margin, so the strip lines up with a trend above it that keeps a gutter for its labels. */
  plotRightMargin?: (width: number) => number
}

const TITLE = 'Training hours per week'
const DESCRIPTION = 'Stacked bars of the hours trained each week, one colour for each sport.'
/** The strip is shorter than the trend it sits under, since it carries one measure. */
const HEIGHT = 200

/** A week's tooltip: the hours in each sport it trained, and the total, or a note that it did not train. */
function tooltipFor(week: VolumeWeek, x: number, y: number): TooltipContent {
  const title = `Week ending ${weekDay(week.endMs)}`
  if (!trained(week)) {
    return { x, y, title, rows: [{ label: 'Training', value: '—', note: 'No training this week' }] }
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
  return { x, y, title, rows }
}

/**
 * The hours trained each week, stacked by sport, on the time axis of the trend above it: a week's bar
 * stands under that week's point, and a week with no training is a gap. It shows when the trend moved
 * because training moved.
 */
export function WeeklyVolumeChart({ weeks, lede, plotRightMargin }: WeeklyVolumeChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const layoutOf = sizedOnce((size: ChartSize) => weeklyVolumeLayout(weeks, size))
  const legend: ChartLegendEntry[] = SPORT_ORDER.filter((sport) =>
    weeks.some((week) => week.seconds[sport] > 0),
  ).map((sport) => ({ label: SPORT_LABEL[sport], kind: sport }))

  return (
    <ChartFrame
      title={TITLE}
      description={DESCRIPTION}
      lede={lede}
      height={HEIGHT}
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      plotRightMargin={plotRightMargin}
      legend={legend}
      table={{
        caption: 'Hours trained each week, by sport',
        columns: [
          'Week ending',
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
            (index, x, y) => {
              const week = weeks[index]
              return week ? tooltipFor(week, x, y) : null
            },
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
              title="Hours"
              fontSize={axisFontSize(size.width)}
            />
            <GapMarks xs={m.xs} gaps={weeks.map((week) => !trained(week))} plot={plot} />
            {activeX !== undefined ? <Crosshair x={activeX} plot={plot} /> : null}
            {m.bars.flatMap((bar, i) =>
              bar.segments.map((segment) => (
                <rect
                  key={`${weeks[i]?.endMs}-${segment.sport}`}
                  data-testid="volume-bar"
                  data-sport={segment.sport}
                  className={segment.edged ? 'volume-bar volume-bar--edged' : 'volume-bar'}
                  x={bar.left}
                  y={segment.y}
                  width={bar.width}
                  height={segment.height}
                />
              )),
            )}
          </>
        )
      }}
    </ChartFrame>
  )
}
