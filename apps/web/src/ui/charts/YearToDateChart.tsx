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
import { endLabelOf, nearestYear, yearToDateLayout } from './yearToDateLayout'
import type { LabelRole } from './yearToDateLayout'
import { defaultSport, hasDistance, namedYears } from './yearToDateModel'
import { yearToDateTable, yearToDateTitle, yearToDateTooltip } from './yearToDateText'
import { axisFontSize } from './ticks'
import './ChartSeries.css'
import './YearToDateChart.css'

export interface YearToDateChartProps {
  data: YearToDate
  units: UnitSystem
}

const LABEL_TEST_ID: Record<LabelRole, string> = {
  current: 'year-label-this',
  best: 'year-label-best',
  previous: 'year-label-previous',
  read: 'year-label-read',
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
  // The year whose line the pointer is on: drawn bold and named, and first in the tooltip.
  const [read, setRead] = useState<number | null>(null)
  const sport = picked ?? defaultSport(data, SPORT_ORDER)
  const hasData = hasDistance(data, sport)
  const height = useChartHeight()
  const layoutOf = sizedOnce((size: ChartSize) => yearToDateLayout(data, sport, units, size))
  const tooltipFor = (index: number, x: number, y: number): TooltipContent => ({
    x,
    y,
    ...yearToDateTooltip(data, sport, units, index, read),
  })
  const lastPoint = data.days.indexOf(data.today.day)
  // At rest the phone reads out the years the chart names, not every year of a long library.
  const idle = tooltipFor(lastPoint, 0, 0)
  const named = namedYears(data, sport).map(String)

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
            setRead(null)
          }}
        />
      }
      description={`Distance so far by day of the year, for ${SPORT_PLURAL[sport]}, one line for each year. This year is the thick line.`}
      height={height}
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      empty={hasData ? undefined : `Add ${SPORT_PLURAL[sport]} to see this chart`}
      idleReadout={
        hasData
          ? idleFrom({ ...idle, rows: idle.rows.filter((row) => named.includes(row.label)) })
          : undefined
      }
      table={yearToDateTable(data, sport, units)}
      surface={(size) => {
        const layout = layoutOf(size)
        return plotSurface(size, layout?.pointXs ?? null, active, setActive, undefined, (point) =>
          setRead(point === null || layout === null ? null : nearestYear(layout.lines, point)),
        )
      }}
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
        // A year the pointer is on that carries no name of its own is named while it is read.
        const readLine = m.lines.find((line) => line.year === read)
        const labelsShown =
          readLine === undefined || m.labels.some((label) => label.year === read)
            ? m.labels
            : [...m.labels, endLabelOf(readLine, 'read')]
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
            {/* The year the pointer is on is drawn last, so its line is whole above the others. */}
            {[...m.lines]
              .sort((p, q) => Number(p.year === read) - Number(q.year === read))
              .map((line) => (
                <path
                  key={line.year}
                  data-testid="year-line"
                  data-year={line.year}
                  className={
                    line.current
                      ? `chart-series__line chart-series__line--${sport}`
                      : `year-to-date__line${line.year === read ? ' year-to-date__line--read' : ''}`
                  }
                  d={line.d}
                />
              ))}
            {labelsShown.map((label) => (
              <text
                key={`${label.year}-${label.role}`}
                data-testid={LABEL_TEST_ID[label.role]}
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
