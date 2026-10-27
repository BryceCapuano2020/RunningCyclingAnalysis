// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GradeProfile } from '../gradeProfile'
import type { Grade, SportGrade } from '../grades'
import { GradeProfileChart } from './GradeProfileChart'
import type { GradeProfileChartProps } from './GradeProfileChart'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** A ResizeObserver that reports the chart at a width, as a browser does on the first measurement. */
function chartWidth(width: number) {
  class SizedObserver {
    private readonly callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    observe() {
      const entry = { contentRect: { width } } as unknown as ResizeObserverEntry
      this.callback([entry], this as unknown as ResizeObserver)
    }

    unobserve() {}

    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', SizedObserver)
}

const MIN = 60
const FINDING = 'Your cycling grades higher up to 5 min, your running from 10 min on.'

function grade(fraction: number): Grade {
  return { grade: fraction, level: 'Local' }
}

function runAt(fraction: number): SportGrade {
  return { centre: grade(fraction), range: null }
}

function rideAt(fraction: number): SportGrade {
  return {
    centre: grade(fraction),
    range: { low: grade(fraction - 0.03), high: grade(fraction + 0.03) },
  }
}

/** Both sports graded from 3 to 60 min at six durations, the ride ahead at the short end and the run at the long end. */
const PROFILE: GradeProfile = {
  run: [
    { durationS: 3 * MIN, grade: runAt(0.5) },
    { durationS: 5 * MIN, grade: runAt(0.52) },
    { durationS: 10 * MIN, grade: runAt(0.62) },
    { durationS: 20 * MIN, grade: runAt(0.64) },
    { durationS: 30 * MIN, grade: runAt(0.65) },
    { durationS: 60 * MIN, grade: runAt(0.66) },
  ],
  ride: [
    { durationS: 3 * MIN, grade: rideAt(0.6) },
    { durationS: 5 * MIN, grade: rideAt(0.6) },
    { durationS: 10 * MIN, grade: rideAt(0.55) },
    { durationS: 20 * MIN, grade: rideAt(0.55) },
    { durationS: 30 * MIN, grade: rideAt(0.54) },
    { durationS: 60 * MIN, grade: rideAt(0.53) },
  ],
}

function renderChart(overrides: Partial<GradeProfileChartProps> = {}) {
  return render(<GradeProfileChart profile={PROFILE} finding={FINDING} {...overrides} />)
}

describe('GradeProfileChart', () => {
  it('is titled Grade by duration, with the finding as its lede', () => {
    renderChart()
    expect(screen.getByRole('figure', { name: 'Grade by duration' })).toBeInTheDocument()
    expect(screen.getByText(FINDING)).toHaveClass('chart-frame__lede')
    expect(screen.getByRole('img', { name: /age grades/i })).toHaveAccessibleName(
      /Duration is on a log scale/,
    )
  })

  it('labels the duration axis 3, 5, 10, 20, 30 and 60, in minutes, and the grade axis in per cent', () => {
    const { container } = renderChart()
    const x = Array.from(container.querySelectorAll('.chart-x-axis__tick')).map(
      (tick) => tick.textContent,
    )
    expect(x).toEqual(['3', '5', '10', '20', '30', '60'])
    const y = Array.from(container.querySelectorAll('.chart-y-axis__tick')).map(
      (tick) => tick.textContent,
    )
    expect(y.length).toBeGreaterThan(1)
    expect(y.every((label) => /^\d+%$/.test(label ?? ''))).toBe(true)
    expect(screen.getByText('Age grade')).toBeInTheDocument()
    expect(screen.getByText('Duration (min)')).toBeInTheDocument()
  })

  it('draws a run as a solid line with dots, and a ride as a dashed line with rings and a band', () => {
    const { container } = renderChart()
    const lines = Array.from(container.querySelectorAll('[data-testid="profile-line"]'))
    expect(lines.map((line) => line.getAttribute('data-sport'))).toEqual(['run', 'ride'])
    expect(lines[0]).not.toHaveClass('chart-series__line--estimate')
    expect(lines[1]).toHaveClass('chart-series__line--estimate')
    expect(
      container.querySelectorAll('[data-testid="profile-marker"][data-sport="run"]'),
    ).toHaveLength(6)
    expect(
      container.querySelectorAll('[data-testid="profile-ring"][data-sport="ride"]'),
    ).toHaveLength(6)
    const band = container.querySelector('[data-testid="profile-band"]')
    expect(band).toHaveClass('chart-series__band--ride')
    expect(band?.getAttribute('d')).toMatch(/^M/)
  })

  it('draws the ride’s line above the run’s at 3 min and below it at 60 min, on one scale', () => {
    const { container } = renderChart()
    const y = (sport: string, index: number) => {
      const marker = container.querySelectorAll(
        `[data-sport="${sport}"][data-testid^="profile-"][cy]`,
      )[index]
      return Number(marker?.getAttribute('cy'))
    }
    // A smaller y is higher on the page.
    expect(y('ride', 0)).toBeLessThan(y('run', 0))
    expect(y('ride', 5)).toBeGreaterThan(y('run', 5))
  })

  it('marks the 20 min grade larger, since it is the grade the balance is taken at', () => {
    const { container } = renderChart()
    const runs = Array.from(
      container.querySelectorAll('[data-testid="profile-marker"][data-sport="run"]'),
    ).map((marker) => Number(marker.getAttribute('r')))
    expect(runs[3]).toBeGreaterThan(runs[2] ?? Infinity)
    expect(runs[2]).toBe(runs[4])
  })

  it('names both sports in the key, with the ride marked as an estimate', () => {
    renderChart()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Run, as recorded')).toBeInTheDocument()
    expect(within(legend).getByText('Ride, estimated')).toBeInTheDocument()
  })

  it('reads a duration by keyboard: both grades, the ride as an estimate with its range', () => {
    renderChart()
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const tooltip = screen.getByRole('status')
    expect(tooltip).toHaveTextContent('3 min')
    expect(within(tooltip).getByText('Run')).toBeInTheDocument()
    expect(tooltip).toHaveTextContent('50%')
    expect(within(tooltip).getByText('Ride, estimated')).toBeInTheDocument()
    expect(tooltip).toHaveTextContent('60%')
    expect(tooltip).toHaveTextContent('57–63%')
    expect(tooltip.querySelector('.chart-tooltip__key--dashed-ride')).not.toBeNull()
  })

  it('says a sport has no grade at a duration where it has none, and draws no point there', () => {
    const profile: GradeProfile = {
      run: PROFILE.run.filter((point) => point.durationS !== 5 * MIN),
      ride: PROFILE.ride,
    }
    const { container } = renderChart({ profile })
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const tooltip = screen.getByRole('status')
    expect(tooltip).toHaveTextContent('5 min')
    expect(tooltip).toHaveTextContent('No run grade at 5 min')
    expect(
      container.querySelectorAll('[data-testid="profile-marker"][data-sport="run"]'),
    ).toHaveLength(5)
    // The run line breaks at the missing duration instead of bridging it.
    const line = container.querySelector('[data-testid="profile-line"][data-sport="run"]')
    expect(line?.getAttribute('d')?.match(/M/g)).toHaveLength(2)
  })

  it('puts the same grades in a table, the ride with its range in brackets', () => {
    renderChart()
    const table = screen.getByRole('table')
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent)
    expect(headers).toEqual(['Duration', 'Run grade', 'Ride grade, estimated'])
    const first = within(table).getAllByRole('row')[1]
    const cells = within(first as HTMLElement)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)
    expect(within(first as HTMLElement).getByRole('rowheader')).toHaveTextContent('3 min')
    expect(cells).toEqual(['50%', '60% (57–63%)'])
    expect(screen.getByText('View as table')).toBeInTheDocument()
  })

  it('explains the band under the plot', () => {
    renderChart()
    expect(screen.getByText(/Shading is the 90% range/)).toBeInTheDocument()
  })

  it('shows a message instead of a plot with fewer than two durations graded', () => {
    renderChart({
      profile: { run: PROFILE.run.slice(0, 1), ride: PROFILE.ride.slice(0, 1) },
    })
    expect(screen.getByText(/to compare them by duration/)).toBeInTheDocument()
    expect(screen.queryByTestId('plot-surface')).toBeNull()
  })

  it('spans only the durations that have a grade, so a short plot starts at its first', () => {
    const profile: GradeProfile = {
      run: PROFILE.run.slice(2),
      ride: PROFILE.ride.slice(2),
    }
    const { container } = renderChart({ profile })
    const x = Array.from(container.querySelectorAll('.chart-x-axis__tick')).map(
      (tick) => tick.textContent,
    )
    expect(x).toEqual(['10', '20', '30', '60'])
  })

  it('keeps both ends and the 20 min tick on a 320 px phone, where the axis thins its labels', () => {
    chartWidth(288)
    const { container } = renderChart()
    const x = Array.from(container.querySelectorAll('.chart-x-axis__tick')).map(
      (tick) => tick.textContent,
    )
    expect(x).toContain('3')
    expect(x).toContain('20')
    expect(x).toContain('60')
    expect(x.length).toBeLessThan(6)
  })

  describe('graded from 3 min to 3 h', () => {
    const MINUTES = [3, 4, 5, 7, 10, 15, 20, 30, 45, 60, 90, 120, 180]
    const LONG: GradeProfile = {
      run: MINUTES.map((m, i) => ({ durationS: m * MIN, grade: runAt(0.7 - i * 0.01) })),
      ride: MINUTES.map((m, i) => ({ durationS: m * MIN, grade: rideAt(0.6 - i * 0.005) })),
    }
    const ticks = (container: HTMLElement) =>
      Array.from(container.querySelectorAll('.chart-x-axis__tick')).map((tick) => tick.textContent)

    it('labels every duration on a wide chart, and lists every one in the table', () => {
      const { container } = renderChart({ profile: LONG })
      expect(ticks(container)).toEqual(MINUTES.map(String))
      expect(screen.getAllByRole('row')).toHaveLength(MINUTES.length + 1)
    })

    it('thins the labels on a 320 px phone, keeping the first, the last and 20, and every point', () => {
      chartWidth(288)
      const { container } = renderChart({ profile: LONG })
      const shown = ticks(container)
      expect(shown).toEqual(expect.arrayContaining(['3', '20', '180']))
      expect(shown.length).toBeLessThan(MINUTES.length)
      expect(
        container.querySelectorAll('[data-testid="profile-marker"][data-sport="run"]'),
      ).toHaveLength(MINUTES.length)
    })

    it('reads a duration that has no label by keyboard, in the tooltip', () => {
      renderChart({ profile: LONG })
      const surface = screen.getByTestId('plot-surface')
      for (let i = 0; i < 4; i++) fireEvent.keyDown(surface, { key: 'ArrowRight' })
      expect(screen.getByRole('status')).toHaveTextContent('7 min')
    })

    it('labels only durations that have a grade, not every length the axis could name', () => {
      const profile: GradeProfile = {
        run: LONG.run.filter((p) => [3, 10, 180].includes(p.durationS / MIN)),
        ride: LONG.ride.filter((p) => [3, 10, 180].includes(p.durationS / MIN)),
      }
      const { container } = renderChart({ profile })
      expect(ticks(container)).toEqual(['3', '10', '180'])
    })
  })
})
