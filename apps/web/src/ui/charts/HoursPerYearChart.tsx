import { useState } from 'react'
import type { YearRow } from '@rca/core/history'
import { formatCount } from '../format/count'
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
}

const DASH = '—'
const hoursText = (hours: number) => (hours > 0 ? hours.toFixed(1) : DASH)

/** A year's tooltip: the hours and count of each sport that trained in it, and the total when there are two. */
function tooltipFor(
  years: readonly YearRow[],
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
  if (rows.length === 0) rows.push({ label: 'Training', value: DASH, note: 'None' })
  if (rows.length > 1) {
    const total = `${formatHours(totalSeconds(volumeOfYear(row)))} h`
    rows.push({ kind: 'neutral', label: 'Total', value: total })
  }
  return { x, y, title: String(row.year), rows }
}

/**
 * The hours trained in each calendar year, stacked by sport. The title is the measure, the tallest year carries its
 * hours, and the tooltip and the table give the others'.
 */
export function HoursPerYearChart({ years }: HoursPerYearChartProps) {
  const [active, setActive] = useState<number | null>(null)
  const height = useChartHeight()
  const layoutOf = sizedOnce((size: ChartSize) => hoursPerYearLayout(years, size))
  const sports = SPORT_ORDER.filter((sport) => years.some((row) => row.sports[sport].hours > 0))
  const only = sports.length === 1 ? sports[0] : undefined

  return (
    <ChartFrame
      title={only === undefined ? 'Hours per year' : `${SPORT_LABEL[only]} hours per year`}
      description="Stacked bars of the hours trained each year, one colour for each sport."
      height={height}
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      legend={
        sports.length > 1
          ? sports.map((sport) => ({ label: SPORT_LABEL[sport], kind: sport }))
          : undefined
      }
      idleReadout={idleFrom(tooltipFor(years, years.length - 1, 0, 0))}
      table={{
        caption: 'Hours per year, by sport',
        columns: ['Year', ...SPORT_ORDER.map((sport) => `${SPORT_LABEL[sport]} (h)`), 'Total (h)'],
        rows: years.map((row) => [
          String(row.year),
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
            (i, x, y) => tooltipFor(years, i, x, y),
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
