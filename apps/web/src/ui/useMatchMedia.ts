import { useSyncExternalStore } from 'react'

/** One subscribe function per query, so a render does not hand React a new one and resubscribe. */
const SUBSCRIBERS = new Map<string, (notify: () => void) => () => void>()

function subscriberFor(query: string): (notify: () => void) => () => void {
  let subscribe = SUBSCRIBERS.get(query)
  if (subscribe === undefined) {
    subscribe = (notify) => {
      const list = window.matchMedia?.(query)
      list?.addEventListener('change', notify)
      return () => list?.removeEventListener('change', notify)
    }
    SUBSCRIBERS.set(query, subscribe)
  }
  return subscribe
}

/** Whether a CSS media query matches now, and follows it as the window changes. False where there is no matchMedia. */
export function useMatchMedia(query: string): boolean {
  return useSyncExternalStore(
    subscriberFor(query),
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  )
}
