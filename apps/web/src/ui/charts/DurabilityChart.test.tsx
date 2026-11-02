// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lateEvidenceFor } from '../lateFixtures'
import { lateInEffort } from '../lateInEffort'
import { DurabilityChart } from './DurabilityChart'

const TAKEAWAY = 'Held 95% of output after 90 min'

function renderChart(sport: 'run' | 'ride', units: 'metric' | 'imperial' = 'metric') {
  const { groups } = lateInEffort(sport, lateEvidenceFor(sport)).durability!
  return render(<DurabilityChart sport={sport} groups={groups} units={units} takeaway={TAKEAWAY} />)
}

/** The x of a mark, a circle's centre or the first point of a diamond's path. */
const markX = (mark: Element): number =>
  Number(mark.getAttribute('cx') ?? mark.getAttribute('d')?.match(/M([\d.]+)/)?.[1])

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

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DurabilityChart', () => {
  it('is titled by what it draws, and gives each figure in the sport’s own unit', () => {
    const { container } = renderChart('run')
    expect(
      screen.getByRole('figure', { name: 'Best efforts overall and late' }),
    ).toBeInTheDocument()
    expect(container.querySelector('.late-chart__value')?.textContent).toMatch(/\/km/)
    cleanup()
    const ride = renderChart('ride')
    expect(
      screen.getByRole('figure', { name: 'Best efforts overall and late' }),
    ).toBeInTheDocument()
    expect(ride.container.querySelector('.late-chart__value')?.textContent).toMatch(/\d W/)
  })

  it('draws one dumbbell for each late best, named by the effort and the time into it', () => {
    const { container } = renderChart('ride')
    const labels = Array.from(container.querySelectorAll('.late-chart__label')).map(
      (l) => l.textContent,
    )
    expect(labels).toEqual([
      'Best 5 min after 60 min',
      'Best 5 min after 90 min',
      'Best 20 min after 60 min',
      'Best 20 min after 90 min',
    ])
    expect(container.querySelectorAll('[data-testid="late-row"]')).toHaveLength(4)
  })

  it('sets the stat as the chart’s headline', () => {
    renderChart('ride')
    expect(screen.getByRole('figure')).toHaveAccessibleDescription(TAKEAWAY)
  })

  it('writes a ride in watts and a run as a pace', () => {
    const ride = renderChart('ride')
    const values = Array.from(ride.container.querySelectorAll('.late-chart__value')).map(
      (v) => v.textContent,
    )
    expect(values).toEqual([
      '295 W, 5% below',
      '285 W, 8% below',
      '259 W, 4% below',
      '254 W, 6% below',
    ])
    ride.unmount()
    const run = renderChart('run')
    expect(run.container.querySelector('.late-chart__value')?.textContent).toMatch(
      /^\d:\d\d \/km, \d+% below$/,
    )
    run.unmount()
    const imperial = renderChart('run', 'imperial')
    expect(imperial.container.querySelector('.late-chart__value')?.textContent).toMatch(
      /\/mi, \d+% below$/,
    )
  })

  it('puts the best overall as a ring at the same place in every row, and each late mark to its left', () => {
    const { container } = renderChart('ride')
    const rings = Array.from(container.querySelectorAll('[data-testid="late-overall"]'))
    const marks = Array.from(container.querySelectorAll('[data-testid="late-mark"]'))
    expect(new Set(rings.map((ring) => ring.getAttribute('cx'))).size).toBe(1)
    marks.forEach((mark, i) =>
      expect(markX(mark)).toBeLessThan(Number(rings[i]!.getAttribute('cx'))),
    )
  })

  it('reads every row on one scale: a larger fall is further left, and the same fall in the same place', () => {
    const { container } = renderChart('ride')
    const xs = Array.from(container.querySelectorAll('[data-testid="late-mark"]')).map(markX)
    // 5 min: 5% then 8% below; 20 min: 4% then 6% below.
    expect(xs[1]).toBeLessThan(xs[0]!)
    expect(xs[3]).toBeLessThan(xs[2]!)
    expect(xs[0]).toBeLessThan(xs[2]! - 0.5)
    expect(xs[2]).toBeLessThan(
      Number(container.querySelector('[data-testid="late-overall"]')!.getAttribute('cx')),
    )
  })

  it('draws a bar from the ring to the mark, so a small fall is a short bar and not an empty row', () => {
    const { groups } = lateInEffort('ride', lateEvidenceFor('ride')).durability!
    const nearlyHeld = structuredClone(groups)
    for (const cell of nearlyHeld.flatMap((group) => group.cells)) cell.retention = 0.99
    const { container } = render(
      <DurabilityChart sport="ride" groups={nearlyHeld} units="metric" takeaway={TAKEAWAY} />,
    )
    const stem = container.querySelector('.late-chart__stem')!
    const track = container.querySelector('.late-chart__track')!
    const length = (line: Element) =>
      Math.abs(Number(line.getAttribute('x2')) - Number(line.getAttribute('x1')))
    // The track runs only a few per cent past a 1% fall, so the bar is a clear share of it, not a sliver.
    expect(length(stem) / length(track)).toBeGreaterThan(0.1)
    expect(length(stem) / length(track)).toBeLessThan(0.3)
  })

  it('draws a run as dots and a ride as diamonds', () => {
    const shapes = (container: HTMLElement) =>
      new Set(
        Array.from(container.querySelectorAll('[data-testid="late-mark"]')).map((m) =>
          m.getAttribute('data-shape'),
        ),
      )
    const run = renderChart('run')
    expect(shapes(run.container)).toEqual(new Set(['circle']))
    run.unmount()
    expect(shapes(renderChart('ride').container)).toEqual(new Set(['diamond']))
  })

  it('describes every figure for a screen reader', () => {
    renderChart('ride')
    const image = screen.getByRole('img')
    expect(image.getAttribute('aria-label')).toBe(
      'Best 5 min: overall 310 W; after 60 min 295 W, 5% below; after 90 min 285 W, 8% below. Best 20 min: overall 270 W; after 60 min 259 W, 4% below; after 90 min 254 W, 6% below.',
    )
  })

  it('has the same figures as a table, with the activities behind each', () => {
    renderChart('ride')
    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Effort', 'Power', 'Against overall', 'Activities'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(
      rows.map((r) => Array.from(r.querySelectorAll('th, td')).map((c) => c.textContent))[2],
    ).toEqual(['5 min, after 90 min', '285 W', '8% below', '5'])
    expect(screen.getByText('View as table')).toBeInTheDocument()
    // No sentence under the chart says how a level is supported.
    expect(document.querySelector('.chart-frame__note')).toBeNull()
  })

  it('fits 320 px: every label and value sits inside the drawing', () => {
    chartWidth(288)
    const { container } = renderChart('ride')
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('288')
    for (const text of Array.from(container.querySelectorAll('.late-chart__value'))) {
      expect(Number(text.getAttribute('x'))).toBeLessThanOrEqual(288)
    }
    for (const mark of Array.from(container.querySelectorAll('[data-testid="late-mark"]'))) {
      const x = markX(mark)
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(288)
    }
  })
})
