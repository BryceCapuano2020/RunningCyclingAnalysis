import { useSyncExternalStore } from 'react'

/** Whether a CSS media query matches now, and follows it as the window changes. False where there is no matchMedia. */
export function useMatchMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia?.(query)
      list?.addEventListener('change', notify)
      return () => list?.removeEventListener('change', notify)
    },
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  )
}
