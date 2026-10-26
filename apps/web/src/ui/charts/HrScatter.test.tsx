// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HrCrossCheck, HrPoint, LinearFit } from '@rca/core/types'
import { hrFixture, hrRunOnlyFixture } from './fixtures'
import { HrScatter } from './HrScatter'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const hrCss = await readStylesheet(import.meta.url, './HrScatter.css')

const TITLE = 'Heart rate against energy rate'

/** The static chart image is named by its title, then its description. */
const EMPTY =
  'Not enough steady heart-rate data yet. It takes roughly 8 five-minute blocks per sport across a range of efforts'

/** The data table at index i in the table view: 0 is the summary, 1 is one row per plotted block. */
function tableAt(container: HTMLElement, index: number) {
  const table = container.querySelectorAll('table')[index]
  if (!table) throw new Error(`no table at ${index}`)
  const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent)
  const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
    Array.from(tr.querySelectorAll('th, td')).map((td) => td.textContent),
  )
  return { headers, rows }
}

function fit(slope: number, intercept: number, r2: number, n: number): LinearFit {
  return { slope, intercept, slopeSe: 0.5, r2, n }
}

/** A run-only cross-check with `count` blocks, spread so that no two share a position. */
function runBlocks(count: number): HrCrossCheck {
  const points: HrPoint[] = Array.from({ length: count }, (_, i) => ({
    metabolicPower: 10 + (i % 97) / 10 + Math.floor(i / 97) / 1000,
    heartRate: 120 + (i % 61),
    activityId: 'run-1',
  }))
  return { run: { points, fit: fit(10, 15, 0.9, count) }, ride: null, kappa: null, lnKappaSe: null }
}

/** The declarations of one rule in HrScatter.css, by exact selector. */
function cssRule(selector: string): string {
  return ruleBody(hrCss, selector)
}

