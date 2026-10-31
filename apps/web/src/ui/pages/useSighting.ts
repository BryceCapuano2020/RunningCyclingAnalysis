import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { SeenEvent } from '../../worker/protocol'

/** A row counts as shown when it has been in view, on a visible page, this long. */
export const IMPRESSION_MS = 3_000

/** The rows counted in this page load: a row that comes and goes with the page it is on counts once. */
const counted = new Set<string>()

/**
 * Counts a showing of a row once a page load: after `IMPRESSION_MS` in view on a visible page. The callback is read
 * when the timer fires, so a new one does not restart the count.
 */
export function useSighting(
  row: RefObject<HTMLElement | null>,
  onSeen: (event: SeenEvent) => void,
  kind: string,
): RefObject<(event: SeenEvent) => void> {
  const seen = useRef(onSeen)
  // The latest callback, read when a timer fires or a control is used.
  useEffect(() => {
    seen.current = onSeen
  })

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    let inView = typeof IntersectionObserver === 'undefined'
    const visible = () => document.visibilityState !== 'hidden'
    const arm = () => {
      if (counted.has(kind) || timer !== null || !inView || !visible()) return
      timer = setTimeout(() => {
        timer = null
        if (counted.has(kind)) return
        counted.add(kind)
        seen.current('impression')
      }, IMPRESSION_MS)
    }
    const disarm = () => {
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
    const watch = () => (visible() ? arm() : disarm())
    document.addEventListener('visibilitychange', watch)
    let observer: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== 'undefined' && row.current !== null) {
      observer = new IntersectionObserver((entries) => {
        inView = entries.some((entry) => entry.isIntersecting)
        if (inView) arm()
        else disarm()
      })
      observer.observe(row.current)
    } else arm()
    return () => {
      disarm()
      observer?.disconnect()
      document.removeEventListener('visibilitychange', watch)
    }
  }, [kind, row])

  return seen
}
