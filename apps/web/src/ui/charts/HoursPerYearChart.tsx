import { useState } from 'react'
import type { YearRow } from '@rca/core/history'
import { formatCount } from '../format/count'
import { NO_VALUE } from '../format/noValue'
import { SPORT_ACTIVITY, SPORT_LABEL, SPORT_ORDER, SPORT_PLURAL } from '../sports'
import { formatHours, totalSeconds } from '../weeklyVolume'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize, TooltipContent, TooltipRow } from './chartTypes'
import { useChartHeight } from './chartHeight'
import { hoursPerYearLayout, volumeOfYear } from './hoursPerYearLayout'
import { idleFrom } from './idleReadout'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { axisFontSize } from './ticks'
import './HoursPerYearChart.css'

export interface HoursPerYearChartProps {
  /** One row for each calendar year of the library, first to last. */
  years: readonly YearRow[]
  /** The calendar year still going, whose bar is drawn lighter and called "so far"; none leaves every year whole. */
  current?: number
}

const hoursText = (hours: number) => (hours > 0 ? hours.toFixed(1) : NO_VALUE)

/** A year as the tooltip and the table name it: the year still going says so, since its hours are not a whole year's. */
const yearName = (year: number, current: number | undefined): string =>
  year === current ? `${year} so far` : String(year)

/** A year's tooltip: the hours and count of each sport that trained in it, and the total when there are two. */
function tooltipFor(
  years: readonly YearRow[],
  current: number | undefined,
  i: number,
  x: number,
  y: number,
): TooltipContent | null {
  const row = years[i]
  if (row === undefined) return null
  const rows: TooltipRow[] = SPORT_ORDER.filter((sport) => row.sports[sport].activities > 0).map(
    (sport) => {
      const { hours, activities } = row.sports[sport]
      const noun = activities === 1 ? SPORT_ACTIVITY[sport] : SPORT_PLURAL[sport]
      return {
        kind: sport,
        label: SPORT_LABEL[sport],
        value: `${hours.toFixed(1)} h`,
        note: `${formatCount(activities)} ${noun}`,
      }
    },
  )
  if (rows.length === 0) rows.push({ label: 'Training', value: NO_VALUE, note: 'None' })
  if (rows.length > 1) {
    const total = `${formatHours(totalSeconds(volumeOfYear(row)))} h`
    rows.push({ kind: 'neutral', label: 'Total', value: total })
  }
  return { x, y, title: yearName(row.year, current), rows }
}

/**
 * The hours trained in each calendar year, stacked by sport. The title is the measure, the tallest year carries its
 * hours, and the tooltip and the table give the others'. The year still going is a lighter, dashed bar, keyed and
 * named "so far" wherever it is read, since its hours are not yet a year's.
 */
export function HoursPerYearChart({ years, current }: HoursPerYearChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const height = useChartHeight()
  const layoutOf = sizedOnce((size: ChartSize) => hoursPerYearLayout(years, size, current))
  const sports = SPORT_ORDER.filter((sport) => years.some((row) => row.sports[sport].hours > 0))
  const only = sports.length === 1 ? sports[0] : undefined
  const sportKeys =
    sports.length > 1 ? sports.map((sport) => ({ label: SPORT_LABEL[sport], kind: sport })) : []
  const soFar = years.find((row) => row.year === current)
  // The lighter bar is keyed by its year, in the sport's colour when there is one sport, else in the neutral ink.
  const partialKey =
    soFar === undefined
      ? []
      : [
          {
            label: yearName(soFar.year, current),
            kind: only ?? ('neutral' as const),
            swatch: 'partial' as const,
          },
        ]
  const legend = [...sportKeys, ...partialKey]

  return (
    <ChartFrame
      title={
        only === undefined ? 'Hours per year, run and ride' : `${SPORT_LABEL[only]} hours per year`
      }
      description="Stacked bars of the hours trained each year, one colour for each sport."
      height={height}
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      legend={legend.length > 0 ? legend : undefined}
      idleReadout={idleFrom(tooltipFor(years, current, years.length - 1, 0, 0))}
      table={{
        caption: 'Hours per year, by sport',
        columns: ['Year', ...SPORT_ORDER.map((sport) => `${SPORT_LABEL[sport]} (h)`), 'Total (h)'],
        rows: years.map((row) => [
          yearName(row.year, current),
          ...SPORT_ORDER.map((sport) => hoursText(row.sports[sport].hours)),
          hoursText(totalSeconds(volumeOfYear(row)) / 3600),
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
            (i, x, y) => tooltipFor(years, current, i, x, y),
            layoutOf(size)?.ys,
          ),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const fontSize = axisFontSize(size.width)
        return (
          <>
            <g className="year-chart__x">
              <ChartXAxis ticks={m.xTicks} plot={size.plot} fontSize={fontSize} />
            </g>
            <ChartYAxis ticks={m.yTicks} plot={size.plot} title="Hours" fontSize={fontSize} />
            {active === null ? null : <Crosshair x={m.xs[active]!} plot={size.plot} />}
            {m.bars.flatMap((bar, i) =>
              bar.segments.map((segment) => (
                <path
                  key={`${years[i]?.year}-${segment.sport}`}
                  data-testid="year-bar"
                  data-sport={segment.sport}
                  data-partial={m.partial[i] ? 'true' : undefined}
                  className="year-bar"
                  d={segment.path}
                />
              )),
            )}
            {m.peak ? (
              <text
                data-testid="year-peak"
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
  )
}
