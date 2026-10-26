// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLAT_RUN_COST, PRIORS, RESTING_W_PER_KG } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { TrendChart } from './TrendChart'

const WEEK_MS = 7 * 86_400_000
const MASS_KG = 75

/** Sunday 12 January 2025, 23:59:59.999 UTC: the end of the first week. */
const FIRST_END = Date.UTC(2025, 0, 12, 23, 59, 59, 999)

/** The metabolic W/kg of running at a speed in m/s, as the analysis gives it. */
const runWkgAt = (speedMs: number) => RESTING_W_PER_KG + FLAT_RUN_COST * speedMs

/** The metabolic W/kg of cycling at a power in watts, as the analysis gives it. */
const rideWkgAt = (watts: number) => watts / (PRIORS.grossEfficiency.mean * MASS_KG)

function point(week: number, runWkg: number | null, rideWkg: number | null): TrendPoint {
  const endMs = FIRST_END + week * WEEK_MS
  return {
    endMs,
    runWkg,
    rideWkg,
    runCount: runWkg === null ? 0 : 2,
    rideCount: rideWkg === null ? 0 : 1,
    runAtMs: runWkg === null ? null : endMs,
    rideAtMs: rideWkg === null ? null : endMs,
    rideRunSpeed: null,
  }
}

/** Four-metre-per-second running (4:10 /km) in weeks 0, 1 and 5, with week 3 alone. */
const RUN_POINTS: TrendPoint[] = [
  point(0, runWkgAt(4), null),
  point(1, runWkgAt(4.1), null),
  point(2, null, null),
  point(3, runWkgAt(4.2), null),
  point(4, null, null),
  point(5, runWkgAt(4.3), null),
]

/** Cycling at 250 W in weeks 1 and 2, then 260 W in week 3. */
const RIDE_POINTS: TrendPoint[] = [
  point(0, null, null),
  point(1, null, rideWkgAt(250)),
  point(2, null, rideWkgAt(250)),
  point(3, null, rideWkgAt(260)),
]

const TWO_WEEKS = 14
const TWENTY_MINUTES_S = 1200

function tableOf(container: HTMLElement) {
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
  const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((td) => td.textContent),
  )
  return { headers, rows }
}

