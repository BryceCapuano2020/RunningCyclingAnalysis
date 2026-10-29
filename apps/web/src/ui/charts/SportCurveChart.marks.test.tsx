// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CurvePoint } from '@rca/core/types'
import { readStylesheet } from '../components/stylesheet'
import { curvePoint } from './fixtures'
import { SportCurveChart } from './SportCurveChart'

const MASS_KG = 75

const seriesCss = await readStylesheet(import.meta.url, './ChartSeries.css')

/** A point measured over its own length. */
const measured = (durationS: number, value: number): CurvePoint => ({
  ...curvePoint(durationS, value, 'ride-1'),
  windowS: durationS,
})

/**
 * A point the envelope filled from a longer effort. Its own windows were all below that effort's or were
 * dropped (a ceiling on a run, a virtual ride priced again), so the line carries the longer value down.
 */
const carried = (durationS: number, value: number, windowS: number): CurvePoint => ({
  ...curvePoint(durationS, value, 'ride-2'),
  windowS,
})

/** Efforts of 1, 5 and 20 minutes and an hour; the 30 and 45 minute values are carried down from the hour. */
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

describe('a stretch of the curve that carries a longer effort', () => {
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
    expect(labels).toEqual(['Between 20 and 60 min the line carries your 60 min best.'])
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
      'Between 20 and 60 min the line carries your 60 min best.',
    )
  })

  it('draws a curve with no carried point as one line, with no bracket and no word about it', () => {
    chartWidth(900)
    const { container } = ride([measured(60, 400), measured(300, 320), measured(1200, 250)])
    expect(container.querySelector('[data-testid="sport-curve-carried"]')).toBeNull()
    expect(container.querySelector('.annot--bracket')).toBeNull()
    expect(container.querySelector('caption')?.textContent).not.toContain('the line carries')
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
    // Nothing is read until a point is active: the row holds the status element, and it is empty.
    expect(within(readout).getByRole('status')).toBeEmptyDOMElement()
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

describe('a run curve that carries a longer effort', () => {
  /** Speeds in m/s: the 30 and 45 minute windows were dropped by the ceiling, so the line carries the hour's. */
  const RUN = [
    { ...curvePoint(180, 5.0, 'run-1'), windowS: 180 },
    { ...curvePoint(300, 4.6, 'run-1'), windowS: 300 },
    { ...curvePoint(1200, 4.2, 'run-1'), windowS: 1200 },
    { ...curvePoint(1800, 3.8, 'run-2'), windowS: 3600 },
    { ...curvePoint(2700, 3.8, 'run-2'), windowS: 3600 },
    { ...curvePoint(3600, 3.8, 'run-2'), windowS: 3600 },
  ]

  const run = () =>
    render(
      <SportCurveChart sport="run" curve={RUN} previous={null} massKg={MASS_KG} units="metric" />,
    )

  it('draws the carried stretch lighter and says what the line carries', () => {
    chartWidth(900)
    const { container } = run()
    expect(container.querySelector('[data-testid="sport-curve-carried"]')).toHaveClass(
      'chart-series__line--run',
      'chart-series__line--carried',
    )
    expect(container.querySelector('.annot--bracket .annot__text')?.textContent).toBe(
      'Between 20 and 60 min the line carries your 60 min best.',
    )
  })

  it('says whose effort a carried row is, in its tooltip and in its table row', () => {
    chartWidth(900)
    const { container } = run()
    const rows = [...container.querySelectorAll('tbody tr')].map((tr) => tr.textContent)
    expect(rows.find((row) => row?.startsWith('30 min'))).toContain(
      '30 min, from your 60 min effort',
    )
    // A measured row has no such note.
    expect(rows.find((row) => row?.startsWith('20 min'))).not.toContain('from your')
    const keys = ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight']
    for (const key of keys) fireEvent.keyDown(screen.getByTestId('plot-surface'), { key })
    expect(screen.getByRole('status')).toHaveTextContent('4:23 /km')
    expect(screen.getByRole('status')).toHaveTextContent('from your 60 min effort')
  })
})

describe('markers on a curve with a carried stretch', () => {
  it('draws a carried record or emphasis point as a hollow ring, and a measured one as a solid dot', () => {
    chartWidth(900)
    const { container } = ride([
      measured(60, 400),
      measured(300, 320),
      carried(1200, 250, 3600),
      measured(3600, 250),
    ])
    // The 20 minute point is the emphasis, and it is carried: a ring in the sport's colour over the card.
    expect(screen.getByTestId('sport-curve-emphasis')).toHaveClass('chart-series__ring--ride')
    expect(screen.getByTestId('sport-curve-emphasis')).not.toHaveClass('chart-series__marker')
    const records = [...container.querySelectorAll('[data-testid="sport-curve-record"]')]
    expect(records.every((record) => record.classList.contains('chart-series__marker--ride'))).toBe(
      true,
    )
  })

  it('keeps a solid dot for a measured 20 minute effort', () => {
    chartWidth(900)
    ride(SPARSE)
    expect(screen.getByTestId('sport-curve-emphasis')).toHaveClass('chart-series__marker--ride')
  })

  it('has a ring rule for each sport, filled with the card and outlined in the sport colour', () => {
    for (const sport of ['run', 'ride']) {
      const rule = seriesCss.slice(seriesCss.indexOf(`.chart-series__ring--${sport} {`))
      expect(rule).toMatch(
        new RegExp(`fill: var\\(--surface-1\\);\\s*stroke: var\\(--series-${sport}\\)`),
      )
    }
  })
})

describe('the previous period’s line', () => {
  it('is a thinner solid grey, never dashed', () => {
    const rule = seriesCss.slice(
      seriesCss.indexOf('.chart-series__line--previous {'),
      seriesCss.indexOf('}', seriesCss.indexOf('.chart-series__line--previous {')),
    )
    expect(rule).toMatch(/stroke: var\(--previous-mark\)/)
    expect(rule).toMatch(/stroke-width: 2px/)
    expect(rule).not.toContain('dasharray')
  })
})

describe('a threshold that rests on an estimate', () => {
  it('is named an estimate, drawn lighter and ended in a hollow ring, and never dashed', () => {
    chartWidth(900)
    const { container } = ride(SPARSE, { value: 225, estimated: true })
    const mark = container.querySelector('[data-annotation="threshold"]')
    expect(mark?.textContent).toContain('Threshold (estimated)')
    expect(mark?.querySelector('.annot__rule')).toHaveClass('annot__rule--estimated')
    expect(mark?.querySelector('.annot__ring')).not.toBeNull()
    expect(mark?.querySelector('.annot__rule')).not.toHaveAttribute('stroke-dasharray')
  })

  it('is plain "Threshold" when it rests on measured values', () => {
    chartWidth(900)
    const { container } = ride(SPARSE, { value: 225 })
    const mark = container.querySelector('[data-annotation="threshold"]')
    expect(mark?.textContent).toBe('Threshold225 W')
    expect(mark?.querySelector('.annot__ring')).toBeNull()
  })
})

describe('annotations on a realistic curve', () => {
  const CURVE = [
    measured(60, 400),
    measured(300, 320),
    measured(600, 280),
    measured(1200, 250),
    measured(1800, 235),
    measured(3600, 225),
    measured(7200, 200),
  ]

  it.each([900, 600, 500, 358, 320])(
    'crowds nothing at %i px, with a threshold on the curve',
    (width) => {
      chartWidth(width)
      // A threshold within a few watts of the 60 minute best: the case that put two labels on one another.
      const { container } = ride(CURVE, {
        value: 226,
        low: 218,
        high: 234,
        detail: 'Range 218 to 234 W',
      })
      expect(container.querySelectorAll('[data-crowded]')).toHaveLength(0)
      const ids = [...container.querySelectorAll('[data-annotation]')].map((each) =>
        each.getAttribute('data-annotation'),
      )
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toContain('best-1200')
      expect(ids).toContain('threshold')
    },
  )

  it('drops a best’s caption, and sets it above the line, where it sits on the threshold', () => {
    chartWidth(900)
    const { container } = ride(CURVE, { value: 226, low: 218, high: 234 })
    // The 20 and 60 minute bests are within 20 px of the 226 W threshold: no caption, so they cannot sit on its label.
    expect(
      container.querySelector('[data-annotation="best-3600"] .annot__text--caption'),
    ).toBeNull()
    // The 5 minute best is well clear of the line and keeps its W/kg.
    expect(
      container.querySelector('[data-annotation="best-1200"] .annot__text--caption'),
    ).toBeNull()
    expect(
      container.querySelector('[data-annotation="best-300"] .annot__text--caption'),
    ).not.toBeNull()
    // Its whole text is above the threshold's band, by at least the leader line's length: not touching it.
    const bandTop = Number(container.querySelector('.annot__band')?.getAttribute('y'))
    const callout = container.querySelector('[data-annotation="best-3600"]')
    const value = Number(callout?.querySelector('.annot__text--value')?.getAttribute('y'))
    const eyebrow = Number(callout?.querySelector('.annot__text--eyebrow')?.getAttribute('y'))
    expect(eyebrow).toBeLessThan(value)
    expect(value).toBeLessThanOrEqual(bandTop - 20)
    // And a leader line runs from the text down to its point.
    expect(callout?.querySelector('.annot__leader')).not.toBeNull()
  })
})

describe('the phone readout when the chart is resized', () => {
  /** A ResizeObserver the test can fire again, as a browser does when the window changes width. */
  function resizable(first: number) {
    const callbacks: ResizeObserverCallback[] = []
    let current = first
    class Observer {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback)
      }

      // As a browser does, it reports the chart's width as soon as it is watched, and again whenever it changes.
      observe() {
        const entry = { contentRect: { width: current } } as unknown as ResizeObserverEntry
        callbacks.at(-1)?.([entry], this as unknown as ResizeObserver)
      }

      unobserve() {}

      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', Observer)
    return (width: number) => {
      current = width
      const entry = { contentRect: { width } } as unknown as ResizeObserverEntry
      act(() => callbacks.forEach((callback) => callback([entry], {} as ResizeObserver)))
    }
  }

  it('moves the reading from the row to a floating tooltip when the chart grows past 480 px, and back', () => {
    const resize = resizable(358)
    const { container } = ride(SPARSE)
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    expect(within(screen.getByTestId('chart-readout')).getByRole('status')).toHaveTextContent(
      '1 min',
    )

    resize(700)
    expect(screen.queryByTestId('chart-readout')).toBeNull()
    // One status element, in the overlay over the plot, and it still holds the reading.
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(container.querySelector('.chart-frame__overlay [role="status"]')).toHaveTextContent(
      '1 min',
    )

    resize(358)
    expect(within(screen.getByTestId('chart-readout')).getByRole('status')).toHaveTextContent(
      '1 min',
    )
    expect(container.querySelector('.chart-frame__overlay [role="status"]')).toBeNull()
  })
})
