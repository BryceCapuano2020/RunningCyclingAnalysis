// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChartTooltip } from './ChartTooltip'
import type { ChartTooltipProps } from './ChartTooltip'
import type { TooltipContent } from './chartTypes'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const content: TooltipContent = {
  x: 100,
  y: 50,
  title: 'Running',
  rows: [
    { kind: 'run', value: '3.4 W/kg', label: 'Energy rate' },
    { kind: 'ride', value: '150 bpm', label: 'Heart rate' },
    { value: '+5%', label: 'median' },
  ],
}

function renderTooltip(overrides: Partial<ChartTooltipProps> = {}) {
  const props: ChartTooltipProps = {
    content: null,
    bounds: { width: 400, height: 300 },
    id: 'tip',
    ...overrides,
  }
  const view = render(<ChartTooltip {...props} />)
  const el = view.container.querySelector<HTMLDivElement>('#tip')
  if (!el) throw new Error('tooltip missing')
  return { ...view, el }
}

/** jsdom has no layout, so the tooltip's own size is supplied for each element. */
function giveSize(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(width)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height)
}

describe('ChartTooltip', () => {
  it('stays in the DOM and empty while there is no content, so its updates are announced', () => {
    const { el } = renderTooltip({ content: null })
    expect(el).toHaveAttribute('role', 'status')
    expect(el).not.toHaveAttribute('hidden')
    expect(el).toBeEmptyDOMElement()
  })

  it('shows the title, each value with its label, and any note once there is content', () => {
    const { el } = renderTooltip({
      content: { ...content, rows: [{ kind: 'run', value: '1', label: 'x', note: 'Muted line' }] },
    })
    expect(el).not.toHaveAttribute('hidden')
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('x')).toBeInTheDocument()
    expect(screen.getByText('Muted line')).toBeInTheDocument()
  })

  it('colours each key by its series, and draws a plain key when the row has no kind', () => {
    const { el } = renderTooltip({ content })
    const keys = Array.from(el.querySelectorAll('.chart-tooltip__key'))
    expect(keys).toHaveLength(3)
    expect(keys[0]).toHaveClass('chart-tooltip__key--run')
    expect(keys[1]).toHaveClass('chart-tooltip__key--ride')
    expect(keys[2]).not.toHaveClass('chart-tooltip__key--run')
    expect(keys[2]).not.toHaveClass('chart-tooltip__key--ride')
    keys.forEach((key) => expect(key).toHaveAttribute('aria-hidden', 'true'))
  })

  it('places the tooltip to the right of the point, offset from it', () => {
    giveSize(100, 40)
    const { el } = renderTooltip({ content })
    expect(el.style.left).toBe('112px')
    expect(el.style.top).toBe('30px')
  })

  it('flips to the left of the point when it would run past the right edge', () => {
    giveSize(100, 40)
    const { el } = renderTooltip({ content: { ...content, x: 350 } })
    expect(el.style.left).toBe('238px')
  })

  it('keeps the tooltip inside the bounds at the top and bottom', () => {
    giveSize(100, 40)
    const high = renderTooltip({ content: { ...content, y: 0 } })
    expect(high.el.style.top).toBe('0px')
    high.unmount()
    const low = renderTooltip({ content: { ...content, y: 300 } })
    expect(low.el.style.top).toBe('260px')
  })

  it('clamps a tooltip wider than the chart to the left edge', () => {
    giveSize(500, 40)
    const { el } = renderTooltip({
      content: { ...content, x: 10 },
      bounds: { width: 400, height: 300 },
    })
    expect(el.style.left).toBe('0px')
  })

  it('moves when the content changes to a new point', () => {
    giveSize(100, 40)
    const { el, rerender } = renderTooltip({ content })
    expect(el.style.left).toBe('112px')
    rerender(
      <ChartTooltip
        content={{ ...content, x: 20 }}
        bounds={{ width: 400, height: 300 }}
        id="tip"
      />,
    )
    expect(el.style.left).toBe('32px')
  })
})
