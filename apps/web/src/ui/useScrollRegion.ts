import { useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Whether the element is wider than its box, so that a keyboard reader must reach it to read what
 * is cut off. A closed disclosure measures nothing, so it is measured again when it opens.
 */
function useOverflows(ref: RefObject<HTMLDivElement | null>): boolean {
  const [overflows, setOverflows] = useState(false)
  // No dependencies: the content changes what it draws, so it is measured after each render.
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null || typeof ResizeObserver === 'undefined') return
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth)
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    measure()
    return () => observer.disconnect()
  })
  return overflows
}

/**
 * The props of a `.table-scroll` box that a keyboard reader can reach: a named, focusable region
 * while its table is cut off (or `scrolls` says it always is), and a plain box otherwise.
 */
export function useScrollRegion(label: string, scrolls = false) {
  const ref = useRef<HTMLDivElement>(null)
  const overflows = useOverflows(ref)
  const reachable = scrolls || overflows
  return {
    ref,
    role: reachable ? ('region' as const) : undefined,
    'aria-label': reachable ? label : undefined,
    tabIndex: reachable ? 0 : undefined,
  }
}
