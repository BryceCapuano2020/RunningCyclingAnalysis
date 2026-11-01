import type { ReactNode } from 'react'
import type { CalendarLayout } from './calendarLayout'
import type { ChartSize } from './chartTypes'
import { stepActive } from './hover'
import { PlotSurface } from './PlotSurface'

/**
 * The focusable layer over the grid: the pointer picks the cell under it, and the arrow keys step through the cells
 * in order of date (Home and End jump to the first and last). A cell is an index into the grid's cells.
 */
export function calendarSurface(
  size: ChartSize,
  layout: CalendarLayout,
  count: number,
  active: number | null,
  setActive: (index: number | null) => void,
): ReactNode {
  return (
    <PlotSurface
      size={size}
      onPoint={(point) => setActive(point === null ? null : layout.cellAt(point.x, point.y))}
      onKey={(key) => {
        const next = stepActive(active, count, key)
        if (next) setActive(next.index)
      }}
      onBlur={() => setActive(null)}
    />
  )
}
