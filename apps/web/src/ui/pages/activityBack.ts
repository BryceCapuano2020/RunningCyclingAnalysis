import type { MouseEvent } from 'react'
import { previousRoute } from '../routeHistory'

/** A modified or non-primary click is the browser's to open in a tab, as a link is. */
export function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return !(event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
}

/**
 * Back to the list. When the list is the page before this one, Back returns to it where it was left,
 * rather than opening it again as a new page.
 */
export function backToList(event: MouseEvent<HTMLAnchorElement>) {
  if (!isPlainClick(event) || previousRoute()?.page !== 'activities') return
  event.preventDefault()
  window.history.back()
}

/** The page the activity was opened from, when that is the list, Run or Ride; otherwise null. */
export function originOf(): 'activities' | 'run' | 'ride' | null {
  const page = previousRoute()?.page
  return page === 'activities' || page === 'run' || page === 'ride' ? page : null
}

/** Back to where the activity was opened from, so Back and the link agree, as backToList does. */
export function backToOrigin(event: MouseEvent<HTMLAnchorElement>) {
  if (!isPlainClick(event) || originOf() === null) return
  event.preventDefault()
  window.history.back()
}
