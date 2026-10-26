import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { pickSpot, scrollToKeep } from './onScreen'
import type { PickSpot } from './onScreen'

/**
 * Keeps a control where the athlete pressed it while the answer to the pick re-lays the text above it.
 * The dates and the note change length with the period, and that moves the control. The hook returns
 * `markPick`, called on each pick. The answer clears `waiting`, and the text above has its new length
 * by then, since the worker's reply sets the period in the same update. So the page scrolls by the
 * distance the control moved. It does not scroll when the control was out of view at the pick, or
 * when the athlete has scrolled since.
 */
export function usePickInPlace(ref: RefObject<HTMLElement | null>, waiting: boolean): () => void {
  const pick = useRef<{ spot: PickSpot | null } | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (pick.current === null || waiting || element === null) return
    const { spot } = pick.current
    pick.current = null
    const delta = scrollToKeep(spot, element.getBoundingClientRect().top, window.scrollY)
    if (delta !== 0) window.scrollBy(0, delta)
  }, [ref, waiting])

  return () => {
    const element = ref.current
    if (element === null) return
    const { top } = element.getBoundingClientRect()
    pick.current = { spot: pickSpot(top, window.scrollY, window.innerHeight) }
  }
}
