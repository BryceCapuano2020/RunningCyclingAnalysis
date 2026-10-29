// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TimeBrush } from './TimeBrush'
import { HANDLE_HIT_PX, draggedRange, handleOffsets } from './timeBrushModel'
import type { BrushRange } from './timeBrushModel'

describe('draggedRange', () => {
  const origin = { startS: 100, endS: 200 }

  it('moves one end by how far the pointer moved, and stops it a second short of the other', () => {
    expect(draggedRange('start', origin, 100, 150, 600)).toEqual({ startS: 150, endS: 200 })
    expect(draggedRange('start', origin, 100, 500, 600)).toEqual({ startS: 199, endS: 200 })
    expect(draggedRange('end', origin, 200, 50, 600)).toEqual({ startS: 100, endS: 101 })
    expect(draggedRange('end', origin, 200, 900, 600)).toEqual({ startS: 100, endS: 600 })
  })

  it('does not jump an end grabbed off its centre: the pointer five seconds inside it keeps that offset', () => {
    // Grabbed at 105, five seconds inside the start; the pointer then moves to 155.
    expect(draggedRange('start', origin, 105, 155, 600)).toEqual({ startS: 150, endS: 200 })
    expect(draggedRange('start', origin, 105, 105, 600)).toEqual({ startS: 100, endS: 200 })
    // Grabbed at 195, five seconds inside the end; the pointer moves to 250.
    expect(draggedRange('end', origin, 195, 250, 600)).toEqual({ startS: 100, endS: 255 })
  })

  it('pans the window with its length kept, and stops at either end of the activity', () => {
    expect(draggedRange('move', origin, 150, 250, 600)).toEqual({ startS: 200, endS: 300 })
    expect(draggedRange('move', origin, 150, 900, 600)).toEqual({ startS: 500, endS: 600 })
    expect(draggedRange('move', origin, 150, 0, 600)).toEqual({ startS: 0, endS: 100 })
  })

  it('brushes a new window from where it began to the pointer, in either direction, at least a second long', () => {
    expect(draggedRange('new', origin, 300, 400, 600)).toEqual({ startS: 300, endS: 400 })
    expect(draggedRange('new', origin, 300, 250, 600)).toEqual({ startS: 250, endS: 300 })
    expect(draggedRange('new', origin, 300, 300, 600)).toEqual({ startS: 300, endS: 301 })
    expect(draggedRange('new', origin, 600, 700, 600)).toEqual({ startS: 599, endS: 600 })
  })
})

function show(selection: BrushRange, onChange = vi.fn()) {
  render(
    <TimeBrush
      max={600}
      selection={selection}
      onChange={onChange}
      overview={null}
      spokenTime={(s) => `${s} seconds`}
    />,
  )
  // jsdom has no layout: the lane is 600 px wide, so a pixel is a second.
  const lane = document.querySelector('.ts-brush__lane') as HTMLElement
  lane.getBoundingClientRect = () => ({
    left: 0,
    width: 600,
    right: 600,
    top: 0,
    bottom: 44,
    height: 44,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  return { onChange, track: document.querySelector('.ts-brush__track') as HTMLElement }
}

describe('TimeBrush', () => {
  it('names both ends as sliders with the second they are at, in words', () => {
    show({ startS: 60, endS: 125 })
    const start = screen.getByRole('slider', { name: 'Selection start' })
    const end = screen.getByRole('slider', { name: 'Selection end' })
    expect(start).toHaveAttribute('aria-valuetext', 'Start 60 seconds')
    expect(start).toHaveAttribute('aria-valuemax', '124')
    expect(end).toHaveAttribute('aria-valuetext', 'End 125 seconds')
    expect(end).toHaveAttribute('aria-valuemin', '61')
  })

  it('moves an end by a two-hundredth of the activity, ten times that with Shift or Page keys, and to the limits with Home and End', () => {
    const { onChange } = show({ startS: 60, endS: 125 })
    const end = screen.getByRole('slider', { name: 'Selection end' })
    fireEvent.keyDown(end, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith({ startS: 60, endS: 128 })
    fireEvent.keyDown(end, { key: 'ArrowLeft', shiftKey: true })
    expect(onChange).toHaveBeenLastCalledWith({ startS: 60, endS: 95 })
    fireEvent.keyDown(end, { key: 'PageUp' })
    expect(onChange).toHaveBeenLastCalledWith({ startS: 60, endS: 155 })
    fireEvent.keyDown(end, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith({ startS: 60, endS: 600 })
    const start = screen.getByRole('slider', { name: 'Selection start' })
    fireEvent.keyDown(start, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith({ startS: 0, endS: 125 })
    fireEvent.keyDown(start, { key: 'a' })
    expect(onChange).toHaveBeenCalledTimes(5)
  })

  it('drags an end with the pointer, and a click that does not move changes nothing', () => {
    const { onChange, track } = show({ startS: 100, endS: 200 })
    const end = screen.getByRole('slider', { name: 'Selection end' })
    // Grabbed ten seconds inside the end (at 190), and dragged to 250: the end follows by sixty seconds.
    fireEvent.pointerDown(end, { clientX: 190, pointerId: 1 })
    fireEvent.pointerMove(track, { clientX: 250, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith({ startS: 100, endS: 260 })
    fireEvent.pointerUp(track, { pointerId: 1 })
    onChange.mockClear()
    // Over empty track: a click is no brush, a drag is.
    fireEvent.pointerDown(track, { clientX: 400, pointerId: 2 })
    fireEvent.pointerMove(track, { clientX: 401, pointerId: 2 })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.pointerMove(track, { clientX: 450, pointerId: 2 })
    expect(onChange).toHaveBeenLastCalledWith({ startS: 400, endS: 450 })
  })
})

describe('the handles of a short window', () => {
  it('centres each hit area on its edge while the edges are far apart, and slides them outward as they close', () => {
    expect(handleOffsets(200)).toEqual({ start: 0, end: 0 })
    expect(handleOffsets(HANDLE_HIT_PX)).toEqual({ start: 0, end: 0 })
    expect(handleOffsets(HANDLE_HIT_PX / 2)).toEqual({
      start: -HANDLE_HIT_PX / 4,
      end: HANDLE_HIT_PX / 4,
    })
    expect(handleOffsets(0)).toEqual({ start: -HANDLE_HIT_PX / 2, end: HANDLE_HIT_PX / 2 })
  })

  it('keeps both handles of a four-minute window in seventy minutes grabbable: whole 44 px areas that do not overlap', () => {
    render(
      <TimeBrush
        max={4200}
        selection={{ startS: 2000, endS: 2240 }}
        onChange={vi.fn()}
        overview={null}
        spokenTime={(s) => `${s} seconds`}
      />,
    )
    const area = (name: string) => {
      const handle = screen.getByRole('slider', { name })
      const left = parseFloat(handle.style.left)
      return {
        left,
        right: left + parseFloat(handle.style.width),
        width: parseFloat(handle.style.width),
      }
    }
    const start = area('Selection start')
    const end = area('Selection end')
    expect(start.width).toBe(HANDLE_HIT_PX)
    expect(end.width).toBe(HANDLE_HIT_PX)
    expect(start.right).toBeLessThanOrEqual(end.left)
  })
})
