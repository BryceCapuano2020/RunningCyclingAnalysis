import { useCallback, useSyncExternalStore } from 'react'

/** The media query, or null where there is no window to ask: a worker, or a test with no matchMedia. */
function queryOf(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(query)
}

/** Whether a media query matches, following it as it changes. A place with no window never matches. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = queryOf(query)
      if (list === null) return () => {}
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => queryOf(query)?.matches ?? false,
    () => false,
  )
}

/**
 * A screen worked by touch: a coarse pointer, or no hover. Such a visitor cannot drag a file onto the page
 * and rarely has an export on the device, so the sample leads and the drag wording goes.
 */
export const TOUCH_QUERY = '(pointer: coarse), (hover: none)'

export function useTouchFirst(): boolean {
  return useMediaQuery(TOUCH_QUERY)
}
