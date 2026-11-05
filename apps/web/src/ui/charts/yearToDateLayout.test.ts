import { describe, expect, it } from 'vitest'
import type { ChartSize } from './chartTypes'
import { nearestYear, yearToDateLayout } from './yearToDateLayout'
import { axisFontSize } from './ticks'
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

  it('labels the best past year and the year before this one at the end of their lines, and this year beside its own end', () => {
    const { labels, dayXs } = yearToDateLayout(YEAR_TO_DATE, 'run', 'metric', SIZE)!
    const role = (name: string) => labels.find((label) => label.role === name)!
    expect(labels).toHaveLength(3)
    expect(role('best')).toMatchObject({ year: 2025, anchor: 'end', x: dayXs.at(-1) })
    expect(role('previous')).toMatchObject({ year: 2026, anchor: 'end', x: dayXs.at(-1) })
    expect(role('current')).toMatchObject({ year: 2027, anchor: 'start' })
    expect(role('current').x).toBeGreaterThan(dayXs[SAMPLE_DAYS.indexOf(TODAY.day)]!)
  })

  it('names a year once when it is both the best past year and the year before this one', () => {
    const years = YEAR_TO_DATE.years.filter((row) => row.year >= 2026)
    const labels = yearToDateLayout({ ...YEAR_TO_DATE, years }, 'run', 'metric', SIZE)!.labels
    expect(labels.map((label) => [label.year, label.role])).toEqual([
      [2026, 'best'],
      [2027, 'current'],
    ])
  })

  it('keeps the names of two past years a line of text apart where their lines end close together', () => {
    const [first, second, third, now] = YEAR_TO_DATE.years as [
      (typeof YEAR_TO_DATE.years)[number],
      (typeof YEAR_TO_DATE.years)[number],
      (typeof YEAR_TO_DATE.years)[number],
      (typeof YEAR_TO_DATE.years)[number],
    ]
    // 2026 ends a hundredth of a per cent under 2025: the same height on the page.
    const nearly = {
      ...third,
      hectometres: {
        ...third.hectometres,
        run: second.hectometres.run.map((value) => value - 1),
      },
    }
    const labels = yearToDateLayout(
      { ...YEAR_TO_DATE, years: [first, second, nearly, now] },
      'run',
      'metric',
      SIZE,
    )!.labels
    const [best, previous] = ['best', 'previous'].map((r) => labels.find((l) => l.role === r)!)
    expect(Math.abs(best!.y - previous!.y)).toBeGreaterThanOrEqual(axisFontSize(SIZE.width) + 2)
  })

  it('gives a pointer between two lines that run together to the later year', () => {
    const together = (year: number) => ({
      year,
      current: false,
      d: '',
      points: [
        { x: 0, y: 10 },
        { x: 100, y: 10 },
      ],
    })
    // Lines come oldest first, as the layout makes them.
    expect(nearestYear([2023, 2024, 2025].map(together), { x: 50, y: 12 })).toBe(2025)
  })

  it('finds the year whose line is under the pointer, this year only up to today, and none far from a line', () => {
    const { lines, dayXs } = yearToDateLayout(YEAR_TO_DATE, 'run', 'metric', SIZE)!
    const line = (year: number) => lines.find((l) => l.year === year)!
    const at = 20
    for (const year of [2025, 2026]) {
      expect(nearestYear(lines, { x: dayXs[at]!, y: line(year).points[at]!.y + 3 })).toBe(year)
    }
    // 2024 and 2026 run almost together here, and the pointer takes the nearer of the two.
    expect(nearestYear(lines, { x: dayXs[at]!, y: line(2024).points[at]!.y })).toBe(2024)
    // Midway between two samples the line is read where it is drawn, between them.
    const [a, b] = [line(2025).points[at]!, line(2025).points[at + 1]!]
    expect(nearestYear(lines, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 2 })).toBe(2025)
    // Past today this year has no line, so the pointer on its last height finds a past year's or nothing.
    const end = line(2027).points.at(-1)!
    expect(nearestYear(lines, { x: dayXs.at(-1)!, y: end.y })).not.toBe(2027)
    expect(nearestYear(lines, { x: dayXs[at]!, y: SIZE.plot.top })).toBeNull()
    expect(nearestYear(lines, { x: SIZE.plot.left - 20, y: line(2025).points[0]!.y })).toBeNull()
  })

  it('puts the label of this year to the left of its end on a plot that has no room to its right', () => {
    const late = { ...THIS_YEAR_ONLY, today: { year: 2027, day: 366 }, days: SAMPLE_DAYS }
    const labels = yearToDateLayout(late, 'run', 'metric', SIZE)!.labels
    expect(labels).toEqual([
      expect.objectContaining({ year: 2027, role: 'current', anchor: 'end' }),
    ])
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
