// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStylesheet } from '../components/stylesheet'
import { ChartFrame } from './ChartFrame'
import type { ChartFrameProps } from './ChartFrame'
import type { ChartSize } from './chartTypes'
import { plotSurface, tooltipOverlay } from './chartInteraction'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const css = await readStylesheet(import.meta.url, './ChartFrame.css')
const table = { columns: ['Week', 'Value'], rows: [['1', '5']] }

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

/** Two points, readable by arrow key, with a tooltip. */
function Readable(props: Partial<ChartFrameProps> & { onSize?: (size: ChartSize) => void }) {
  const [active, setActive] = useState<number | null>(null)
  const xs = [100, 200]
  return (
    <ChartFrame
      title="Readable"
      description="Two points"
      table={table}
      {...props}
      surface={(size) => plotSurface(size, xs, active, setActive)}
      overlay={(size) =>
        tooltipOverlay(
          size,
          active === null
            ? null
            : {
                x: xs[active]!,
                y: 100,
                title: `Week ${active + 1}`,
                rows: [{ label: 'Output', value: `${5 + active} W`, note: 'Tempo ride' }],
              },
        )
      }
    >
      {(size) => {
        props.onSize?.(size)
        return null
      }}
    </ChartFrame>
  )
}

describe('ChartFrame on a phone', () => {
  it('takes a 40 px gutter and a plot about 190 px tall where the chart sets no height of its own', () => {
    chartWidth(358)
    const sizes: ChartSize[] = []
    render(<Readable onSize={(size) => sizes.push(size)} />)
    const size = sizes.at(-1)!
    expect(size.plot.left).toBe(40)
    expect(size.plot.bottom - size.plot.top).toBeGreaterThanOrEqual(180)
    expect(size.plot.bottom - size.plot.top).toBeLessThanOrEqual(200)
  })

  it('keeps a height a chart gives, so its own layout holds', () => {
    chartWidth(358)
    const sizes: ChartSize[] = []
    render(<Readable height={200} onSize={(size) => sizes.push(size)} />)
    expect(sizes.at(-1)?.height).toBe(200)
  })

  it('keeps the desktop geometry at 480 px and above: a 56 px gutter, a 320 px chart, and no readout row', () => {
    chartWidth(480)
    const sizes: ChartSize[] = []
    render(<Readable onSize={(size) => sizes.push(size)} />)
    const size = sizes.at(-1)!
    expect(size.plot.left).toBe(56)
    expect(size.height).toBe(320)
    expect(screen.queryByTestId('chart-readout')).toBeNull()
  })

  it('reads a point in a fixed row above the plot, not in a box over it', () => {
    chartWidth(358)
    const { container } = render(<Readable />)
    const readout = screen.getByTestId('chart-readout')
    const plot = container.querySelector('.chart-frame__stage')!
    // The row comes before the plot in the page.
    expect(readout.compareDocumentPosition(plot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    const status = within(readout).getByRole('status')
    expect(status).toHaveTextContent('Week 1')
    expect(status).toHaveTextContent('5 W')
    expect(status).toHaveTextContent('Tempo ride')
    expect(container.querySelector('.chart-frame__overlay [role="status"]')).toBeNull()
  })

  it('still describes the plot by the status element, so a screen reader hears the values as they change', () => {
    chartWidth(358)
    render(<Readable />)
    const status = within(screen.getByTestId('chart-readout')).getByRole('status')
    expect(screen.getByTestId('plot-surface').getAttribute('aria-describedby')).toContain(status.id)
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    expect(status).toHaveTextContent('Week 2')
  })

  it('floats the tooltip over a wide chart, as before', () => {
    chartWidth(900)
    const { container } = render(<Readable />)
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    expect(container.querySelector('.chart-frame__overlay [role="status"]')).toHaveTextContent(
      'Week 1',
    )
  })

  it('has no readout row for a chart nobody can read by pointer or key', () => {
    chartWidth(358)
    render(
      <ChartFrame title="Bars" description="Bars" table={table}>
        {() => null}
      </ChartFrame>,
    )
    expect(screen.queryByTestId('chart-readout')).toBeNull()
  })
})

describe('the phone readout row’s stylesheet', () => {
  it('reserves the room of its fullest reading, as a minimum, so reading a value never moves the plot', () => {
    const body = css.slice(
      css.indexOf('.chart-frame__readout {'),
      css.indexOf('}', css.indexOf('.chart-frame__readout {')),
    )
    // A title, a value with its note and the previous period's row, measured on a phone: 6 rem where the note wraps
    // to a third line (320 to 360 px), and 5 rem where it does not (370 px and up).
    expect(body).toMatch(/min-height: 6rem/)
    expect(css).toMatch(
      /@media \(min-width: 370px\) \{\s*\.chart-frame__readout \{\s*min-height: 5rem/,
    )
    // A fixed height with clipped overflow would cut a long note; the row only ever grows.
    expect(body).not.toMatch(/(^|[\s;])height:/)
    expect(body).not.toMatch(/overflow/)
  })

  it('says how to read a value while none is active', () => {
    expect(css).toContain("content: 'Select a point to read its value'")
  })

  it('draws its tooltip in the flow, with no border or shadow of a floating box', () => {
    expect(css).toMatch(/\.chart-frame__readout \.chart-tooltip \{[^}]*position: static/)
  })
})

describe('the phone readout row at rest', () => {
  it('says the chart’s own latest value in one line when the chart gives one, else how to read a point', () => {
    chartWidth(358)
    const { unmount } = render(<Readable idleReadout="Latest: 64% run, 58% ride" />)
    expect(screen.getByTestId('chart-readout')).toHaveAttribute(
      'data-idle',
      'Latest: 64% run, 58% ride',
    )
    unmount()
    render(<Readable />)
    expect(screen.getByTestId('chart-readout')).toHaveAttribute(
      'data-idle',
      'Select a point to read its value',
    )
  })

  it('is one 2 rem line at rest and draws a reading over it, so the plot is never moved by one', () => {
    const rest = css.slice(
      css.indexOf('.chart-frame__readout--compact {'),
      css.indexOf('}', css.indexOf('.chart-frame__readout--compact {')),
    )
    expect(rest).toMatch(/min-height: 2rem/)
    expect(css).toContain('content: attr(data-idle)')
    expect(css).toMatch(/\.chart-frame__readout--compact \.chart-tooltip \{[^}]*position: absolute/)
  })

  it('animates its growth only where motion is welcome', () => {
    const animation = css.indexOf('animation: chart-readout-open')
    expect(animation).toBeGreaterThan(-1)
    const block = css.lastIndexOf('@media', animation)
    expect(css.slice(block, animation)).toContain('prefers-reduced-motion: no-preference')
  })

  it('leaves the rows other charts host, which set their own readout, on the base rules', () => {
    // The modifier is ChartFrame's own: a row without it keeps the fullest-reading reserve and its hint.
    expect(css).toMatch(/\.chart-frame__readout \{\s*min-height: 6rem/)
    expect(css).toContain("content: 'Select a point to read its value'")
  })

  it('keeps a reading in the status element that is announced, with the row’s own class', () => {
    chartWidth(358)
    render(<Readable />)
    const readout = screen.getByTestId('chart-readout')
    expect(readout).toHaveClass('chart-frame__readout', 'chart-frame__readout--compact')
    fireEvent.keyDown(screen.getByTestId('plot-surface'), { key: 'ArrowRight' })
    expect(within(readout).getByRole('status')).toHaveTextContent('Week 1')
  })
})

describe('ChartFrame’s takeaway and focal figure', () => {
  it('writes the takeaway under the title, which stays the chart’s name', () => {
    const { container } = render(
      <ChartFrame
        title="Pace by duration"
        description="d"
        table={table}
        takeaway="Running grades higher from 10 to 20 min"
      >
        {() => null}
      </ChartFrame>,
    )
    const figure = screen.getByRole('figure', { name: 'Pace by duration' })
    expect(figure).toHaveAccessibleDescription('Running grades higher from 10 to 20 min')
    expect(container.querySelector('figcaption')).toHaveClass('chart-frame__title--eyebrow')
    expect(container.querySelector('.chart-frame__takeaway')).toHaveTextContent(
      'Running grades higher from 10 to 20 min',
    )
  })

  it('shows the one figure the chart is about, with its label and unit', () => {
    const { container } = render(
      <ChartFrame
        title="Pace by duration"
        description="d"
        table={table}
        focal={{ label: '20 min best', value: '6:37', unit: '/mi' }}
      >
        {() => null}
      </ChartFrame>,
    )
    expect(container.querySelector('.chart-frame__focal-label')).toHaveTextContent('20 min best')
    expect(container.querySelector('.chart-frame__focal-value')).toHaveTextContent('6:37/mi')
    expect(container.querySelector('.chart-frame__focal-unit')).toHaveTextContent('/mi')
    // A figure alone does not make a takeaway.
    expect(container.querySelector('.chart-frame__takeaway')).toBeNull()
    expect(container.querySelector('figcaption')).not.toHaveClass('chart-frame__title--eyebrow')
  })

  it('keeps the table twin and the keyboard hint with a takeaway', () => {
    chartWidth(900)
    render(<Readable takeaway="Output rose" focal={{ value: '6' }} />)
    expect(screen.getByText('View as table')).toBeInTheDocument()
    expect(screen.getByTestId('plot-surface').getAttribute('aria-labelledby')).toBeTruthy()
    expect(screen.getByText('Left and right arrows read values')).toBeInTheDocument()
  })

  it('sets the takeaway in the display face, a size down on a phone', () => {
    expect(css).toMatch(/\.chart-frame__takeaway \{[^}]*font-family: var\(--font-display\)/)
    expect(css).toMatch(/\.chart-frame__focal-value \{[^}]*font-family: var\(--font-display\)/)
    expect(css).toMatch(/@media \(max-width: 480px\) \{[^}]*\.chart-frame__takeaway/)
  })
})
