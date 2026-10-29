// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SharedWeek } from './gradeTrend'
import { SharedTrendChart } from './SharedTrendChart'
import type { SharedTrendChartProps } from './SharedTrendChart'
import { week } from './sharedTrendFixtures'

afterEach(cleanup)

function renderChart(weeks: SharedWeek[], overrides: Partial<SharedTrendChartProps> = {}) {
  return render(
    <SharedTrendChart
      weeks={weeks}
      windowDays={14}
      effortS={1200}
      latestStartMs={{ run: null, ride: null }}
      {...overrides}
    />,
  )
}

/** The chart's title, which is also the name of its figure. */
function titleText(): string {
  const id = screen.getByRole('figure').getAttribute('aria-labelledby')
  return document.getElementById(id ?? '')?.textContent ?? ''
}

/** `count` weeks whose run and ride follow the given grade paths, the ride with its range of 3 points each side. */
const series = (count: number, run: (i: number) => number, ride: (i: number) => number | null) =>
  Array.from({ length: count }, (_, i) => week(i, run(i), ride(i)))

/** Weeks from 7 Jan 2024. */
describe('SharedTrendChart takeaway title', () => {
  it('says both sports held steady when neither moved beyond the range', () => {
    renderChart(
      series(
        14,
        (i) => 0.6 + (i % 2) / 1000,
        (i) => 0.5 + (i % 2) / 1000,
      ),
    )
    expect(titleText()).toBe('Running and cycling have held steady since 7 Jan')
  })

  it('says a run held steady and a ride rose when only the ride moved clear of its range', () => {
    renderChart(
      series(
        14,
        () => 0.6,
        (i) => 0.5 + i * 0.01,
      ),
    )
    expect(titleText()).toBe('Running has held steady; cycling rose 13 points since 7 Jan')
  })

  it('calls a rise in a run with no range a change, but the same rise in a ride steady when its range covers it', () => {
    // Both sports rise about 5 points. The run has no range; the ride's range is 3 points each side at both ends,
    // so its two ranges overlap and the rise is not one a reader should rely on.
    renderChart(
      series(
        14,
        (i) => 0.6 + i * 0.004,
        (i) => 0.5 + i * 0.004,
      ),
    )
    expect(titleText()).toBe('Running rose 5 points; cycling has held steady since 7 Jan')
  })

  it('counts the ride’s rise once its range no longer reaches the start’s', () => {
    renderChart(
      series(
        14,
        () => 0.6,
        (i) => 0.5 + i * 0.006,
      ),
    )
    expect(titleText()).toMatch(/^Running has held steady; cycling rose \d+ points since 7 Jan$/)
  })

  it('tells a fall as a fall', () => {
    renderChart(
      series(
        14,
        (i) => 0.7 - i * 0.01,
        () => 0.5,
      ),
    )
    expect(titleText()).toMatch(/^Running fell \d+ points; cycling has held steady since 7 Jan$/)
  })

  it('names the sport alone while the ride is held for want of a weight', () => {
    renderChart(
      series(
        14,
        (i) => 0.6 + i * 0.01,
        () => 0.5,
      ),
      { rideKnown: false },
    )
    expect(titleText()).toMatch(/^Running rose \d+ points since 7 Jan$/)
  })

  it('judges a span of over a year by its last year, and keeps the measure under the title', () => {
    const long = series(
      80,
      () => 0.6,
      (i) => (i > 20 ? 0.5 + i / 400 : null),
    )
    renderChart(long)
    // The ride rose over the last year; the run held steady, and neither is told from the start.
    expect(titleText()).toBe('Running has held steady; cycling rose 13 points over the last year')
    expect(screen.getByText('Age grade of your best 20 min, trailing 2 weeks')).toBeInTheDocument()
  })

  it('says where a run stands under an older peak, and that the last year was steady', () => {
    const weeks = series(
      160,
      (i) => (i <= 70 ? 0.5 + i / 500 : i <= 110 ? 0.64 - (i - 70) / 1000 : 0.6),
      () => null,
    )
    renderChart(weeks)
    expect(titleText()).toBe('Running is 4 points under its 2025 peak; steady over the last year')
  })

  it('keeps the descriptive title for a span under twelve weeks, which a week’s effort alone could swing', () => {
    renderChart(
      series(
        8,
        (i) => 0.5 + i * 0.03,
        () => null,
      ),
    )
    expect(titleText()).toBe('Age grade of your best 20 min, trailing 2 weeks')
  })

  it('keeps the descriptive title when no sport has two values to compare', () => {
    renderChart([week(0, 0.6, null), week(1, null, 0.5), week(2, null, null)])
    expect(titleText()).toBe('Age grade of your best 20 min, trailing 2 weeks')
  })
})
