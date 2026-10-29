// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DAY_MS, PRIORS } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { SharedTrendChart } from './SharedTrendChart'
import type { SharedWeek } from './gradeTrend'
import { TrendChart } from './TrendChart'

const MASS_KG = 75
/** Sunday 7 January 2018, UTC: the first of five years of weeks. */
const FIRST_END = Date.UTC(2018, 0, 7, 23, 59, 59, 999)
const endOf = (week: number) => FIRST_END + week * 7 * DAY_MS
const rideWkgAt = (watts: number) => watts / (PRIORS.grossEfficiency.mean * MASS_KG)

/** Five years of weeks of riding at 250 W, with no ride with power in `gap` weeks. */
function rideWeeks(count: number, gap: [from: number, to: number] | null): TrendPoint[] {
  return Array.from({ length: count }, (_, week) => {
    const empty = gap !== null && week >= gap[0] && week <= gap[1]
    return {
      endMs: endOf(week),
      runWkg: null,
      rideWkg: empty ? null : rideWkgAt(250),
      runCount: 0,
      rideCount: empty ? 0 : 1,
      runAtMs: null,
      rideAtMs: empty ? null : endOf(week),
      rideRunSpeed: null,
    }
  })
}

function renderRide(points: TrendPoint[], effortS = 1200) {
  return render(
    <TrendChart
      sport="ride"
      points={points}
      massKg={MASS_KG}
      units="metric"
      windowDays={84}
      effortS={effortS}
    />,
  )
}

describe('TrendChart over years', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 10))
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('draws a point a month past 26 weeks, instead of a point a week', () => {
    const { container } = renderRide(rideWeeks(260, null))
    const rows = container.querySelectorAll('tbody tr').length
    expect(rows).toBeGreaterThanOrEqual(60)
    expect(rows).toBeLessThanOrEqual(62)
    expect(
      screen.getByText(/Past 26 weeks each point is a month: the average of its weekly values/),
    ).toBeInTheDocument()
    expect(container.querySelector('thead th')?.textContent).toBe('Month to')
  })

  it('keeps a point a week up to 26 weeks, with no note about months, and a month past them', () => {
    const weekly = renderRide(rideWeeks(27, null))
    expect(weekly.container.querySelectorAll('tbody tr')).toHaveLength(27)
    expect(screen.queryByText(/each point is a month/)).not.toBeInTheDocument()
    cleanup()
    const monthly = renderRide(rideWeeks(28, null))
    expect(monthly.container.querySelectorAll('tbody tr').length).toBeLessThan(10)
    expect(screen.getByText(/each point is a month/)).toBeInTheDocument()
  })

  it('draws all eleven years of weeks: no cap cuts the start, and the table is by month', () => {
    const { container } = renderRide(rideWeeks(570, null))
    const rows = Array.from(container.querySelectorAll('tbody tr'))
    expect(rows.length).toBeGreaterThanOrEqual(130)
    expect(rows.length).toBeLessThanOrEqual(133)
    // The first month is January 2018, the library's first, not one 260 weeks back from the last.
    expect(rows[0]?.textContent).toMatch(/Jan 2018/)
    expect(container.querySelector('.chart-x-axis__tick')?.textContent).toBe('Jan 2018')
  })

  it('carries the month and year on the first date of the axis past 26 weeks', () => {
    const { container } = renderRide(rideWeeks(260, null))
    const first = container.querySelector('.chart-x-axis__tick')
    expect(first?.textContent).toBe('Jan 2018')
  })

  it('says where the longest stretch with no ride with power lay, which the line shows only as a blank', () => {
    const { container } = renderRide(rideWeeks(260, [100, 140]))
    // The line is two pieces, not one bridged across the gap.
    expect(
      container.querySelector('[data-testid="trend-line"]')?.getAttribute('d')?.match(/M/g),
    ).toHaveLength(2)
    // The first empty week is 12 weeks after the window opened: nothing was ridden from 12 weeks before it.
    const from = new Date(endOf(100) - 84 * DAY_MS)
    expect(from.getUTCFullYear()).toBe(2019)
    expect(
      screen.getByText(
        /^The line breaks from \d+ \w+ 2019 to \d+ \w+ 2020: no rides of 20 min or longer with power in that time\./,
      ),
    ).toBeInTheDocument()
  })

  it('skips a year or more with no ride, with a break mark and the dates in About this chart, not a flat run of empty years', () => {
    const { container } = renderRide(rideWeeks(260, [30, 100]))
    expect(container.querySelectorAll('[data-testid="axis-break"]')).toHaveLength(1)
    expect(container.querySelector('.chart-about')).toHaveTextContent(/The axis skips .* to .*/)
    // 260 weeks less the 69 skipped, by month: far fewer rows than the whole span would give.
    expect(container.querySelectorAll('tbody tr').length).toBeLessThan(50)
    expect(container.querySelectorAll('[data-testid="trend-gap"]')).toHaveLength(0)
  })

  it('draws a stretch of one or two rides cut off by breaks as one marker, not a dumbbell', () => {
    const points = rideWeeks(60, null).map((point, week) =>
      week >= 2 && week < 30 ? Object.assign(point, { rideWkg: null, rideCount: 0 }) : point,
    )
    const { container } = renderRide(points)
    expect(
      container.querySelectorAll('[data-testid="trend-marker"][data-isolated="true"]'),
    ).toHaveLength(1)
    const line = container.querySelector('[data-testid="trend-line"]')
    expect(line?.getAttribute('d')?.match(/M/g)).toHaveLength(1)
  })

  it('gives a month’s table row an average W/kg of its weeks, at each week’s own body mass, and no count', () => {
    // The same 3 W/kg every week, ridden at 60 kg and 90 kg in turn: the watts differ, the W/kg does not.
    const points = rideWeeks(60, null).map((point, week) =>
      Object.assign(point, { rideMassKg: week % 2 === 0 ? 60 : 90 }),
    )
    const { container } = renderRide(points)
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('th, td')).map((cell) => cell.textContent),
    )
    const [first, second] = rows
    // Power, W/kg, count: the month's W/kg is the weeks' own, though its last week was at the other mass.
    expect(first?.[2]).toBe(second?.[2])
    expect(first?.[3]).toBe('—')
    // The latest row is the latest week itself, so it states its count.
    expect(rows.at(-1)?.[3]).toBe('1')
    expect(container.querySelector('caption')).toHaveTextContent(
      'Monthly rows are averages of their weeks’ values.',
    )
  })

  it('names the effort length of the trend, so a gap at 60 min is not read as a gap in riding', () => {
    renderRide(rideWeeks(260, [100, 140]), 3600)
    expect(
      screen.getByText(/^The line breaks from .*: no rides of 60 min or longer with power/),
    ).toBeInTheDocument()
  })

  it('names no gap when the weeks run without a long break', () => {
    renderRide(rideWeeks(260, [100, 103]))
    expect(screen.queryByText(/^The line breaks from /)).not.toBeInTheDocument()
  })
})

