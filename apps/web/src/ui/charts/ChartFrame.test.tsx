// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChartFrame } from './ChartFrame'
import type { ChartFrameProps } from './ChartFrame'
import type { ChartSize } from './chartTypes'

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
  it('names the figure and the svg after the title, and describes the drawing', () => {
    const { container } = renderFrame()
    expect(container.querySelector('figure')).toHaveAttribute('aria-label', 'Test chart')
    expect(screen.getByRole('img', { name: 'Test chart. A test description' })).toBeInTheDocument()
    expect(container.querySelector('svg desc')).toHaveTextContent('A test description')
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

  it('shows the legend only with two or more entries', () => {
    const { unmount } = renderFrame({
      legend: [{ label: 'Running', kind: 'run' }],
    })
    expect(screen.queryByRole('list', { name: 'Legend' })).toBeNull()
    unmount()
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

  it('replaces the plot, note and table with the empty message when there is nothing to draw', () => {
    const children = vi.fn<(size: ChartSize) => null>(() => null)
    const { container } = renderFrame({
      children,
      empty: 'Nothing to show yet',
      note: 'Hidden note',
    })
    expect(screen.getByText('Nothing to show yet')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.queryByText('Hidden note')).toBeNull()
    expect(screen.queryByText('View as table')).toBeNull()
    expect(children).not.toHaveBeenCalled()
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