describe('HrScatter', () => {
  afterEach(() => {
    cleanup()
  })

  it('draws a dot per block, a fitted line per sport, and the legend', () => {
    render(<HrScatter hr={hrFixture} />)
    expect(screen.getByRole('figure', { name: TITLE })).toBeInTheDocument()
    expect(screen.getAllByTestId('hr-dot')).toHaveLength(5)
    expect(screen.getAllByTestId('hr-fit')).toHaveLength(2)
    expect(screen.queryByText(/Not enough steady/)).toBeNull()
    expect(
      screen.getByText('Slopes: running 10.0 and cycling 12.0 bpm per metabolic W/kg'),
    ).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Run')).toBeInTheDocument()
    expect(within(legend).getByText('Ride')).toBeInTheDocument()
  })

  it('draws cycling dots as diamonds, so the two sports differ in shape as well as colour', () => {
    const { container } = render(<HrScatter hr={hrFixture} />)
    const dots = screen.getAllByTestId('hr-dot')
    expect(dots.some((dot) => dot.getAttribute('data-sport') === 'ride')).toBe(true)
    dots.forEach((dot) => {
      const shape = dot.getAttribute('data-sport') === 'ride' ? 'diamond' : 'circle'
      expect(dot).toHaveAttribute('data-shape', shape)
    })
    expect(container.querySelector('.chart-legend__key--diamond')).not.toBeNull()
    // Running's key is a dot, as its points are.
    expect(container.querySelector('.chart-legend__key--dot')).not.toBeNull()
  })

  it('titles the energy rate axis in metabolic W/kg, drawn in the chart', () => {
    render(<HrScatter hr={hrFixture} />)
    const axis = screen
      .getAllByText('Energy rate (metabolic W/kg)')
      .filter((element) => element.closest('svg') !== null)
    expect(axis).toHaveLength(1)
  })

  it('formats the summary table with block counts, slopes and R squared', () => {
    const { container } = render(<HrScatter hr={hrFixture} />)
    const { headers, rows } = tableAt(container, 0)
    expect(headers).toEqual(['Sport', 'Blocks', 'Slope (bpm per metabolic W/kg)', 'R squared'])
    expect(rows).toEqual([
      ['Run', '3', '10.0', '0.95'],
      ['Ride', '2', '12.0', '0.90'],
    ])
  })

  it('lists one row per plotted block with its sport, W/kg and bpm, after the summary', () => {
    const { container } = render(<HrScatter hr={hrFixture} />)
    const { headers, rows } = tableAt(container, 1)
    expect(headers).toEqual(['Sport', 'Energy rate (metabolic W/kg)', 'Heart rate (bpm)'])
    expect(rows).toEqual([
      ['Run', '13.5', '150'],
      ['Run', '14.5', '160'],
      ['Run', '15.5', '170'],
      ['Ride', '14.0', '140'],
      ['Ride', '15.0', '152'],
    ])
  })

  it('draws each dot fully opaque with a 2 px ring in the surface colour', () => {
    const rule = cssRule('.hr-scatter__dot')
    expect(rule).not.toMatch(/fill-opacity/)
    // The ring is the surface the chart sits on, which is the page surface.
    expect(rule).toMatch(/stroke:\s*var\(--surface-0\)/)
    expect(rule).toMatch(/stroke-width:\s*2(px)?;/)
  })

  it('draws at most 2,000 dots, says so, and keeps the table to the dots drawn', () => {
    const { container } = render(<HrScatter hr={runBlocks(2500)} />)
    expect(screen.getAllByTestId('hr-dot')).toHaveLength(2000)
    expect(
      screen.getByText(
        /To keep the chart responsive, 2,000 of 2,500 blocks are plotted, spaced evenly/,
      ),
    ).toBeInTheDocument()
    expect(tableAt(container, 1).rows).toHaveLength(2000)
    expect(tableAt(container, 0).rows).toEqual([['Run', '2500', '10.0', '0.90']])
  })

  it('spaces the drawn blocks across the whole data, keeps the last block, and keeps both axis extremes', () => {
    // Power rises by 0.1 W/kg per block, so each row's power identifies its block. The lowest heart
    // rate sits at block 2100 and the highest at block 2300, both past where slice(0, 2000) stops.
    const points: HrPoint[] = Array.from({ length: 2500 }, (_, i) => ({
      metabolicPower: 10 + i / 10,
      heartRate: i === 2100 ? 60 : i === 2300 ? 250 : 120 + (i % 61),
      activityId: 'run-1',
    }))
    const hr: HrCrossCheck = {
      run: { points, fit: fit(10, 15, 0.9, points.length) },
      ride: null,
      kappa: null,
      lnKappaSe: null,
    }
    const { container } = render(<HrScatter hr={hr} />)
    const rows = tableAt(container, 1).rows
    const indices = rows.map((row) => Math.round((Number(row[1]) - 10) * 10))

    expect(rows).toHaveLength(2000)
    expect(indices[0]).toBe(0)
    expect(indices.at(-1)).toBe(2499)
    expect(indices).toContain(2100)
    expect(indices).toContain(2300)
    const gaps = indices.slice(1).map((index, i) => index - (indices[i] ?? 0))
    expect(Math.max(...gaps)).toBeLessThanOrEqual(3)
  })

  it('thins the same blocks in the same way on every render', () => {
    const first = render(<HrScatter hr={runBlocks(2500)} />)
    const firstDots = screen.getAllByTestId('hr-dot').map((dot) => dot.getAttribute('cx'))
    first.unmount()
    render(<HrScatter hr={runBlocks(2500)} />)
    const secondDots = screen.getAllByTestId('hr-dot').map((dot) => dot.getAttribute('cx'))
    expect(secondDots).toEqual(firstDots)
  })

  it('does not mention thinning when every block is plotted', () => {
    render(<HrScatter hr={hrFixture} />)
    expect(screen.queryByText(/To keep the chart responsive/)).toBeNull()
  })

  it('does not sort the dots again on each pointer move', () => {
    const sortSpy = vi.spyOn(Array.prototype, 'sort')
    try {
      render(<HrScatter hr={runBlocks(37)} />)
      const surface = screen.getByTestId('plot-surface')
      const sortsOf37 = () =>
        sortSpy.mock.contexts.filter((context) => Array.isArray(context) && context.length === 37)
          .length

      fireEvent.keyDown(surface, { key: 'ArrowRight' })
      const afterFirstMove = sortsOf37()
      for (let i = 0; i < 5; i++) fireEvent.keyDown(surface, { key: 'ArrowRight' })
      expect(sortsOf37()).toBe(afterFirstMove)
    } finally {
      sortSpy.mockRestore()
    }
  })

  it('shows the nearest dot when the arrow keys move', () => {
    render(<HrScatter hr={hrFixture} />)
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const tooltip = screen.getByRole('status')
    expect(within(tooltip).getByText('Run')).toBeInTheDocument()
    expect(tooltip).toHaveTextContent('13.5 metabolic W/kg')
    expect(tooltip).toHaveTextContent('150 bpm')
  })

  it('draws the sport that has data and names the missing one', () => {
    render(<HrScatter hr={hrRunOnlyFixture} />)
    expect(screen.getAllByTestId('hr-dot')).toHaveLength(3)
    expect(screen.getAllByTestId('hr-fit')).toHaveLength(1)
    expect(
      screen.getByText(
        'Not enough steady heart-rate data for cycling yet, so only running is shown.',
      ),
    ).toBeInTheDocument()
  })

  it('lists only the sports that are drawn, so one sport has no legend', () => {
    render(<HrScatter hr={hrRunOnlyFixture} />)
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
  })

  it('gives distinct tick labels when the data span is narrow', () => {
    const narrow: HrCrossCheck = {
      run: {
        points: [
          { metabolicPower: 14, heartRate: 150, activityId: 'run-1' },
          { metabolicPower: 14.05, heartRate: 155, activityId: 'run-1' },
          { metabolicPower: 14.1, heartRate: 160, activityId: 'run-1' },
        ],
        fit: { slope: 100, intercept: -1250, slopeSe: 1, r2: 0.9, n: 3 },
      },
      ride: null,
      kappa: null,
      lnKappaSe: null,
    }
    const { container } = render(<HrScatter hr={narrow} />)
    const labels = Array.from(container.querySelectorAll('.chart-x-axis__tick')).map(
      (tick) => tick.textContent,
    )
    expect(labels).toContain('14.02')
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('shows an empty state when neither sport has enough data', () => {
    render(<HrScatter hr={{ run: null, ride: null, kappa: null, lnKappaSe: null }} />)
    expect(screen.getByText(EMPTY)).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('HrScatter with rides held', () => {
  afterEach(() => {
    cleanup()
  })

  it('draws only the run blocks, and the run fit, while the rides are held', () => {
    render(<HrScatter hr={hrFixture} includeRides={false} />)

    const dots = screen.getAllByTestId('hr-dot')
    expect(dots).toHaveLength(3)
    expect(dots.every((dot) => dot.getAttribute('data-sport') === 'run')).toBe(true)
    expect(screen.getAllByTestId('hr-fit')).toHaveLength(1)
  })

  it('has no legend entry, slope note or missing-data note for the held sport', () => {
    const { container } = render(<HrScatter hr={hrFixture} includeRides={false} />)

    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    expect(screen.queryByText(/Slopes:/)).toBeNull()
    expect(screen.queryByText(/Not enough steady heart-rate data for cycling/)).toBeNull()
    expect(tableAt(container, 0).rows).toEqual([['Run', '3', '10.0', '0.95']])
  })

  it('lists only running blocks in the table view, so the table matches what is drawn', () => {
    const { container } = render(<HrScatter hr={hrFixture} includeRides={false} />)

    const plotted = tableAt(container, 1).rows
    expect(plotted).toHaveLength(3)
    expect(plotted.every((row) => row[0] === 'Run')).toBe(true)
  })

  it('describes the chart as running alone while the rides are held', () => {
    render(<HrScatter hr={hrFixture} includeRides={false} />)

    expect(
      screen.getByRole('img', {
        name: 'Average heart rate against energy rate for each block of steady running effort, with a fitted line.',
      }),
    ).toBeInTheDocument()
  })

  it('says running, not each sport, in its empty state while the rides are held', () => {
    const ridesOnly: HrCrossCheck = {
      run: null,
      ride: hrFixture.ride,
      kappa: null,
      lnKappaSe: null,
    }
    render(<HrScatter hr={ridesOnly} includeRides={false} />)

    expect(
      screen.getByText(
        'Not enough steady heart-rate data yet. It takes roughly 8 five-minute blocks of running across a range of efforts',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/per sport/)).toBeNull()
  })

  it('still draws both sports, with the slope note, when the rides are not held', () => {
    render(<HrScatter hr={hrFixture} includeRides />)

    expect(screen.getAllByTestId('hr-dot')).toHaveLength(5)
    expect(screen.getByText(/Slopes: running 10\.0 and cycling 12\.0/)).toBeInTheDocument()
  })
})
