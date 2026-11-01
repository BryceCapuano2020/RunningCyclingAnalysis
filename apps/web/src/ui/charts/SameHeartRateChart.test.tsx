// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../test/deviceZone'
import type { SameHeartRate, SameHeartRateWeek } from '@rca/core/digest'
import { SameHeartRateChart } from './SameHeartRateChart'

const WEEK_MS = 7 * 86_400_000
/** Sunday 12 January 2025, 23:59:59.999 UTC. */
const FIRST_END = Date.UTC(2025, 0, 12, 23, 59, 59, 999)
const NOTE = 'How to read it.'

function week(index: number, output: number | null, spread = 0.03): SameHeartRateWeek {
  return {
    endMs: FIRST_END + index * WEEK_MS,
    fit:
      output === null ? null : { output, low: output * (1 - spread), high: output * (1 + spread) },
    lacks: output === null ? 'activities' : null,
    blocks: 14,
    activities: 5,
  }
}

function dataOf(outputs: (number | null)[]): SameHeartRate {
  const weeks = outputs.map((output, i) => week(i, output))
  const reported = weeks.filter((w) => w.fit !== null)
  return {
    referenceHeartRate: 145,
    weeks,
    reportedWeeks: reported.length,
    lacks: null,
    latestWeekEndMs: reported.at(-1)!.endMs,
  }
}

/** Running at 3.0 m/s (5:33 /km) rising to 3.3 m/s, with a week in the middle that did not report. */
const RUN = dataOf([3.0, 3.1, null, 3.2, 3.3])
/** Riding at 200 W rising to 214 W. */
const RIDE = dataOf([200, 204, 208, null, 214])

function tableOf(container: HTMLElement) {
  const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
  const rows = Array.from(container.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((td) => td.textContent),
  )
  return { headers, rows }
}

