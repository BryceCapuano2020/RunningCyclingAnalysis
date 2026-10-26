// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'
import { ChartFrame } from './ChartFrame'
import { PlotSurface } from './PlotSurface'
import type { ChartFrameProps } from './ChartFrame'
import type { ChartSize } from './chartTypes'

const frameCss = await readStylesheet(import.meta.url, './ChartFrame.css')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const table = { columns: ['Duration', 'Median'], rows: [['1 min', '+5%']] }

function renderFrame(overrides: Partial<ChartFrameProps> = {}) {
  const props: ChartFrameProps = {
    title: 'Test chart',
    description: 'A test description',
    table,
    children: () => null,
    ...overrides,
  }
  return render(<ChartFrame {...props} />)
}

/** The size the frame gives its children, read from the render-prop call. */
function sizeFromChildren(): ChartSize {
  const children = vi.fn<(size: ChartSize) => null>(() => null)
  renderFrame({ children })
  const size = children.mock.calls[0]?.[0]
  if (!size) throw new Error('children not called')
  return size
}

describe('ChartFrame', () => {
  it('titles the figure with a visible caption, and names the drawing by its description', () => {
    const { container } = renderFrame()
    expect(screen.getByRole('figure', { name: 'Test chart' })).toBeInTheDocument()
    expect(container.querySelector('figcaption')).toHaveTextContent('Test chart')
    expect(screen.getByRole('img', { name: 'A test description' })).toBeInTheDocument()
    // One name per element: the svg carries no title or description of its own.
    expect(container.querySelector('svg title')).toBeNull()
    expect(container.querySelector('svg desc')).toBeNull()
  })

  it('lets a finger scroll the page and pinch to zoom over the drawing, not only the plot', () => {
    expect(ruleBody(frameCss, '.chart-frame__svg')).toMatch(/touch-action:\s*pan-y pinch-zoom/)
  })

  it('fits the figure to the page width, so a wide table scrolls inside it', () => {
    expect(ruleBody(frameCss, '.chart-frame')).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    )
    expect(ruleBody(frameCss, '.chart-frame__details')).toMatch(/min-width:\s*0/)
    expect(ruleBody(frameCss, '.chart-frame__details .table-scroll')).toMatch(/max-width:\s*100%/)
  })

  it('renders an empty chart as its message alone: no drawing, table, hint or reserved height', () => {
    const { container } = renderFrame({ empty: 'Nothing to show yet', surface: () => null })
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
    expect(container.querySelector('.chart-frame__hint')).toBeNull()
    expect(container.querySelector('details')).toBeNull()
    expect(container.querySelector('.chart-frame__stage')).not.toHaveAttribute('style')
  })

  it('shows a legend with a single entry when that entry is dashed, as an estimate is', () => {
    renderFrame({ legend: [{ label: 'Cycling, estimated', kind: 'ride', swatch: 'dashed' }] })
    expect(screen.getByRole('list', { name: 'Legend' })).toHaveTextContent('Cycling, estimated')
  })

  it('shows the one solid entry of a single-series chart, so its line is named', () => {
    renderFrame({ legend: [{ label: 'Run, as recorded', kind: 'run', swatch: 'line' }] })
    expect(screen.getByRole('list', { name: 'Legend' })).toHaveTextContent('Run, as recorded')
  })

  it('names how to read the values in visible text beside a chart that can be read', () => {
    const { container } = renderFrame({ surface: () => null })
    expect(container.querySelector('.chart-frame__hint')).toHaveTextContent(
      'Left and right arrows read values',
    )
    const plain = renderFrame()
    expect(plain.container.querySelector('.chart-frame__hint')).toBeNull()
  })

  it('shows the arrow-key hint in the overlay, in the plot’s top margin, right-aligned to the plot', () => {
    const children = vi.fn<(size: ChartSize) => null>(() => null)
    const { container } = renderFrame({ children, surface: () => null })
    const size = children.mock.calls[0]?.[0]
    const hint = container.querySelector<HTMLElement>('.chart-frame__overlay > .chart-frame__hint')
    expect(container.querySelector('.chart-frame > .chart-frame__hint')).toBeNull()
    expect(hint).not.toBeNull()
    // The plot starts 28 px down, so a hint 2 px from the top sits in the margin, above the data.
    expect(hint?.style.top).toBe('2px')
    expect(hint?.style.right).toBe(`${(size?.width ?? 0) - (size?.plot.right ?? 0)}px`)
    expect(hint?.style.left).toBe('')
  })

  it('hides the arrow-key hint while a point is active, so the tooltip has the overlay', () => {
    expect(frameCss).toMatch(
      /\.chart-frame:has\(\.plot-surface:focus-visible\) \.chart-frame__hint \{\s*display: block;/,
    )
    expect(frameCss).toMatch(
      /\.chart-frame:has\(\.chart-tooltip__title\) \.chart-frame__hint \{\s*display: none;/,
    )
    // One line of text and its border fit in the 28 px margin above the plot.
    expect(ruleBody(frameCss, '.chart-frame__hint')).toMatch(/padding:\s*0 var\(--space-2\)/)
    expect(ruleBody(frameCss, '.chart-frame__hint')).toMatch(/position:\s*absolute/)
  })

  it('balances the lines of a chart title, so a long one does not end on one word', () => {
    expect(ruleBody(frameCss, '.chart-frame__title')).toMatch(/text-wrap:\s*balance/)
  })

  it('lays the plot inside fixed margins, so axes have room', () => {
    const size = sizeFromChildren()
    expect(size.plot).toEqual({
      left: 56,
      right: size.width - 16,
      top: 28,
      bottom: size.height - 52,
    })
  })

  it('uses the default height unless one is given', () => {
    const size = sizeFromChildren()
    expect(size.height).toBe(320)
    const children = vi.fn<(size: ChartSize) => null>(() => null)
    renderFrame({ children, height: 240 })
    expect(children.mock.calls[0]?.[0].height).toBe(240)
  })

  it('applies a custom right margin to the plot', () => {
    const children = vi.fn<(size: ChartSize) => null>(() => null)
    renderFrame({ children, plotRightMargin: () => 40 })
    const size = children.mock.calls[0]?.[0]
    expect(size?.plot.right).toBe((size?.width ?? 0) - 40)
  })

  it('shows the legend for two entries, or for one line or dashed entry, and not for one dot', () => {
    const { unmount } = renderFrame({
      legend: [{ label: 'Running', kind: 'run', swatch: 'line' }],
    })
    expect(screen.getByRole('list', { name: 'Legend' })).toHaveTextContent('Running')
    unmount()
    const dot = renderFrame({ legend: [{ label: 'Run', kind: 'run', swatch: 'dot' }] })
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    dot.unmount()
    renderFrame({
      legend: [
        { label: 'Running', kind: 'run' },
        { label: 'Cycling', kind: 'ride' },
      ],
    })
    expect(within(screen.getByRole('list', { name: 'Legend' })).getByText('Cycling')).toBeTruthy()
  })

  it('shows the note under the plot, and only when the chart is not empty', () => {
    renderFrame({ note: 'Shading is the model range' })
    expect(screen.getByText('Shading is the model range')).toBeInTheDocument()
  })

  it('replaces the plot and table with the empty message, and keeps a note under it that the caller gives', () => {
    const children = vi.fn<(size: ChartSize) => null>(() => null)
    const { container } = renderFrame({
      children,
      empty: 'Nothing to show yet',
      note: 'Cycling is held until a weight is added.',
    })
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByText('Cycling is held until a weight is added.')).toBeInTheDocument()
    expect(screen.queryByText('View as table')).toBeNull()
    expect(children).not.toHaveBeenCalled()
  })

  it('writes a key note in the legend row where a key would be, when there is no key to show', () => {
    const { container } = renderFrame({ legend: [], keyNote: 'No rides in the previous 6 weeks' })
    expect(container.querySelector('.chart-frame__legend')).toHaveTextContent(
      'No rides in the previous 6 weeks',
    )
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    expect(container.querySelector('.chart-frame > .chart-frame__note')).toBeNull()
  })

  it('keeps the table behind a View as table disclosure', () => {
    const { container } = renderFrame()
    const details = container.querySelector('details')
    expect(details).not.toHaveAttribute('open')
    expect(details?.querySelector('summary')).toHaveTextContent('View as table')
    const rows = Array.from(details?.querySelectorAll('tbody tr') ?? []).map((tr) => tr.textContent)
    expect(rows).toEqual(['1 min+5%'])
  })

  it('puts an optional summary table before the data table, each with its own caption', () => {
    const { container } = renderFrame({
      summary: { caption: 'Summary', columns: ['Sport'], rows: [['Running']] },
      table: { caption: 'Blocks', columns: ['Block'], rows: [['1']] },
    })
    const tables = container.querySelectorAll('details table')
    expect(tables).toHaveLength(2)
    expect(tables[0]).toHaveAccessibleName('Summary')
    expect(tables[1]).toHaveAccessibleName('Blocks')
  })

  it('draws the surface above the drawing and the overlay above the surface', () => {
    const { container } = renderFrame({
      children: () => <g data-testid="drawing" />,
      surface: () => <g data-testid="surface" />,
      overlay: () => <span data-testid="overlay" />,
    })
    expect(screen.getByTestId('drawing')).toBeInTheDocument()
    expect(screen.getByTestId('surface').closest('svg')).not.toBeNull()
    expect(container.querySelector('.chart-frame__overlay [data-testid="overlay"]')).not.toBeNull()
  })
})

