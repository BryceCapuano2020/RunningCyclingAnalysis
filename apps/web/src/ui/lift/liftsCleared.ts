import { tellOtherTabs } from '../tabSync'

const EVENT = 'rca:lifts-cleared'

/**
 * Remove all clears the lifting sets in the analysis worker, which the log on screen cannot see. This tells it, and the
 * other tabs, to read the store again.
 */
export function announceLiftsCleared(): void {
  window.dispatchEvent(new Event(EVENT))
  tellOtherTabs({ type: 'lifts' })
}

/** Calls `onCleared` when Remove all cleared the sets in this tab. Returns what stops it. */
export function onLiftsCleared(onCleared: () => void): () => void {
  window.addEventListener(EVENT, onCleared)
  return () => window.removeEventListener(EVENT, onCleared)
}
