import { useState } from 'react'
import type { YearToDate } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { distanceUnit } from '@rca/core/units'
import { SegmentedControl } from '../components/SegmentedControl'
import { SPORT_LABEL, SPORT_ORDER, SPORT_PLURAL } from '../sports'
import { ChartFrame } from './ChartFrame'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize, TooltipContent } from './chartTypes'
import { useChartHeight } from './chartHeight'
import { idleFrom } from './idleReadout'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { yearToDateLayout } from './yearToDateLayout'
import { defaultSport, hasDistance } from './yearToDateModel'
import { yearToDateTable, yearToDateTitle, yearToDateTooltip } from './yearToDateText'
import { axisFontSize } from './ticks'
import './ChartSeries.css'
import './YearToDateChart.css'

export interface YearToDateChartProps {
  data: YearToDate
  units: UnitSystem
}

const SPORT_OPTIONS = SPORT_ORDER.map((sport) => ({ value: sport, label: SPORT_LABEL[sport] }))

/**
 * The distance each year has covered by each day of the year, for one sport picked with the toggle. The title is the
 * finding about this year against the best past year to date; the table gives each year's total to today and its
 * whole year.
 */
export function YearToDateChart({ data, units }: YearToDateChartProps) {
  const [picked, setPicked] = useState<Sport | null>(null)
  const [active, setActive] = useState<number | null>(null)
  const sport = picked ?? defaultSport(data, SPORT_ORDER)
  const hasData = hasDistance(data, sport)
  const height = useChartHeight()
  const layoutOf = sizedOnce((size: ChartSize) => yearToDateLayout(data, sport, units, size))
  const tooltipFor = (index: number, x: number, y: number): TooltipContent => ({
    x,
    y,
    ...yearToDateTooltip(data, sport, units, index),
  })
  const lastPoint = data.days.indexOf(data.today.day)

  return (
    <ChartFrame
      title={yearToDateTitle(data, sport, units)}
      controls={
        <SegmentedControl
          legend="Sport"
          legendHidden
          options={SPORT_OPTIONS}
          selected={sport}
          onSelect={(next) => {
            setPicked(next)
            setActive(null)
          }}
        />
      }
      description={`Distance so far by day of the year, for ${SPORT_PLURAL[sport]}, one line for each year. This year is the thick line.`}
      height={height}
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      empty={hasData ? undefined : `Add ${SPORT_PLURAL[sport]} to see this chart`}
      idleReadout={hasData ? idleFrom(tooltipFor(lastPoint, 0, 0)) : undefined}
      table={yearToDateTable(data, sport, units)}
      surface={(size) => plotSurface(size, layoutOf(size)?.pointXs ?? null, active, setActive)}
      overlay={(size) => {
        const layout = layoutOf(size)
        return tooltipOverlay(
          size,
          tooltipAt(
            size,
            layout?.pointXs ?? null,
            active,
            (index, x, y) => tooltipFor(index, x, y),
            layout?.pointYs,
          ),
        )
      }}
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const fontSize = axisFontSize(size.width)
        const activeX = active === null ? undefined : m.dayXs[active]
        return (
          <>
            <ChartXAxis ticks={m.xTicks} plot={size.plot} fontSize={fontSize} />
            <ChartYAxis
              ticks={m.yTicks}
              plot={size.plot}
              title={`Total distance (${distanceUnit(units).unit})`}
              fontSize={fontSize}
            />
            {activeX === undefined ? null : <Crosshair x={activeX} plot={size.plot} />}
            {m.lines.map((line) => (
              <path
                key={line.year}
                data-testid="year-line"
                data-year={line.year}
                className={
                  line.current
                    ? `chart-series__line chart-series__line--${sport}`
                    : 'year-to-date__line'
                }
                d={line.d}
              />
            ))}
            {m.labels.map((label) => (
              <text
                key={`${label.year}-${label.current ? 'this' : 'best'}`}
                data-testid={label.current ? 'year-label-this' : 'year-label-best'}
                className="chart-series__label"
                x={label.x}
                y={label.y}
                textAnchor={label.anchor}
              >
                {label.year}
              </text>
            ))}
          </>
        )
      }}
    </ChartFrame>
  )
}
