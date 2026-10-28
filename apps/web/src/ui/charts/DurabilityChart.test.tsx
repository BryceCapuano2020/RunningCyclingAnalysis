// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { lateEvidenceFor } from '../lateFixtures'
import { lateInEffort } from '../lateInEffort'
import { DurabilityChart } from './DurabilityChart'

const NOTE = 'How a level is supported.'

function renderChart(sport: 'run' | 'ride', units: 'metric' | 'imperial' = 'metric') {
  const { groups } = lateInEffort(sport, lateEvidenceFor(sport)).durability!
  return render(<DurabilityChart sport={sport} groups={groups} units={units} note={NOTE} />)
}

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
  it('is titled with the sport’s own unit', () => {
    renderChart('run')
    expect(
      screen.getByRole('figure', {
        name: 'Your best efforts overall and late, flat pace per kilometre',
      }),
    ).toBeInTheDocument()
    cleanup()
    renderChart('ride')
    expect(
      screen.getByRole('figure', { name: 'Your best efforts overall and late, power in watts' }),
    ).toBeInTheDocument()
  })

  it('draws a group for each duration, with a row for the best overall and each level shown', () => {
    const { container } = renderChart('ride')
    const groups = Array.from(container.querySelectorAll('[data-testid="late-group"]'))
    expect(groups.map((g) => g.querySelector('.late-chart__group')?.textContent)).toEqual([
      'Best 5 min',
      'Best 20 min',
    ])
    const labels = groups.map((g) =>
      Array.from(g.querySelectorAll('.late-chart__label')).map((l) => l.textContent),
    )
    expect(labels).toEqual([
      ['Overall', 'After 60 min', 'After 90 min'],
      ['Overall', 'After 60 min', 'After 90 min'],
    ])
  })

  it('writes a ride in watts and a run as a pace', () => {
    const ride = renderChart('ride')
    const values = Array.from(ride.container.querySelectorAll('.late-chart__value')).map(
      (v) => v.textContent,
    )
    expect(values.slice(0, 3)).toEqual(['310 W', '295 W', '285 W'])
    ride.unmount()
    const run = renderChart('run')
    expect(run.container.querySelector('.late-chart__value')?.textContent).toMatch(/^\d:\d\d \/km$/)
    run.unmount()
    const imperial = renderChart('run', 'imperial')
    expect(imperial.container.querySelector('.late-chart__value')?.textContent).toMatch(/\/mi$/)
  })

  it('places a later mark to the left of the overall one, and a larger fall further left', () => {
    const { container } = renderChart('ride')
    const group = container.querySelector('[data-testid="late-group"]')!
    const xs = Array.from(group.querySelectorAll('[data-testid="late-mark"]')).map((mark) =>
      Number(mark.getAttribute('cx') ?? mark.getAttribute('d')?.match(/M([\d.]+)/)?.[1]),
    )
    expect(xs[1]).toBeLessThan(xs[0]!)
    expect(xs[2]).toBeLessThan(xs[1]!)
  })

  it('draws a stem from the overall line to each late mark, and none for the best overall', () => {
    const { container } = renderChart('ride')
    const rows = container.querySelectorAll('[data-testid="late-row"]')
    expect(rows[0]!.querySelector('.late-chart__stem')).toBeNull()
    expect(rows[1]!.querySelector('.late-chart__stem')).not.toBeNull()
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
    expect(screen.getByText(NOTE)).toBeInTheDocument()
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
      const x = Number(mark.getAttribute('cx') ?? mark.getAttribute('d')?.match(/M([\d.]+)/)?.[1])
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(288)
    }
  })
})