function sharedWeeks(count: number): SharedWeek[] {
  return Array.from({ length: count }, (_, week) => ({
    endMs: endOf(week),
    run: 0.6 + (week % 5) / 100,
    ride: 0.5,
    rideLow: 0.47,
    rideHigh: 0.53,
    runCount: 1,
    rideCount: 1,
  }))
}

describe('SharedTrendChart over years', () => {
  afterEach(cleanup)

  const renderShared = (count: number) =>
    render(
      <SharedTrendChart
        weeks={sharedWeeks(count)}
        windowDays={84}
        effortS={1200}
        latestStartMs={{ run: null, ride: null }}
      />,
    )

  it('draws a point a month past 26 weeks, and says so once', () => {
    const { container } = renderShared(260)
    const rows = container.querySelectorAll('tbody tr').length
    expect(rows).toBeGreaterThanOrEqual(60)
    expect(rows).toBeLessThanOrEqual(62)
    expect(screen.getAllByText(/Past 26 weeks each point is a month/)).toHaveLength(1)
  })

  it('gives a month’s row no count of activities, says its rows are averages, and counts the latest week', () => {
    const { container } = renderShared(60)
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.querySelectorAll('th, td')).map((cell) => cell.textContent),
    )
    expect(rows[0]?.slice(-2)).toEqual(['—', '—'])
    expect(rows.at(-1)?.slice(-2)).toEqual(['1', '1'])
    expect(container.querySelector('caption')).toHaveTextContent(
      'Monthly rows are averages of their weeks’ values.',
    )
  })

  it('keeps every week of 26 weeks or less', () => {
    const { container } = renderShared(27)
    expect(
      container.querySelectorAll('[data-testid="trend-marker"][data-sport="run"]'),
    ).toHaveLength(27)
    expect(screen.queryByText(/each point is a month/)).not.toBeInTheDocument()
  })

  it('draws all of eleven years, from the first month, with a table by month', () => {
    const { container } = renderShared(570)
    const rows = Array.from(container.querySelectorAll('tbody tr'))
    expect(rows.length).toBeGreaterThanOrEqual(130)
    expect(rows.length).toBeLessThanOrEqual(133)
    expect(container.querySelector('.chart-x-axis__tick')?.textContent).toBe('Jan 2018')
    // Dense months carry no marker each; the line and its last point do.
    expect(
      container.querySelectorAll('[data-testid="trend-marker"][data-sport="run"]').length,
    ).toBeLessThan(5)
  })
})
