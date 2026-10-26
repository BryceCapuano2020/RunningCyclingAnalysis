// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStylesheet, ruleBody } from '../components/stylesheet'
import { PlotSurface } from './PlotSurface'
import type { PlotSurfaceProps } from './PlotSurface'
import type { ChartSize } from './chartTypes'

const surfaceCss = await readStylesheet(import.meta.url, './PlotSurface.css')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const size: ChartSize = {
  width: 400,
  height: 200,
  plot: { left: 40, right: 380, top: 20, bottom: 150 },
  tooltipId: 'tip',
  titleId: 'chart-title',
  hintId: 'chart-hint',
}

function renderSurface() {
  render(<span id="chart-title">Test chart</span>)
  const onPoint = vi.fn<PlotSurfaceProps['onPoint']>()
  const onKey = vi.fn<PlotSurfaceProps['onKey']>()
  const onBlur = vi.fn<PlotSurfaceProps['onBlur']>()
  render(
    <svg>
      <PlotSurface size={size} onPoint={onPoint} onKey={onKey} onBlur={onBlur} />
    </svg>,
  )
  return { onPoint, onKey, onBlur, surface: screen.getByTestId('plot-surface') }
}

describe('PlotSurface', () => {
  it('is one keyboard-focusable group that the tooltip describes', () => {
    const { surface } = renderSurface()
    expect(surface).toHaveAttribute('tabindex', '0')
    expect(surface).toHaveAttribute('role', 'group')
    expect(surface).toHaveAttribute('aria-describedby', 'tip chart-hint')
    expect(surface).toHaveAttribute('aria-roledescription', 'chart')
  })

  it('covers the plot area with its hit rectangle', () => {
    const { surface } = renderSurface()
    const hit = surface.querySelector('rect')
    expect(hit).toHaveAttribute('x', '40')
    expect(hit).toHaveAttribute('y', '20')
    expect(hit).toHaveAttribute('width', '340')
    expect(hit).toHaveAttribute('height', '130')
  })

  it('reports the pointer in chart pixels, scaled from the drawn size', () => {
    const { surface, onPoint } = renderSurface()
    const svg = surface.closest('svg')
    if (svg === null) throw new Error('no owner svg')
    // The drawn svg is half the chart size, so one screen pixel is two chart pixels.
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 200, 100))
    fireEvent.pointerMove(surface, { clientX: 60, clientY: 45 })
    expect(onPoint).toHaveBeenLastCalledWith({ x: 100, y: 50 })
  })

  it('reports leaving the surface as no point', () => {
    const { surface, onPoint } = renderSurface()
    fireEvent.pointerLeave(surface)
    expect(onPoint).toHaveBeenLastCalledWith(null)
  })

  it('passes the left, right and escape keys on and stops the page from scrolling for them', () => {
    const { surface, onKey } = renderSurface()
    expect(fireEvent.keyDown(surface, { key: 'ArrowLeft' })).toBe(false)
    expect(fireEvent.keyDown(surface, { key: 'ArrowRight' })).toBe(false)
    expect(fireEvent.keyDown(surface, { key: 'Escape' })).toBe(false)
    expect(onKey.mock.calls).toEqual([['ArrowLeft'], ['ArrowRight'], ['Escape']])
  })

  it('ignores other keys and leaves them to the browser', () => {
    const { surface, onKey } = renderSurface()
    expect(fireEvent.keyDown(surface, { key: 'a' })).toBe(true)
    expect(fireEvent.keyDown(surface, { key: 'ArrowUp' })).toBe(true)
    expect(onKey).not.toHaveBeenCalled()
  })

  it('reports focus leaving the surface', () => {
    const { surface, onBlur } = renderSurface()
    fireEvent.blur(surface)
    expect(onBlur).toHaveBeenCalledTimes(1)
  })

  it('names the chart by its visible title, and reads its values with the arrow keys', () => {
    const { surface } = renderSurface()
    expect(surface).toHaveAttribute('aria-labelledby', 'chart-title')
    expect(document.getElementById('chart-title')).toHaveTextContent('Test chart')
    expect(surface).not.toHaveAttribute('aria-label')
  })

  it('opens the tooltip on a tap, at the tapped point', () => {
    const { surface, onPoint } = renderSurface()
    fireEvent.pointerDown(surface, { clientX: 60, clientY: 45, pointerType: 'touch' })
    expect(onPoint).toHaveBeenLastCalledWith({ x: 60, y: 45 })
  })

  it('keeps a touched tooltip when the finger lifts, so the value stays until a tap elsewhere', () => {
    const { surface, onPoint } = renderSurface()
    fireEvent.pointerDown(surface, { clientX: 60, clientY: 45, pointerType: 'touch' })
    fireEvent.pointerLeave(surface, { pointerType: 'touch' })
    expect(onPoint).not.toHaveBeenCalledWith(null)
  })

  it('clears a touched tooltip when a tap lands outside the chart', () => {
    const { surface, onPoint } = renderSurface()
    fireEvent.pointerDown(surface, { clientX: 60, clientY: 45, pointerType: 'touch' })
    fireEvent.pointerDown(document.body, { pointerType: 'touch' })
    expect(onPoint).toHaveBeenLastCalledWith(null)
    expect(surface).toBeInTheDocument()
  })

  it('keeps the tooltip for a tap on the chart itself', () => {
    const { surface, onPoint } = renderSurface()
    onPoint.mockClear()
    fireEvent.pointerDown(surface, { clientX: 60, clientY: 45, pointerType: 'touch' })
    expect(onPoint).toHaveBeenCalledTimes(1)
    expect(onPoint).not.toHaveBeenCalledWith(null)
  })

  it('clears a touched tooltip when the touch is cancelled, as when the page starts to scroll', () => {
    const { surface, onPoint } = renderSurface()
    fireEvent.pointerDown(surface, { clientX: 60, clientY: 45, pointerType: 'touch' })
    fireEvent.pointerCancel(surface, { pointerType: 'touch' })
    expect(onPoint).toHaveBeenLastCalledWith(null)
  })

  it('clears a mouse tooltip when the mouse leaves the plot', () => {
    const { surface, onPoint } = renderSurface()
    fireEvent.pointerLeave(surface, { pointerType: 'mouse' })
    expect(onPoint).toHaveBeenLastCalledWith(null)
  })

  it('lets a finger scroll the page up and down, and pinch to zoom, over the plot', () => {
    expect(ruleBody(surfaceCss, '.plot-surface')).toMatch(/touch-action:\s*pan-y pinch-zoom/)
    expect(ruleBody(surfaceCss, '.plot-surface__hit')).toMatch(/touch-action:\s*pan-y pinch-zoom/)
  })

  it('passes Home and End on, and stops the page from jumping for them', () => {
    const { surface, onKey } = renderSurface()
    expect(fireEvent.keyDown(surface, { key: 'Home' })).toBe(false)
    expect(fireEvent.keyDown(surface, { key: 'End' })).toBe(false)
    expect(onKey.mock.calls).toEqual([['Home'], ['End']])
  })
})
