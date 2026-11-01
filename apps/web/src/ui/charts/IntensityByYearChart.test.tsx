// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IntensityRow, IntensityShares } from '@rca/core/history'
import '../../test/deviceZone'
import { IntensityByYearChart } from './IntensityByYearChart'

/** A ResizeObserver that reports the chart at a width, as a browser does on the first measurement. */
function chartWidth(width: number) {
  class SizedObserver {
    callback: ResizeObserverCallback
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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const NONE: IntensityShares = {
  easy: 0,
  moderate: 0,
  hard: 0,
  seconds: 0,
  counted: 0,
  noZones: 0,
  activities: 0,
}
/** Twenty hours of heart-rate time, the floor for a year to be the finding. */
const shares = (easy: number, moderate: number, hard: number): IntensityShares => ({
  easy,
  moderate,
  hard,
  seconds: 72_000,
  counted: 12,
  noZones: 0,
  activities: 12,
})
const yearOf = (year: number, run: IntensityShares = NONE): IntensityRow => ({
  year,
  sports: { run, ride: NONE },
})

const YEARS: IntensityRow[] = [
  yearOf(2023, shares(0.6, 0.3, 0.1)),
  yearOf(2024, shares(0.5, 0.3, 0.2)),
  yearOf(2025, shares(0.25, 0.25, 0.5)),
]

const bands = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid="intensity-band"]'), (band) =>
    band.getAttribute('data-band'),
  )

describe('IntensityByYearChart', () => {
  it('titles the finding, and draws each year from the foot up in easy, moderate and hard', () => {
    chartWidth(800)
    const { container } = render(<IntensityByYearChart years={YEARS} sport="run" />)
    expect(
      screen.getByRole('figure', { name: '2025 was your hardest year for running' }),
    ).toBeInTheDocument()
    expect(bands(container)).toEqual([
      'easy',
      'moderate',
      'hard',
      'easy',
      'moderate',
      'hard',
      'easy',
      'moderate',
      'hard',
    ])
  })

  it('names the measure when no year leads the next by enough, and keys the three bands', () => {
    chartWidth(800)
    render(
      <IntensityByYearChart
        years={[yearOf(2024, shares(0.5, 0.3, 0.2)), yearOf(2025, shares(0.5, 0.3, 0.22))]}
        sport="run"
      />,
    )
    expect(screen.getByRole('figure', { name: 'Run intensity by year' })).toBeInTheDocument()
    const labels = Array.from(
      document.querySelectorAll('.intensity-key__label'),
      (el) => el.textContent,
    )
    expect(labels).toEqual(['Easy', 'Moderate', 'Hard'])
  })

  it('reads a year with the keyboard, from its top band down to its time', () => {
    chartWidth(800)
    render(<IntensityByYearChart years={YEARS} sport="run" />)
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'Home' })
    const status = screen.getByRole('status')
    for (const text of [
      '2023',
      '10% Hard',
      '30% Moderate',
      '60% Easy',
      '20.0 h Heart-rate time',
      '12 runs',
    ]) {
      expect(status).toHaveTextContent(text)
    }
  })

  it('gives a table with a row for each year, dashes where a year has no heart rate', () => {
    chartWidth(800)
    render(<IntensityByYearChart years={[...YEARS, yearOf(2026)]} sport="run" />)
    const table = screen.getByRole('table', { name: 'Heart-rate time by intensity, for runs' })
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => {
        const cells = within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent)
        return [within(row).getByRole('rowheader').textContent].concat(cells)
      })
    expect(rows[0]).toEqual(['2023', '60%', '30%', '10%', '20.0', '12'])
    expect(rows.at(-1)).toEqual(['2026', '—', '—', '—', '—', '0'])
  })

  it('says what to add when the sport has no heart rate, and draws no band', () => {
    chartWidth(800)
    const { container } = render(<IntensityByYearChart years={[yearOf(2025)]} sport="run" />)
    expect(
      screen.getByText("Add runs with a heart rate to see each year's intensity."),
    ).toBeInTheDocument()
    expect(bands(container)).toEqual([])
  })
})
