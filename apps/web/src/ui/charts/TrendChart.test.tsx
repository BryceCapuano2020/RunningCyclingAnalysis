// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLAT_RUN_COST, PRIORS, RESTING_W_PER_KG } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { sportGutter } from './sportTrend'
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

  it('names its unit, effort and window, and draws only that sport’s line', () => {
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
    // Six weeks are too short a span to judge, so the figure keeps its descriptive name.
    expect(
      screen.getByRole('figure', {
        name: 'Run flat pace per kilometre, best 20 min, trailing 2 weeks',
      }),
    ).toBeInTheDocument()
    expect(container.querySelectorAll('[data-testid="trend-line"]')).toHaveLength(1)
  })

  it('says what the line found once its span is long enough to judge', () => {
    // Fourteen weeks, from 4.0 to 4.39 m/s: 4:10 to 3:48 per km, 22 s faster.
    const points = Array.from({ length: 14 }, (_, week) =>
      point(week, runWkgAt(4 + week * 0.03), null),
    )
    render(
      <TrendChart
        sport="run"
        points={points}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    expect(
      screen.getByRole('figure', {
        name: 'Your best 20 min pace is 22 s per kilometre faster since 12 Jan',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Run flat pace per kilometre, best 20 min, trailing 2 weeks'),
    ).toBeInTheDocument()
  })

  it('labels the vertical axis in pace, faster up, and the weeks by their end dates', () => {
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
    expect(container.querySelector('.chart-y-axis__title')?.textContent).toBe(
      'Flat pace (/km), faster up',
    )
    // The axis is fitted to 3:53 to 4:10 per km, not a fixed span: its ticks are ten seconds apart and
    // within a minute of the data, and a faster pace sits higher on the page.
    const seconds = labels.map((label) => {
      const [m, s] = (label ?? '').split(':').map(Number)
      return m! * 60 + s!
    })
    expect(Math.max(...seconds) - Math.min(...seconds)).toBeLessThanOrEqual(60)
    expect(seconds.every((value, i) => i === 0 || value - seconds[i - 1]! === 10)).toBe(true)
    expect(Math.min(...seconds)).toBeLessThanOrEqual(233)
    expect(Math.max(...seconds)).toBeGreaterThanOrEqual(250)
    const ys = ticks.map((tick) => Number(tick.getAttribute('y')))
    expect(ys.every((y, i) => i === 0 || y > ys[i - 1]!)).toBe(true)
    expect(
      Array.from(container.querySelectorAll('.chart-x-axis__tick')).map((t) => t.textContent),
    ).toEqual(['12 Jan', '19 Jan', '26 Jan', '2 Feb', '9 Feb', '16 Feb'])
    // The tick labels are the dates, so the date axis has no title of its own, and the plot leaves room
    // only for them: they sit 18 px below the plot, which ends the untitled margin above the chart's foot.
    expect(container.querySelector('.chart-x-axis__title')).toBeNull()
    expect(Number(container.querySelector('.chart-x-axis__tick')?.getAttribute('y'))).toBe(
      Number(container.querySelector('svg')?.getAttribute('height')) -
        PLOT_BOTTOM_WITHOUT_X_TITLE +
        18,
    )
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
    // The latest run is 4.3 m/s, which is 3:53 /km. Its label gives the value alone, since the title names the window.
    expect(container.querySelector('.annot--end .annot__text--label')?.textContent).toBe('3:53 /km')
  })

  it('sets the latest label in the gutter right of the plot, level with its point', () => {
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
    const label = container.querySelector('.annot--end .annot__text--label')
    const latest = screen.getByTestId('trend-latest')
    expect(label?.getAttribute('text-anchor')).toBe('start')
    expect(Number(label?.getAttribute('x'))).toBeGreaterThan(Number(latest.getAttribute('cx')))
    expect(
      Math.abs(Number(label?.getAttribute('y')) - Number(latest.getAttribute('cy'))),
    ).toBeLessThan(12)
  })

  it('bridges a gap of a week or two in one smooth line', () => {
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
    // Weeks 2 and 4 have no value, but each is short of eight weeks: one piece, and no steps.
    const d = container.querySelector('[data-testid="trend-line"]')?.getAttribute('d') ?? ''
    expect(d.match(/M/g)).toHaveLength(1)
    expect(d).toMatch(/C/)
    expect(d).not.toMatch(/[HV]/)
  })

  it('breaks the line where eight weeks or more had no run, and notes where', () => {
    const gap = Array.from({ length: 24 }, (_, week) =>
      point(week, week >= 5 && week < 15 ? null : runWkgAt(4 + (week % 4) / 20), null),
    )
    const { container } = render(
      <TrendChart
        sport="run"
        points={gap}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    const line = container.querySelector('[data-testid="trend-line"]')
    expect(line?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
    expect(container.querySelector('.chart-about')).toHaveTextContent(
      /The line breaks from .* no runs of 20 min or longer in that time\./,
    )
  })

  it('draws no year without a ride as a flat line: the weeks before the first ride and after the last are left off', () => {
    const rides = Array.from({ length: 30 }, (_, week) =>
      point(week, null, week >= 10 && week < 20 ? rideWkgAt(240 + week) : null),
    )
    const { container } = render(
      <TrendChart
        sport="ride"
        points={rides}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    expect(tableOf(container).rows).toHaveLength(10)
    expect(container.querySelector('.chart-about')).toHaveTextContent(
      /Covers 23 Mar to 25 May 2025, from your first to your last ride of 20 min or longer with power\./,
    )
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })

  it('washes the area under a line of four weeks or more in the sport’s soft colour', () => {
    const rides = Array.from({ length: 6 }, (_, week) =>
      point(week, null, rideWkgAt(250 + week * 5)),
    )
    const { container } = render(
      <TrendChart
        sport="ride"
        points={rides}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    const wash = container.querySelector('.trend-wash')
    // The wash takes its colour from --sport-colour-soft, which data-sport sets for the ride.
    expect(wash).toHaveAttribute('data-sport', 'ride')
    expect(wash?.getAttribute('d')).toMatch(/Z/)
  })

  it('leaves a short stretch of weeks as markers on a line, with no wash under it', () => {
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
    expect(container.querySelector('.trend-wash')?.getAttribute('d')).toBe('')
    expect(screen.getAllByTestId('trend-marker').length).toBeGreaterThanOrEqual(2)
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

  it('prices a ride’s week at the body mass of the ride that set it', () => {
    // The watts follow the ride's mass, not the current one.
    const lighter = { ...point(1, null, rideWkgAt(250)), rideMassKg: 60 }
    const { container } = render(
      <TrendChart
        sport="ride"
        points={[lighter, { ...lighter, endMs: lighter.endMs + WEEK_MS }]}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={TWENTY_MINUTES_S}
      />,
    )
    const { rows } = tableOf(container)
    const watts = rideWkgAt(250) * PRIORS.grossEfficiency.mean * 60
    expect(rows[0]?.[1]).toBe(`${Math.round(watts)} W`)
    expect(rows[0]?.[2]).toBe(`${(watts / 60).toFixed(1)} W/kg`)
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
    // The first week has no ride, so the table starts at the first week that has one.
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual(['Sun 19 Jan 2025', '250 W', '3.3 W/kg', '1'])
    expect(container.querySelector('caption')?.textContent).toMatch(/best 20 min in the 2 weeks/)
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
    expect(screen.getByText(/best 20 min, trailing 30 days$/)).toBeInTheDocument()
  })

  it('says no step note under the chart: the line is smooth, and the caption names the window', () => {
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
    // One short sentence says what a point is; the rest is behind About this chart, and a plain trend has none.
    expect(container.querySelector('.chart-frame__note')).toHaveTextContent(
      'Each point is your best 20 min of the 2 weeks to that Sunday.',
    )
    expect(container.querySelector('.chart-about')).toBeNull()
    expect(screen.queryByText(/steps/)).toBeNull()
    expect(container.querySelector('caption')).toHaveTextContent(
      'The line is smoothed between weeks.',
    )
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
    expect(screen.queryByRole('img', { name: /^Ride, best 20 min/ })).toBeNull()
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

  it('draws no wash for a zero effort, and leaves no NaN or Infinity', () => {
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
    expect(container.querySelector('.trend-wash')).toBeNull()
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
      screen.getByText('Run flat pace per kilometre, best 5 min, trailing 2 weeks'),
    ).toBeInTheDocument()
    expect(container.querySelector('caption')?.textContent).toMatch(/best 5 min in the 2 weeks/)
  })

  it('names an hour-long effort in the segment’s own label, as 60 min, not as an hour', () => {
    render(
      <TrendChart
        sport="ride"
        points={RIDE_POINTS}
        massKg={MASS_KG}
        units="metric"
        windowDays={TWO_WEEKS}
        effortS={3600}
      />,
    )
    expect(
      screen.getByText('Ride power in watts, best 60 min, trailing 2 weeks'),
    ).toBeInTheDocument()
  })

  it('reads the week nearest the pointer, as a smooth line is drawn through its weeks', () => {
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
    // The chart is 640 px wide (the fallback width), with the plot from 56 px to the gutter that holds the
    // latest label. Six weeks stand a fifth of the plot apart; 70% of the way from week 1 to week 2 is nearer 2.
    const right = 640 - sportGutter('3:53 /km')
    const step = (right - 56) / 5
    const surface = screen.getByTestId('plot-surface')
    fireEvent.pointerMove(surface, { clientX: 56 + step + 0.7 * step, clientY: 100 })
    expect(screen.getByRole('status')).toHaveTextContent('Week ending Sun 26 Jan 2025')
    expect(container.querySelectorAll('[data-testid="plot-surface"]')).toHaveLength(1)
  })
})
