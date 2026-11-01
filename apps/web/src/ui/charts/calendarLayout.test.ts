import { trainingWeeks } from '@rca/core/history'
import { describe, expect, it } from 'vitest'
import { calendarOf } from '../calendarFixtures'
import { gridOf } from './calendarGrid'
import {
  CALENDAR_BOTTOM_PX,
  CALENDAR_MONTHS_BELOW_PX,
  MONTH_START_COLUMNS,
  calendarHeight,
  calendarLayout,
  modeOf,
} from './calendarLayout'
import type { ChartSize } from './chartTypes'
import { isPhoneWidth, plotBoxOf } from './plotBox'

describe('modeOf', () => {
  it('lays a chart out by the month below 560 px and by the week from there', () => {
    expect(CALENDAR_MONTHS_BELOW_PX).toBe(560)
    expect([359, 559].map(modeOf)).toEqual(['months', 'months'])
    expect([560, 1080].map(modeOf)).toEqual(['weeks', 'weeks'])
  })
})

describe('MONTH_START_COLUMNS', () => {
  it('is the first week of the year whose Thursday is in the month', () => {
    // Every week of 2018, a year that begins on a Monday: its week numbers are the columns.
    const year = trainingWeeks(
      calendarOf([
        { on: [2018, 1, 1], run: [1, 1] },
        { on: [2018, 12, 30], run: [1, 1] },
      ]),
    ).filter((week) => week.year === 2018)
    const firstWeekOfMonth = Array.from({ length: 12 }, (_, month) =>
      year.findIndex((week) => week.month === month),
    )
    expect(year).toHaveLength(52)
    expect([...MONTH_START_COLUMNS]).toEqual(firstWeekOfMonth)
    expect([...MONTH_START_COLUMNS]).toEqual([0, 4, 8, 13, 17, 22, 26, 30, 35, 39, 43, 48])
  })
})

const weeks = trainingWeeks(
  calendarOf([
    { on: [2022, 3, 7], run: [2, 1] },
    { on: [2023, 6, 1], run: [3, 1] },
    { on: [2024, 9, 4], ride: [1, 1] },
  ]),
)

function sizeOf(width: number, rows: number, mode: 'weeks' | 'months'): ChartSize {
  const height = calendarHeight(rows, width, mode)
  return {
    width,
    height,
    plot: plotBoxOf(width, height, undefined, CALENDAR_BOTTOM_PX, isPhoneWidth(width)),
    tooltipId: 't',
    hintId: 'h',
    titleId: 'i',
  }
}

describe('calendarLayout', () => {
  const grid = gridOf(weeks, 'all', 'weeks')
  const size = sizeOf(900, grid.years.length, 'weeks')
  const layout = calendarLayout(grid, size, 'weeks')

  it('fills the plot with the rows and leaves a 2 px gap between cells', () => {
    const rows = grid.years.length
    const lastRow = layout.rects.filter((_, i) => grid.cells[i]!.row === rows - 1)
    const bottom = Math.max(...lastRow.map((r) => r.y + r.height))
    expect(bottom + 1).toBeCloseTo(size.plot.bottom)
    const [a, b] = [layout.rects[0]!, layout.rects[1]!]
    expect(b.x - (a.x + a.width)).toBeCloseTo(2)
    expect(layout.years.map((y) => y.text)).toEqual(['2022', '2023', '2024'])
  })

  it('names the twelve months at their first columns, and finds the cell under a pixel, its gap included', () => {
    expect(layout.months.map((m) => m.text)).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ])
    const pitch = (size.plot.right - size.plot.left) / grid.columns
    expect(layout.months[2]!.x).toBeCloseTo(size.plot.left + 8 * pitch + 1)
    const i = grid.cells.findIndex((c) => c.row === 1 && c.col === 22)
    const r = layout.rects[i]!
    expect(layout.cellAt(r.x + r.width / 2, r.y + r.height / 2)).toBe(i)
    expect(layout.cellAt(r.x - 0.5, r.y - 0.5)).toBe(i)
    expect(layout.cellAt(size.plot.left - 5, r.y)).toBeNull()
    expect(layout.cellAt(r.x, size.plot.bottom + 5)).toBeNull()
  })

  it('names months by their first letter where a column is narrower than 28 px, and by three letters from there', () => {
    const months = gridOf(weeks, 'all', 'months')
    const phone = calendarLayout(months, sizeOf(360, months.years.length, 'months'), 'months')
    expect(phone.months.map((m) => m.text)).toEqual('JFMAMJJASOND'.split(''))
    const wider = calendarLayout(months, sizeOf(540, months.years.length, 'months'), 'months')
    expect(wider.months.map((m) => m.text).slice(0, 3)).toEqual(['Jan', 'Feb', 'Mar'])
  })

  it('makes a chart as tall as its rows, whatever the width', () => {
    for (const width of [360, 540, 900, 1200]) {
      const mode = modeOf(width)
      const chart = sizeOf(width, 13, mode)
      const rows = (chart.plot.bottom - chart.plot.top) / 13
      expect(rows).toBeGreaterThanOrEqual(14)
      expect(rows).toBeLessThanOrEqual(20)
    }
  })
})
