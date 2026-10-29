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

  it('draws a point a month past a year, instead of a point a week', () => {
    const { container } = renderRide(rideWeeks(260, null))
    const marked = container.querySelectorAll('[data-testid="trend-marker"]').length + 1
    expect(marked).toBeGreaterThanOrEqual(60)
    expect(marked).toBeLessThanOrEqual(62)
    expect(
      screen.getByText(/Past 13 months, each point is the last week of its month\./),
    ).toBeInTheDocument()
    // The table holds the same months, not the 260 weeks.
    expect(container.querySelectorAll('tbody tr').length).toBe(marked)
  })

  it('keeps a point a week up to a year, with no note about months', () => {
    const { container } = renderRide(rideWeeks(52, null))
    expect(container.querySelectorAll('tbody tr')).toHaveLength(52)
    expect(screen.queryByText(/last week of its month/)).not.toBeInTheDocument()
  })

  it('carries the year on the first date of the axis', () => {
    const { container } = renderRide(rideWeeks(260, null))
    const first = container.querySelector('.chart-x-axis__tick')
    expect(first?.textContent).toBe('7 Jan 2018')
  })

  it('says where the longest stretch with no ride with power lay, which the line shows only as a blank', () => {
    renderRide(rideWeeks(260, [100, 140]))
    // The first empty week is 12 weeks after the window opened: nothing was ridden from 12 weeks before it.
    const from = new Date(endOf(100) - 84 * DAY_MS)
    expect(from.getUTCFullYear()).toBe(2019)
    expect(
      screen.getByText(
        /^The line breaks from \d+ \w+ 2019 to \d+ \w+ 2020: no rides of 20 min or longer with power in that time\./,
      ),
    ).toBeInTheDocument()
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

  it('draws a point a month past a year, and says so once', () => {
    const { container } = render(
      <SharedTrendChart
        weeks={sharedWeeks(260)}
        measure="grade"
        windowDays={84}
        effortS={1200}
        latestStartMs={{ run: null, ride: null }}
      />,
    )
    const runMarkers = container.querySelectorAll('[data-testid="trend-marker"][data-sport="run"]')
    expect(runMarkers.length).toBeGreaterThanOrEqual(60)
    expect(runMarkers.length).toBeLessThanOrEqual(62)
    expect(screen.getAllByText(/last week of its month/)).toHaveLength(1)
  })

  it('keeps every week of a year or less', () => {
    const { container } = render(
      <SharedTrendChart
        weeks={sharedWeeks(40)}
        measure="grade"
        windowDays={84}
        effortS={1200}
        latestStartMs={{ run: null, ride: null }}
      />,
    )
    expect(
      container.querySelectorAll('[data-testid="trend-marker"][data-sport="run"]'),
    ).toHaveLength(40)
  })
})
