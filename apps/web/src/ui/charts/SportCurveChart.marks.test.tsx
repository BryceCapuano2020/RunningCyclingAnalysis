// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CurvePoint } from '@rca/core/types'
import { curvePoint } from './fixtures'
import { SportCurveChart } from './SportCurveChart'

const MASS_KG = 75

/** A point measured over its own length. */
const measured = (durationS: number, value: number): CurvePoint => ({
  ...curvePoint(durationS, value, 'ride-1'),
  windowS: durationS,
})

/** A point the envelope filled from a longer effort: the file holds no effort of this length. */
const carried = (durationS: number, value: number, windowS: number): CurvePoint => ({
  ...curvePoint(durationS, value, 'ride-2'),
  windowS,
})

/** Efforts of 1, 5 and 20 minutes and an hour; the 30 and 45 minute values come from the hour. */
const SPARSE = [
  measured(60, 400),
  measured(300, 320),
  measured(1200, 250),
  carried(1800, 210, 3600),
  carried(2700, 210, 3600),
  measured(3600, 210),
]

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

function ride(curve: CurvePoint[], threshold?: Parameters<typeof SportCurveChart>[0]['threshold']) {
  return render(
    <SportCurveChart
      sport="ride"
      curve={curve}
      previous={null}
      massKg={MASS_KG}
      units="metric"
      threshold={threshold}
    />,
  )
}

describe('a stretch of the curve with no effort on file', () => {
  it('is drawn lighter than the measured line, and labelled once, with the lengths it spans', () => {
    chartWidth(900)
    const { container } = ride(SPARSE)
    const light = container.querySelector('[data-testid="sport-curve-carried"]')
    expect(light).toHaveClass('chart-series__line--carried')
    expect(light?.getAttribute('d')).toMatch(/^M/)
    // The measured line is a separate path, so each can be drawn in its own weight.
    expect(container.querySelector('[data-testid="sport-curve-line"]')).not.toBe(light)
    const labels = [...container.querySelectorAll('.annot--bracket .annot__text')].map(
      (text) => text.textContent,
    )
    expect(labels).toEqual(['No effort of 20 to 60 min on file'])
  })

  it('draws the light stretch from the last measured point to the next, and no further', () => {
    chartWidth(900)
    const { container } = ride(SPARSE)
    const light = container.querySelector('[data-testid="sport-curve-carried"]')?.getAttribute('d')
    const solid = container.querySelector('[data-testid="sport-curve-line"]')?.getAttribute('d')
    const startsOf = (d: string | null | undefined) =>
      [...(d ?? '').matchAll(/M([\d.]+) /g)].map((match) => Number(match[1]))
    const emphasis = container.querySelector('[data-testid="sport-curve-emphasis"]')
    const x20 = Number(emphasis?.getAttribute('cx'))
    // The light path starts at the 20 minute point, where the measured line stops.
    expect(startsOf(light)).toHaveLength(1)
    expect(startsOf(light)[0]).toBeCloseTo(x20, 0)
    expect(startsOf(solid)).toHaveLength(1)
  })

  it('is said in the table’s caption, so the twin says what the drawing does', () => {
    chartWidth(900)
    const { container } = ride(SPARSE)
    expect(container.querySelector('caption')?.textContent).toContain(
      'No effort of 20 to 60 min on file.',
    )
  })

  it('draws a curve with no carried point as one line, with no bracket and no word about it', () => {
    chartWidth(900)
    const { container } = ride([measured(60, 400), measured(300, 320), measured(1200, 250)])
    expect(container.querySelector('[data-testid="sport-curve-carried"]')).toBeNull()
    expect(container.querySelector('.annot--bracket')).toBeNull()
    expect(container.querySelector('caption')?.textContent).not.toContain('No effort')
  })

  it('treats a point with no window, as in a curve made without digests, as measured', () => {
    chartWidth(900)
    const { container } = ride([
      curvePoint(60, 400, 'a'),
      curvePoint(300, 320, 'a'),
      curvePoint(1200, 250, 'a'),
    ])
    expect(container.querySelector('[data-testid="sport-curve-carried"]')).toBeNull()
  })

  it('is not called out as a best: a carried value belongs to a longer effort', () => {
    chartWidth(900)
    const { container } = ride([
      measured(60, 400),
      measured(300, 320),
      carried(1200, 250, 3600),
      measured(3600, 250),
    ])
    expect(container.querySelector('[data-annotation="best-1200"]')).toBeNull()
    expect(container.querySelector('[data-annotation="best-300"]')).not.toBeNull()
  })
})

describe('the threshold line', () => {
  it('is a labelled rule across the plot at the threshold, with its range as a band', () => {
    chartWidth(900)
    const { container } = ride(SPARSE, {
      value: 225,
      low: 215,
      high: 235,
      detail: 'Range 215 to 235 W',
    })
    const mark = container.querySelector('[data-annotation="threshold"]')
    expect(mark?.querySelector('.annot__rule')).not.toBeNull()
    expect(mark?.querySelector('.annot__band')).not.toBeNull()
    expect(mark?.textContent).toBe('Threshold225 WRange 215 to 235 W')
    // The line sits where 225 W is on the axis: between the 250 W and 210 W efforts' heights.
    const y = Number(mark?.querySelector('.annot__rule')?.getAttribute('y1'))
    const y20 = Number(
      container.querySelector('[data-testid="sport-curve-emphasis"]')?.getAttribute('cy'),
    )
    expect(y).toBeGreaterThan(y20)
  })

  it('gives its range room on the axis, so a threshold above every effort is still drawn', () => {
    chartWidth(900)
    const { container } = ride(SPARSE, { value: 700 })
    const rule = container.querySelector('.annot__rule')
    const y = Number(rule?.getAttribute('y1'))
    expect(y).toBeGreaterThanOrEqual(28)
    expect(y).toBeLessThanOrEqual(320 - 52)
  })

  it('is absent without a threshold', () => {
    chartWidth(900)
    const { container } = ride(SPARSE)
    expect(container.querySelector('[data-annotation="threshold"]')).toBeNull()
  })
})

describe('the curve on a phone', () => {
  it('reads values in the fixed row above the plot, and no tooltip floats over it', () => {
    chartWidth(358)
    const { container } = ride(SPARSE)
    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveTextContent('') // nothing is read until a point is active
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    expect(within(readout).getByRole('status')).toHaveTextContent('1 min')
    // The overlay holds no tooltip: the status element is the one in the readout row.
    expect(container.querySelector('.chart-frame__overlay .chart-tooltip__title')).toBeNull()
  })

  it('takes a 190 px plot with a 40 px gutter, and keeps the desktop plot at 56 px', () => {
    chartWidth(358)
    const phone = ride(SPARSE)
    const svg = phone.container.querySelector('svg.chart-frame__svg')
    expect(svg?.getAttribute('height')).toBe('262')
    const left = Number(phone.container.querySelector('.plot-surface__hit')?.getAttribute('x'))
    expect(left).toBe(40)
    phone.unmount()

    chartWidth(900)
    const wide = ride(SPARSE)
    expect(wide.container.querySelector('svg.chart-frame__svg')?.getAttribute('height')).toBe('320')
    expect(Number(wide.container.querySelector('.plot-surface__hit')?.getAttribute('x'))).toBe(56)
    expect(screen.queryByTestId('chart-readout')).toBeNull()
  })
})
