// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActivityTrace } from '@rca/core/workbench'
import { ActivityWorkbench } from './ActivityWorkbench'
import { steadyTrace } from './workbenchFixtures'

afterEach(() => vi.useRealTimers())

function show(trace: ActivityTrace) {
  return render(
    <ActivityWorkbench
      activityId={trace.activityId}
      units="metric"
      loadTrace={async () => ({ kind: 'trace', trace })}
    />,
  )
}

/** jsdom has no layout: the stack is 640 px wide, from the page's left edge, so a client x is a drawing x. */
async function stack(): Promise<SVGSVGElement> {
  const plot = await screen.findByRole('group', { name: /over time$/ })
  const svg = plot.closest('svg')!
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 640, height: 200, right: 640, bottom: 200, x: 0, y: 0 }) as DOMRect
  return svg
}

const range = (): [number, number] => [
  Number(screen.getByRole('slider', { name: 'Selection start' }).getAttribute('aria-valuenow')),
  Number(screen.getByRole('slider', { name: 'Selection end' }).getAttribute('aria-valuenow')),
]

// The plot runs from 44 to 628 px; ten minutes over 584 px is a little more than a second a pixel.
const SECOND_PX = 584 / 600
const xOf = (second: number) => 44 + second * SECOND_PX

describe('dragging across the plot', () => {
  it('highlights the range while the mouse is down and zooms to it on release, with a Reset to undo it', async () => {
    show(steadyTrace(600))
    const svg = await stack()
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
    expect(screen.getByText('Drag to zoom')).toBeInTheDocument()
    fireEvent.pointerDown(svg, {
      clientX: xOf(150),
      clientY: 40,
      pointerId: 1,
      pointerType: 'mouse',
    })
    fireEvent.pointerMove(svg, {
      clientX: xOf(300),
      clientY: 40,
      pointerId: 1,
      pointerType: 'mouse',
    })
    const shade = svg.querySelector('.ts-stack__selection')!
    expect(shade).not.toBeNull()
    expect(Number(shade.getAttribute('x'))).toBeCloseTo(xOf(150), 0)
    expect(Number(shade.getAttribute('width'))).toBeCloseTo(150 * SECOND_PX, -1)
    // Nothing has zoomed yet.
    expect(range()).toEqual([0, 600])
    fireEvent.pointerUp(svg, { clientX: xOf(300), clientY: 40, pointerId: 1, pointerType: 'mouse' })
    const [from, to] = range()
    expect(from).toBeGreaterThanOrEqual(149)
    expect(from).toBeLessThanOrEqual(151)
    expect(to).toBeGreaterThanOrEqual(299)
    expect(to).toBeLessThanOrEqual(301)
    expect(svg.querySelector('.ts-stack__selection')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Reset' }))
    expect(range()).toEqual([0, 600])
  })

  it('drags either way, and a press that barely moves is a click that zooms nothing', async () => {
    show(steadyTrace(600))
    const svg = await stack()
    fireEvent.pointerDown(svg, {
      clientX: xOf(400),
      clientY: 40,
      pointerId: 1,
      pointerType: 'mouse',
    })
    fireEvent.pointerMove(svg, {
      clientX: xOf(400) + 2,
      clientY: 40,
      pointerId: 1,
      pointerType: 'mouse',
    })
    fireEvent.pointerUp(svg, {
      clientX: xOf(400) + 2,
      clientY: 40,
      pointerId: 1,
      pointerType: 'mouse',
    })
    expect(range()).toEqual([0, 600])
    fireEvent.pointerDown(svg, {
      clientX: xOf(400),
      clientY: 40,
      pointerId: 2,
      pointerType: 'mouse',
    })
    fireEvent.pointerMove(svg, {
      clientX: xOf(200),
      clientY: 40,
      pointerId: 2,
      pointerType: 'mouse',
    })
    fireEvent.pointerUp(svg, { clientX: xOf(200), clientY: 40, pointerId: 2, pointerType: 'mouse' })
    const [from, to] = range()
    expect(Math.abs(from - 200)).toBeLessThanOrEqual(1)
    expect(Math.abs(to - 400)).toBeLessThanOrEqual(1)
  })

  it('drops the range on Escape, and does not start from outside the plot', async () => {
    show(steadyTrace(600))
    const svg = await stack()
    fireEvent.pointerDown(svg, {
      clientX: xOf(100),
      clientY: 40,
      pointerId: 1,
      pointerType: 'mouse',
    })
    fireEvent.pointerMove(svg, {
      clientX: xOf(250),
      clientY: 40,
      pointerId: 1,
      pointerType: 'mouse',
    })
    expect(svg.querySelector('.ts-stack__selection')).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(svg.querySelector('.ts-stack__selection')).toBeNull()
    fireEvent.pointerUp(svg, { clientX: xOf(250), clientY: 40, pointerId: 1, pointerType: 'mouse' })
    expect(range()).toEqual([0, 600])
    // The axis labels' margin is not the plot.
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 40, pointerId: 2, pointerType: 'mouse' })
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 40, pointerId: 2, pointerType: 'mouse' })
    expect(svg.querySelector('.ts-stack__selection')).toBeNull()
  })
})

describe('a finger on the plot', () => {
  const touch = (id: number) => ({ pointerId: id, pointerType: 'touch', clientY: 40 })

  it('scrubs as it did when it moves at once, and selects only after it has been held and then dragged', async () => {
    show(steadyTrace(600))
    const svg = await stack()
    vi.useFakeTimers()
    // Moving on at once: a scrub, so the cursor reads and nothing is selected, even after the hold time.
    fireEvent.pointerDown(svg, { ...touch(1), clientX: xOf(100) })
    fireEvent.pointerMove(svg, { ...touch(1), clientX: xOf(200) })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    fireEvent.pointerUp(svg, { ...touch(1), clientX: xOf(200) })
    expect(range()).toEqual([0, 600])
    expect(svg.querySelector('.ts-stack__selection')).toBeNull()
    // Held still, then dragged: a selection.
    fireEvent.pointerDown(svg, { ...touch(2), clientX: xOf(100) })
    act(() => {
      vi.advanceTimersByTime(450)
    })
    fireEvent.pointerMove(svg, { ...touch(2), clientX: xOf(260) })
    expect(svg.querySelector('.ts-stack__selection')).not.toBeNull()
    fireEvent.pointerUp(svg, { ...touch(2), clientX: xOf(260) })
    const [from, to] = range()
    expect(Math.abs(from - 100)).toBeLessThanOrEqual(1)
    expect(Math.abs(to - 260)).toBeLessThanOrEqual(1)
  })
})
