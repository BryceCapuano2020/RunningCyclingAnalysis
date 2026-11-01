import { describe, expect, it } from 'vitest'
import type { ChartSize } from './chartTypes'
import { yearToDateLayout } from './yearToDateLayout'
import { SAMPLE_DAYS, TODAY, THIS_YEAR_ONLY, YEAR_TO_DATE } from '../yearToDateFixtures'

const SIZE: ChartSize = {
  width: 600,
  height: 320,
  plot: { left: 56, right: 584, top: 28, bottom: 268 },
  tooltipId: 'tooltip',
  hintId: 'hint',
  titleId: 'title',
}

/** The number of points a line's path draws: one move or line command for each. */
const pointsIn = (d: string) => d.match(/[ML]/g)?.length ?? 0

describe('yearToDateLayout', () => {
  it('draws each year through every sample day it has reached, and this year only to today', () => {
    const layout = yearToDateLayout(YEAR_TO_DATE, 'run', 'metric', SIZE)!
    const lineOf = (year: number) => layout.lines.find((line) => line.year === year)!
    expect(layout.dayXs).toHaveLength(SAMPLE_DAYS.length)
    expect(layout.pointXs).toHaveLength(SAMPLE_DAYS.indexOf(TODAY.day) + 1)
    expect(pointsIn(lineOf(2025).d)).toBe(SAMPLE_DAYS.length)
    expect(pointsIn(lineOf(2027).d)).toBe(layout.pointXs.length)
    expect(lineOf(2027).current).toBe(true)
    expect(lineOf(2026).current).toBe(false)
  })

  it('places the days across the plot, from its left edge to its right at the year’s end', () => {
    const { dayXs, pointYs } = yearToDateLayout(YEAR_TO_DATE, 'run', 'metric', SIZE)!
    expect(dayXs.at(-1)).toBe(SIZE.plot.right)
    expect(dayXs.every((x, i) => i === 0 || x > dayXs[i - 1]!)).toBe(true)
    expect(pointYs).toHaveLength(SAMPLE_DAYS.indexOf(TODAY.day) + 1)
  })

  it('labels the best past year at the end of its line, and this year beside its own end', () => {
    const { labels, dayXs } = yearToDateLayout(YEAR_TO_DATE, 'run', 'metric', SIZE)!
    const best = labels.find((label) => !label.current)!
    const now = labels.find((label) => label.current)!
    expect(best).toMatchObject({ year: 2025, anchor: 'end', x: dayXs.at(-1) })
    expect(now).toMatchObject({ year: 2027, anchor: 'start' })
    expect(now.x).toBeGreaterThan(dayXs[SAMPLE_DAYS.indexOf(TODAY.day)]!)
  })

  it('puts the label of this year to the left of its end on a plot that has no room to its right', () => {
    const late = { ...THIS_YEAR_ONLY, today: { year: 2027, day: 366 }, days: SAMPLE_DAYS }
    const labels = yearToDateLayout(late, 'run', 'metric', SIZE)!.labels
    expect(labels).toEqual([expect.objectContaining({ year: 2027, anchor: 'end' })])
  })

  it('has a tick at the first of each month, from the first of January, and a y scale that covers the peak', () => {
    const layout = yearToDateLayout(YEAR_TO_DATE, 'run', 'metric', SIZE)!
    expect(layout.xTicks.length).toBeGreaterThan(0)
    expect(
      layout.xTicks.every((tick, i, all) => i === 0 || tick.position > all[i - 1]!.position),
    ).toBe(true)
    expect(layout.xTicks[0]!.position).toBe(SIZE.plot.left)
    const top = Math.max(...layout.yTicks.map((tick) => Number(tick.label.replace(/,/g, ''))))
    expect(top).toBeGreaterThanOrEqual(549)
  })

  it('has no layout without years', () => {
    expect(yearToDateLayout({ ...YEAR_TO_DATE, years: [] }, 'run', 'metric', SIZE)).toBeNull()
  })
})
