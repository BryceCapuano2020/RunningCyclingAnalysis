// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChartTooltip } from './ChartTooltip'
import type { ChartTooltipProps } from './ChartTooltip'
import type { TooltipContent } from './chartTypes'
import { readStylesheet, ruleBody } from '../components/stylesheet'

const tooltipCss = await readStylesheet(import.meta.url, './ChartTooltip.css')

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
    // A wide chart, so that the tooltip sits beside its point rather than at the top of the plot.
    bounds: { width: 600, height: 300 },
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

  it('draws a dashed key for an estimate, in its series colour, and for the previous period in its own mark', () => {
    const { el } = renderTooltip({
      content: {
        ...content,
        rows: [
          { kind: 'ride', value: '58%', label: 'Ride, estimated', swatch: 'dashed' },
          { kind: 'neutral', value: '50%', label: 'Previous 6 weeks', swatch: 'dashed' },
        ],
      },
    })
    const [ride, previous] = Array.from(el.querySelectorAll('.chart-tooltip__key'))
    expect(ride).toHaveClass('chart-tooltip__key--dashed', 'chart-tooltip__key--dashed-ride')
    expect(ride).not.toHaveClass('chart-tooltip__key--ride')
    expect(previous).toHaveClass('chart-tooltip__key--dashed')
    expect(previous).not.toHaveClass('chart-tooltip__key--neutral')
  })

  it('draws the previous period’s dashed key in the previous-period mark, not the neutral one', () => {
    expect(ruleBody(tooltipCss, '.chart-tooltip__key--dashed')).toMatch(
      /border-top:\s*2px dashed var\(--previous-mark\)/,
    )
    expect(ruleBody(tooltipCss, '.chart-tooltip__key--dashed-ride')).toMatch(
      /border-top-color:\s*var\(--series-ride\)/,
    )
  })

  it('sets a tooltip’s note in balanced lines, so it does not end on one word', () => {
    expect(ruleBody(tooltipCss, '.chart-tooltip__note')).toMatch(/text-wrap:\s*pretty/)
  })

  it('caps a tooltip at the chart width less 24 px, so it stays inside a narrow chart', () => {
    expect(ruleBody(tooltipCss, '.chart-tooltip')).toMatch(
      /max-width:\s*min\(280px, calc\(100% - 24px\)\)/,
    )
  })

  it('sits at the top of the plot below 480 px, rather than on its point', () => {
    giveSize(100, 40)
    const narrow = renderTooltip({
      content: { ...content, y: 150 },
      bounds: { width: 320, height: 300, plotTop: 28 },
    })
    expect(narrow.el.style.top).toBe('28px')
    narrow.unmount()
    const wide = renderTooltip({
      content: { ...content, y: 150 },
      bounds: { width: 480, height: 300, plotTop: 28 },
    })
    expect(wide.el.style.top).toBe('130px')
  })

  it('places the tooltip to the right of the point, offset from it', () => {
    giveSize(100, 40)
    const { el } = renderTooltip({ content })
    expect(el.style.left).toBe('112px')
    expect(el.style.top).toBe('30px')
  })

  it('flips to the left of the point when it would run past the right edge', () => {
    giveSize(100, 40)
    const { el } = renderTooltip({
      content: { ...content, x: 350 },
      bounds: { width: 400, height: 300 },
    })
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