describe('SameHeartRateChart', () => {
  beforeEach(() => {
    // formatDay leaves out the year in the current year, so the clock is pinned to another year.
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 5, 10))
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('puts the reference heart rate and the sport’s unit in its title', () => {
    render(<SameHeartRateChart sport="run" data={RUN} units="metric" note={NOTE} />)
    expect(
      screen.getByRole('figure', { name: 'Your output at 145 bpm, flat pace per kilometre' }),
    ).toBeInTheDocument()
  })

  it('draws a light dot for each reporting week, and a mark where a week is missing, and no fitted line', () => {
    const { container } = render(
      <SameHeartRateChart sport="run" data={RUN} units="metric" note={NOTE} />,
    )
    const dots = container.querySelectorAll('[data-testid="same-hr-marker"]')
    expect(dots).toHaveLength(4)
    for (const dot of Array.from(dots)) expect(dot).toHaveClass('chart-series__marker--light')
    // A line through weeks whose windows overlap would claim a trend the data cannot show, so none is drawn.
    expect(container.querySelector('[data-testid="same-hr-trend"]')).toBeNull()
    expect(container.querySelector('[data-testid="same-hr-band"]')).toBeNull()
    expect(container.querySelectorAll('[data-testid="trend-gap"]')).toHaveLength(1)
    // The error bars that overlapped are gone: the weeks' ranges are in the tooltip and the table.
    expect(container.querySelector('[data-testid="same-hr-interval"]')).toBeNull()
  })

  it('puts a faster pace higher on the page, since faster is up', () => {
    const { container } = render(
      <SameHeartRateChart sport="run" data={RUN} units="metric" note={NOTE} />,
    )
    const ys = Array.from(container.querySelectorAll('[data-testid="same-hr-marker"]')).map((dot) =>
      Number(dot.getAttribute('cy')),
    )
    // The weeks get faster from 3.0 to 3.3 m/s, so each reporting dot is higher (a smaller y) than the one before.
    expect(ys).toHaveLength(4)
    ys.slice(1).forEach((y, i) => expect(y).toBeLessThan(ys[i]!))
  })

  it('says no change anywhere: the chart is named by what it plots and carries no finding', () => {
    const { container } = render(
      <SameHeartRateChart sport="ride" data={RIDE} units="metric" note={NOTE} />,
    )
    screen.getByRole('figure', { name: 'Your output at 145 bpm, power in watts' })
    expect(container.textContent).not.toMatch(
      /no clear change|at the same heart rate|more than|less than/i,
    )
    expect(container.querySelector('.chart-frame__takeaway')).toBeNull()
  })

  it('draws a run as dots and a ride as diamonds', () => {
    const run = render(<SameHeartRateChart sport="run" data={RUN} units="metric" note={NOTE} />)
    const shapes = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('[data-testid="same-hr-marker"]')).map((m) =>
        m.getAttribute('data-shape'),
      )
    expect(new Set(shapes(run.container))).toEqual(new Set(['circle']))
    run.unmount()
    const ride = render(<SameHeartRateChart sport="ride" data={RIDE} units="metric" note={NOTE} />)
    expect(new Set(shapes(ride.container))).toEqual(new Set(['diamond']))
  })

  it('labels the pace axis faster up, and a power axis in watts that does not start at zero', () => {
    const run = render(<SameHeartRateChart sport="run" data={RUN} units="metric" note={NOTE} />)
    expect(run.container.querySelector('.chart-y-axis__title')?.textContent).toBe(
      'Flat pace (/km), faster up',
    )
    run.unmount()
    const ride = render(<SameHeartRateChart sport="ride" data={RIDE} units="metric" note={NOTE} />)
    const labels = Array.from(ride.container.querySelectorAll('.chart-y-axis__tick')).map(
      (tick) => tick.textContent,
    )
    expect(ride.container.querySelector('.chart-y-axis__title')?.textContent).toBe('Power (W)')
    expect(labels).not.toContain('0')
  })

  it('keeps a steady output looking steady: the axis covers 5% either way of the readings', () => {
    const steady: SameHeartRate = {
      ...RIDE,
      weeks: [200, 200.2, 199.9, 200.1].map((output, i) => week(i, output, 0.001)),
    }
    const { container } = render(
      <SameHeartRateChart sport="ride" data={steady} units="metric" note={NOTE} />,
    )
    const labels = Array.from(container.querySelectorAll('.chart-y-axis__tick')).map((tick) =>
      Number(tick.textContent),
    )
    expect(Math.min(...labels)).toBeLessThanOrEqual(190)
    expect(Math.max(...labels)).toBeGreaterThanOrEqual(210)
  })

  it('reads a week’s value and range by keyboard, and says what a gap week lacked', () => {
    render(<SameHeartRateChart sport="ride" data={RIDE} units="metric" note={NOTE} />)
    const plot = screen.getByTestId('plot-surface')
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    fireEvent.keyDown(plot, { key: 'ArrowRight' })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Sun 12 Jan 2025')
    expect(status).toHaveTextContent('200 W')
    expect(status).toHaveTextContent('90% range 194 W to 206 W')
    expect(status).toHaveTextContent('14 stretches from 5 rides')
    for (let i = 0; i < 3; i++) fireEvent.keyDown(plot, { key: 'ArrowRight' })
    expect(status).toHaveTextContent('Needs steady stretches from at least 6 rides')
    fireEvent.keyDown(plot, { key: 'Escape' })
    expect(status).toBeEmptyDOMElement()
  })

  it('lists every week in the table view, with the range and the stretches', () => {
    const { container } = render(
      <SameHeartRateChart sport="run" data={RUN} units="metric" note={NOTE} />,
    )
    const { headers, rows } = tableOf(container)
    expect(headers).toEqual(['Week ending', 'Flat pace', '90% range', 'Stretches'])
    expect(rows).toHaveLength(5)
    expect(rows[0]).toEqual(['Sun 12 Jan 2025', '5:33 /km', '5:24 /km to 5:44 /km', '14'])
    expect(rows[2]).toEqual(['Sun 26 Jan 2025', '—', '—', '14'])
    expect(container.querySelector('caption')?.textContent).toMatch(/at 145 bpm/)
  })

  it('shows its note under the plot', () => {
    render(<SameHeartRateChart sport="run" data={RUN} units="metric" note={NOTE} />)
    expect(screen.getByText(NOTE)).toBeInTheDocument()
  })

  it('shows an empty state with fewer than two reporting weeks', () => {
    const { container } = render(
      <SameHeartRateChart
        sport="run"
        data={dataOf([3.0, null, null])}
        units="metric"
        note={NOTE}
      />,
    )
    expect(container.querySelector('.chart-frame__empty')).not.toBeNull()
    // It names the gate that failed, with its numbers.
    expect(container.querySelector('.chart-frame__empty')?.textContent).toContain(
      'a week needs 8 steady 5-minute stretches from 6 activities in 2 different weeks, and the chart needs 4 weeks with a reading',
    )
    expect(container.querySelectorAll('[data-testid="same-hr-marker"]')).toHaveLength(0)
  })

  it('has no NaN or Infinity anywhere in what it draws', () => {
    const { container } = render(
      <SameHeartRateChart sport="run" data={RUN} units="metric" note={NOTE} />,
    )
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })
})
