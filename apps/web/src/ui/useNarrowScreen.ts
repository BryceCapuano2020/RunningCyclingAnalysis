import { useCallback, useSyncExternalStore } from 'react'

/**
 * The media query for a width at or below maxWidthPx, or null where there is no window to ask: a worker,
 * or a test with no matchMedia. Such a place is never narrow.
 */
export function narrowQuery(maxWidthPx: number): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(`(max-width: ${maxWidthPx}px)`)
}

/**
 * Whether the window is at or below a width, so a page can fold a section on a phone and leave it open
 * on a desktop. It follows a resize.
 */
export function useNarrowScreen(maxWidthPx: number): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const query = narrowQuery(maxWidthPx)
      if (query === null) return () => {}
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    [maxWidthPx],
  )
  const narrow = () => narrowQuery(maxWidthPx)?.matches ?? false
  return useSyncExternalStore(subscribe, narrow, () => false)
}