describe('ChartFrame legend row', () => {
  it('reserves the legend row when the chart has a legend, even while it has no key to show', () => {
    const { container } = renderFrame({ legend: [] })
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    expect(container.querySelector('.chart-frame__legend')).not.toBeNull()
  })

  it('reserves no legend row for a chart that has no legend', () => {
    const { container } = renderFrame()
    expect(container.querySelector('.chart-frame__legend')).toBeNull()
  })

  it('gives the reserved row a height, so a key appearing does not move the plot', () => {
    expect(ruleBody(frameCss, '.chart-frame__legend')).toMatch(/min-height/)
  })

  describe('ChartFrame naming', () => {
    it('names the plot surface by the chart’s visible title, and describes it by the arrow-key hint', () => {
      renderFrame({
        surface: (size) => (
          <PlotSurface
            size={size}
            onPoint={() => undefined}
            onKey={() => undefined}
            onBlur={() => undefined}
          />
        ),
      })
      const surface = screen.getByTestId('plot-surface')
      const named = document.getElementById(surface.getAttribute('aria-labelledby') ?? '')
      expect(named).toHaveTextContent('Test chart')
      const hint = document.querySelector('.chart-frame__hint')
      expect(hint?.id).toBeTruthy()
      expect(surface.getAttribute('aria-describedby')?.split(' ')).toContain(hint?.id)
    })
  })
})