describe('TrendChart', () => {
  beforeEach(() => {
    // formatDay leaves out the year in the current year, so the clock is pinned to another year.
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 10))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('titles the chart with its sport and its unit, and draws only that sport’s line', () => {
    const { container } = render(
      <TrendChart
        sport="run"
        points={RUN_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    expect(
      screen.getByRole('figure', {
        name: 'Running flat pace per kilometre, best 20 minutes, trailing 2 weeks',
      }),
    ).toBeInTheDocument()
    expect(container.querySelectorAll('[data-testid="trend-line"]')).toHaveLength(1)
  })

  it('labels the vertical axis in pace, faster up, and the date axis with each week’s end', () => {
    const { container } = render(
      <TrendChart
        sport="run"
        points={RUN_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    const ticks = Array.from(container.querySelectorAll('.chart-y-axis__tick'))
    const labels = ticks.map((tick) => tick.textContent)
    expect(labels).toContain('4:00')
    expect(container.querySelector('.chart-y-axis__title')?.textContent).toBe(
      'Flat pace (/km), faster up',
    )
    // A faster pace sits higher, so the 3:30 tick is above the 4:30 one.
    const yOf = (label: string) =>
      Number(ticks.find((tick) => tick.textContent === label)?.getAttribute('y'))
    expect(yOf('3:30')).toBeLessThan(yOf('4:30'))
    expect(
      Array.from(container.querySelectorAll('.chart-x-axis__tick')).map((t) => t.textContent),
    ).toEqual(['12 Jan', '19 Jan', '26 Jan', '2 Feb', '9 Feb', '16 Feb'])
    expect(container.querySelector('.chart-x-axis__title')?.textContent).toBe('Date')
  })

  it('marks each weekly value, and labels the latest one', () => {
    const { container } = render(
      <TrendChart
        sport="run"
        points={RUN_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    // Weeks 0, 1 and 3 are marked; week 5 is the latest value, which has its own larger marker.
    expect(screen.getAllByTestId('trend-marker')).toHaveLength(3)
    expect(screen.getByTestId('trend-latest')).toBeInTheDocument()
    // The latest run is 4.3 m/s, which is 3:53 /km, and its label names the window it covers.
    expect(container.querySelector('.chart-series__label')?.textContent).toBe(
      '3:53 /km, last 2 weeks',
    )
  })

  it('breaks the line at a gap instead of bridging it', () => {
    const { container } = render(
      <TrendChart
        sport="run"
        points={RUN_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    // Runs in weeks 0 and 1, week 3 alone, and week 5: three pieces, so three moveto commands.
    const line = container.querySelector('[data-testid="trend-line"]')
    expect(line?.getAttribute('d')?.match(/M/g)).toHaveLength(3)
  })

  it('fills the area under the line in the sport’s soft colour', () => {
    const { container } = render(
      <TrendChart
        sport="ride"
        points={RIDE_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    const area = container.querySelector('.chart-series__area--ride')
    expect(area?.getAttribute('d')).toMatch(/Z/)
  })

  it('names each week by its UTC Sunday, whatever the viewer zone', () => {
    vi.stubEnv('TZ', 'Pacific/Auckland')
    // 23:59 UTC on Sunday is already Monday in Auckland; the week still ends on the Sunday.
    const { container } = render(
      <TrendChart
        sport="run"
        points={RUN_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    expect(tableOf(container).rows[0]?.[0]).toBe('Sun 12 Jan 2025')
  })

  it('describes the plot surface with a tooltip', () => {
    render(
      <TrendChart
        sport="run"
        points={RUN_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    const plot = screen.getByTestId('plot-surface')
    expect(plot).toHaveAttribute('tabindex', '0')
    const described = (plot.getAttribute('aria-describedby') ?? '').split(' ')
    expect(described.map((id) => document.getElementById(id)?.getAttribute('role'))).toContain(
      'status',
    )
  })

  it('shows the week and the sport’s value when the arrow keys move the active point', () => {
    render(
      <TrendChart
        sport="run"
        points={RUN_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    const plot = screen.getByTestId('plot-surface')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()

    fireEvent.keyDown(plot, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('Sun 12 Jan 2025')
    expect(screen.getByRole('status')).toHaveTextContent('4:10 /km')
    expect(screen.getByRole('status')).toHaveTextContent('2 runs in the window')

    fireEvent.keyDown(plot, { key: 'ArrowLeft' })
    fireEvent.keyDown(plot, { key: 'ArrowRight' })
    fireEvent.keyDown(plot, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('No runs in the window')

    fireEvent.keyDown(plot, { key: 'Escape' })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('gives a cycling value in watts with its W/kg in the tooltip', () => {
    render(
      <TrendChart
        sport="ride"
        points={RIDE_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('250 W')
    expect(status).toHaveTextContent('3.3 W/kg')
  })

  it('lists every week in the table view, in the sport’s units, with the window in the caption', () => {
    const { container } = render(
      <TrendChart
        sport="ride"
        points={RIDE_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    const { headers, rows } = tableOf(container)
    expect(headers).toEqual(['Week ending', 'Power', 'W/kg', 'Rides'])
    expect(rows).toHaveLength(4)
    expect(rows[1]).toEqual(['Sun 19 Jan 2025', '250 W', '3.3 W/kg', '1'])
    expect(rows[0]).toEqual(['Sun 12 Jan 2025', '—', '—', '0'])
    expect(container.querySelector('caption')?.textContent).toMatch(
      /best 20 minutes in the 2 weeks/,
    )
  })

  it('names the window in days when it is not a whole number of weeks', () => {
    render(
      <TrendChart
        sport="run"
        points={RUN_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={30}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    expect(
      screen.getByRole('figure', { name: /best 20 minutes, trailing 30 days$/ }),
    ).toBeInTheDocument()
  })

  it('says each point is the best effort in its window, and that each line steps to the next Sunday', () => {
    render(
      <TrendChart
        sport="run"
        points={RUN_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    expect(
      screen.getByText(
        'Each point is the best 20 minutes in the 2 weeks to that Sunday. Each line steps from one Sunday to the next, and breaks where a week has no value.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/holds/)).toBeNull()
  })

  it('shows an empty state with fewer than two weeks of a sport', () => {
    render(
      <TrendChart
        sport="ride"
        points={[point(0, 14, null), point(1, null, null)]}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    expect(screen.queryByRole('img', { name: /^Cycling, best 20 minutes/ })).toBeNull()
    expect(screen.getByText('Add rides in more than one week to see a trend')).toBeInTheDocument()
  })

  it('leaves out the W/kg column for running, which names only its pace', () => {
    const { container } = render(
      <TrendChart
        sport="run"
        points={RUN_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    const { headers } = tableOf(container)
    expect(within(container).queryByText('W/kg')).toBeNull()
    expect(headers).toEqual(['Week ending', 'Flat pace', 'Runs'])
  })

  it('fills no area under a pace line, and leaves no NaN or Infinity for a zero effort', () => {
    const { container } = render(
      <TrendChart
        sport="run"
        points={[
          point(0, runWkgAt(0), null),
          point(1, runWkgAt(4), null),
          point(2, runWkgAt(-1), null),
        ]}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    expect(container.querySelector('.chart-series__area')).toBeNull()
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
    expect(tableOf(container).rows.flat().join(' ')).not.toMatch(/NaN|Infinity/)
  })

  it('names the effort length in the chart name and in the table caption', () => {
    const { container } = render(
      <TrendChart
        sport="run"
        points={RUN_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={300}
      />,
    )
    expect(
      screen.getByRole('figure', {
        name: 'Running flat pace per kilometre, best 5 minutes, trailing 2 weeks',
      }),
    ).toBeInTheDocument()
    expect(container.querySelector('caption')?.textContent).toMatch(/best 5 minutes in the 2 weeks/)
  })

  it('reads the week before the pointer, since a stepped line holds that week’s value to the next', () => {
    const { container } = render(
      <TrendChart
        sport="run"
        points={RUN_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    // The chart is 640 px wide (the fallback width), with the plot from 56 to 624 px. Weeks 1 and 2
    // are 113.6 px apart, and 70% of the way from week 1 to week 2 is nearer to week 2.
    const x = 56 + 0.2 * 568 + 0.7 * 113.6
    const surface = screen.getByTestId('plot-surface')
    fireEvent.pointerMove(surface, { clientX: x, clientY: 100 })
    expect(screen.getByRole('status')).toHaveTextContent('Week ending Sun 19 Jan 2025')
    expect(container.querySelectorAll('[data-testid="plot-surface"]')).toHaveLength(1)
  })
})
