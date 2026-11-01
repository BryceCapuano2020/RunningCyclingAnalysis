import { useMemo, useState } from 'react'
import { trainingWeeks } from '@rca/core/history'
import type { TrainingCalendar } from '@rca/core/history'
import { SegmentedControl } from '../components/SegmentedControl'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'
import { filterOf, gridOf } from './calendarGrid'
import type { CalendarFilter } from './calendarGrid'
import { findingsOf, findingsText } from './calendarFindings'
import {
  CALENDAR_BOTTOM_PX,
  LABEL_RISE_PX,
  YEAR_GAP_PX,
  calendarHeight,
  calendarLayout,
  modeOf,
} from './calendarLayout'
import { rampOf } from './calendarRamp'
import { summaryOf, tableOf, tooltipFor } from './calendarText'
import { CalendarRampKey } from './CalendarRampKey'
import { calendarSurface } from './calendarSurface'
import { ChartFrame } from './ChartFrame'
import { sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize } from './chartTypes'
import { idleFrom } from './idleReadout'
import { axisFontRem, axisFontSize } from './ticks'
import { useSize } from './useSize'
import './TrainingCalendarChart.css'

export interface TrainingCalendarChartProps {
  calendar: TrainingCalendar
}

const ALL_OPTION = { value: 'all' as const, label: 'All' }
const EMPTY_TEXT = 'Add runs or rides to see your training calendar.'

/**
 * The hours trained in each week of the library as a heatmap: a row for each year, a column for each week, and a tint
 * for the hours. A week with no training is a plain cell, so a gap in the run reads at a glance. The filter keeps one
 * sport, whose hue the ramp takes. A phone has a column for each month, which is the average week of it.
 */
export function TrainingCalendarChart({ calendar }: TrainingCalendarChartProps) {
  const weeks = useMemo(() => trainingWeeks(calendar), [calendar])
  const [chosen, setChosen] = useState<CalendarFilter>('all')
  const [measure, width] = useSize()
  const [active, setActive] = useState<number | null>(null)
  const mode = modeOf(width)
  // What the picture is made of changes with the filter and the columns, not with a point being read.
  const { sports, filter, grid, ramp, found } = useMemo(() => {
    const trained = SPORT_ORDER.filter((sport) => weeks.some((w) => w.sports[sport].activities > 0))
    const kept = filterOf(trained, chosen)
    const cells = gridOf(weeks, kept, mode)
    return {
      sports: trained,
      filter: kept,
      grid: cells,
      ramp: rampOf(cells.cells.map((cell) => cell.rate)),
      found: findingsOf(weeks, kept),
    }
  }, [weeks, chosen, mode])
  const only = sports.length === 1 ? sports[0] : undefined
  const at = active !== null && active < grid.cells.length ? active : null
  const layoutOf = sizedOnce((size: ChartSize) => calendarLayout(grid, size, mode))
  const last = grid.cells.at(-1)

  return (
    <div ref={measure} className="calendar" data-sport={filter === 'all' ? undefined : filter}>
      <ChartFrame
        title={only === undefined ? 'Training calendar' : `${SPORT_LABEL[only]} training calendar`}
        description={`Heatmap of the hours trained each ${mode === 'weeks' ? 'week' : 'month'}, one row for each year.`}
        lede={found === null ? undefined : findingsText(found, filter)}
        controls={
          grid.cells.length === 0 ? undefined : (
            <div className="calendar__controls">
              {sports.length > 1 ? (
                <SegmentedControl
                  legend="Sport"
                  legendHidden
                  options={[
                    ALL_OPTION,
                    ...sports.map((sport) => ({ value: sport, label: SPORT_LABEL[sport] })),
                  ]}
                  selected={filter}
                  onSelect={setChosen}
                />
              ) : null}
              <CalendarRampKey ceiling={ramp.ceiling} />
            </div>
          )
        }
        height={(w) => calendarHeight(grid.years.length, w, mode)}
        plotBottomMargin={CALENDAR_BOTTOM_PX}
        empty={grid.cells.length === 0 ? EMPTY_TEXT : undefined}
        idleReadout={idleFrom(tooltipFor(last, mode, 0, 0))}
        summary={summaryOf(weeks, grid.years, filter)}
        table={tableOf(grid, mode)}
        surface={(size) => calendarSurface(size, layoutOf(size), grid.cells.length, at, setActive)}
        overlay={(size) =>
          tooltipOverlay(
            size,
            tooltipAt(
              size,
              layoutOf(size).xs,
              at,
              (i, x, y) => tooltipFor(grid.cells[i], mode, x, y),
              layoutOf(size).ys,
            ),
          )
        }
      >
        {(size) => {
          const layout = layoutOf(size)
          const fontSize = axisFontRem(axisFontSize(size.width))
          return (
            <>
              {layout.months.map(({ x, text, anchor }) => (
                <text
                  key={text + x}
                  className="calendar__label"
                  style={{ fontSize }}
                  x={x}
                  y={size.plot.top - LABEL_RISE_PX}
                  textAnchor={anchor}
                >
                  {text}
                </text>
              ))}
              {layout.years.map(({ y, text }) => (
                <text
                  key={text}
                  className="calendar__label"
                  style={{ fontSize }}
                  x={size.plot.left - YEAR_GAP_PX}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="central"
                >
                  {text}
                </text>
              ))}
              {grid.cells.map((cell, i) => {
                const { x, y, width: w, height: h } = layout.rects[i]!
                return (
                  <rect
                    key={`${cell.year}-${cell.col}`}
                    data-testid="calendar-cell"
                    data-step={ramp.stepOf(cell.rate)}
                    className="calendar-cell"
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx={2}
                  />
                )
              })}
              {at === null ? null : (
                <rect
                  className="calendar-cell-active"
                  x={layout.rects[at]!.x}
                  y={layout.rects[at]!.y}
                  width={layout.rects[at]!.width}
                  height={layout.rects[at]!.height}
                  rx={2}
                />
              )}
            </>
          )
        }}
      </ChartFrame>
    </div>
  )
}
