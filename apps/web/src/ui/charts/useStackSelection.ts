import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { PlotBox } from './chartTypes'

/** The whole seconds a drag selected, from the first to the last. */
export interface SecondRange {
  from: number
  to: number
}

/** A mouse has to move this far, in px, before a press is a drag and not a click. */
const DRAG_PX = 4
/** A finger held still this long, in ms, is a selection and not a scrub. */
const HOLD_MS = 400
/** A finger that moves this far, in px, before the hold is a scrub, and the page's to scroll. */
const SLOP_PX = 10

interface Press {
  id: number
  touch: boolean
  x: number
  y: number
  /** The second under the pointer when it went down, as a fraction. */
  at: number
  active: boolean
  /** The furthest the pointer has been from where it went down, px, so a hold that is lifted again is not a drag. */
  travel: number
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * Selecting a stretch of the stack by dragging across it. A mouse or pen drags straight away; a finger scrubs, as
 * it always has, and selects only after it has been held still for a moment, so a page scroll and a scrub are
 * never taken for one. The range is highlighted while the pointer moves and handed to `onSelect` when it lifts;
 * Escape drops it. The brush's handles stay the keyboard's way to the same selection.
 */
export function useStackSelection({
  svg,
  width,
  plot,
  startS,
  endS,
  onSelect,
}: {
  svg: RefObject<SVGSVGElement | null>
  /** The drawing's width in its own px, which the page's px scale to. */
  width: number
  plot: PlotBox
  startS: number
  endS: number
  onSelect?: (from: number, to: number) => void
}) {
  const press = useRef<Press | null>(null)
  const [range, setRange] = useState<SecondRange | null>(null)
  // The range as the last move left it: the release reads this, not a render's state, which can be a move behind.
  const live = useRef<SecondRange | null>(null)
  const show = (next: SecondRange | null) => {
    live.current = next
    setRange(next)
  }
  const span = Math.max(1, endS - startS)

  const secondAt = (clientX: number): number | null => {
    const box = svg.current?.getBoundingClientRect()
    if (box === undefined || box.width === 0) return null
    const x = ((clientX - box.left) / box.width) * width
    if (x < plot.left || x > plot.right) return null
    return startS + ((x - plot.left) / (plot.right - plot.left)) * span
  }

  const clear = useCallback(() => {
    if (press.current?.timer) clearTimeout(press.current.timer)
    press.current = null
    live.current = null
    setRange(null)
  }, [])

  const begin = (current: Press, event: { pointerId: number; clientX: number }) => {
    current.active = true
    svg.current?.setPointerCapture?.(event.pointerId)
    show({ from: Math.floor(current.at), to: Math.ceil(current.at) })
  }

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (onSelect === undefined || (event.pointerType === 'mouse' && event.button !== 0)) return
    const at = secondAt(event.clientX)
    if (at === null) return
    const touch = event.pointerType === 'touch'
    const current: Press = {
      id: event.pointerId,
      touch,
      x: event.clientX,
      y: event.clientY,
      at,
      active: false,
      travel: 0,
      timer: null,
    }
    if (touch) {
      const { pointerId, clientX } = event
      current.timer = setTimeout(() => {
        if (press.current !== current) return
        begin(current, { pointerId, clientX })
        navigator.vibrate?.(8)
      }, HOLD_MS)
    }
    press.current = current
  }

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = press.current
    if (current === null || current.id !== event.pointerId) return
    const moved = Math.hypot(event.clientX - current.x, event.clientY - current.y)
    if (!current.active) {
      if (current.touch && moved > SLOP_PX) return clear()
      if (current.touch || moved < DRAG_PX) return
      begin(current, event)
    }
    current.travel = Math.max(current.travel, moved)
    const here = secondAt(event.clientX)
    const to = here ?? (event.clientX < current.x ? startS : endS)
    const [low, high] = current.at < to ? [current.at, to] : [to, current.at]
    show({
      from: Math.max(startS, Math.floor(low)),
      to: Math.min(endS, Math.max(Math.ceil(high), Math.floor(low) + 1)),
    })
  }

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = press.current
    if (current === null || current.id !== event.pointerId) return
    // A finger held and then lifted without moving selects nothing: it is not a range, and must not zoom a second.
    const chosen = current.active && current.travel >= DRAG_PX ? live.current : null
    clear()
    if (chosen !== null && chosen.to - chosen.from >= 1) onSelect?.(chosen.from, chosen.to)
  }

  // A held finger that is selecting must not also scroll the page, which only a native listener can stop.
  useEffect(() => {
    const node = svg.current
    if (node === null) return
    const hold = (event: TouchEvent) => {
      if (press.current?.active) event.preventDefault()
    }
    node.addEventListener('touchmove', hold, { passive: false })
    return () => node.removeEventListener('touchmove', hold)
  }, [svg])

  // Escape drops the range being dragged, and only that: the plot's own Escape (which clears the cursor) is not also pressed.
  useEffect(() => {
    if (range === null) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      clear()
    }
    window.addEventListener('keydown', escape, true)
    return () => window.removeEventListener('keydown', escape, true)
  }, [range, clear])

  // A hold that has not fired when the plot goes away must not fire after it.
  useEffect(
    () => () => {
      if (press.current?.timer) clearTimeout(press.current.timer)
    },
    [],
  )

  const selecting = useCallback(() => press.current?.active === true, [])

  return {
    range,
    /** Whether a selection is being dragged, so the cursor stays where it was and does not chase the pointer. */
    selecting,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: clear },
  }
}
