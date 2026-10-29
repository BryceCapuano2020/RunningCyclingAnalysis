import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './Definition.css'

export interface DefinitionProps {
  /** The term as written in the sentence, which the button wears. */
  children: ReactNode
  /** What the term means, in a sentence or two. */
  meaning: string
}

/** How far a panel keeps from the window's edge, px. */
const EDGE = 8

/** Each open-able definition's way to close itself, so that opening one can close the rest. */
const closers = new Set<() => void>()

/**
 * A term that carries the answer, with its meaning one press away: a button that opens a short note under
 * it. The note shows while the term is pressed or a pointer rests on it or on the note, which touches the term
 * with no gap, so the pointer can cross to it. A press stays open until it is pressed again, Escape is pressed,
 * the page is pressed elsewhere, or focus leaves the term. Opening one definition closes the others. The note
 * is moved inward when it would run past the window's edge, so a term at the right of a line on a phone does
 * not widen the page.
 */
export function Definition({ children, meaning }: DefinitionProps) {
  const [pressed, setPressed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const open = pressed || hovered
  const root = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLSpanElement>(null)
  const id = useId()
  const close = useCallback(() => {
    setPressed(false)
    setHovered(false)
  }, [])

  useEffect(() => {
    closers.add(close)
    return () => {
      closers.delete(close)
    }
  }, [close])

  // Opening this one, by press or by pointer, closes every other.
  useEffect(() => {
    if (!open) return
    for (const other of closers) if (other !== close) other()
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const dismiss = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape') return
      if (event instanceof MouseEvent && root.current?.contains(event.target as Node)) return
      close()
    }
    document.addEventListener('keydown', dismiss)
    document.addEventListener('pointerdown', dismiss)
    return () => {
      document.removeEventListener('keydown', dismiss)
      document.removeEventListener('pointerdown', dismiss)
    }
  }, [open, close])

  // Measured with no shift, then shifted so the whole note is inside the window.
  useLayoutEffect(() => {
    const note = panel.current
    if (note === null) return
    note.style.setProperty('--definition-shift', '0px')
    if (!open) return
    const box = note.getBoundingClientRect()
    const room = document.documentElement.clientWidth
    if (box.width === 0) return
    if (box.right > room - EDGE) {
      note.style.setProperty('--definition-shift', `${room - EDGE - box.right}px`)
    } else if (box.left < EDGE) {
      note.style.setProperty('--definition-shift', `${EDGE - box.left}px`)
    }
  }, [open])

  return (
    <span
      className="definition"
      ref={root}
      data-open={open}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onBlur={(event) => {
        // Focus moving out of the term closes a press; focus moving to the note's own text does not.
        if (!root.current?.contains(event.relatedTarget as Node | null)) setPressed(false)
      }}
    >
      <button
        type="button"
        className="definition__term"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setPressed((was) => !was)}
      >
        {children}
      </button>
      <span id={id} ref={panel} className="definition__note" role="note">
        {meaning}
      </span>
    </span>
  )
}
