import { useEffect, useRef } from 'react'
import { focusPageHeading } from './pages/pageHeading'
import { restoreScroll } from './routeHistory'

/**
 * Whether focus was lost with the page that went away. Focus that is still on a control outside
 * the page, such as the header, is where the user put it and is left alone.
 */
function focusWasLost(): boolean {
  const active = document.activeElement
  if (active === null || active === document.body || !active.isConnected) return true
  return document.querySelector('main')?.contains(active) ?? false
}

/**
 * A new page replaces the old one, so focus moves to the new page's heading and the page shows from the top,
 * or where the visitor left it when Back returns to it. A link the user followed always moves them; a page that
 * changes by itself, such as a library that loads, only takes focus that was lost with the old page. The first
 * render keeps the browser's own focus and scroll. `key` changes whenever a different page is on screen.
 */
export function usePageFocus(key: string): void {
  const previousKey = useRef(key)
  const previousHash = useRef(window.location.hash)
  useEffect(() => {
    if (previousKey.current === key) return
    const fromLanding = previousKey.current === 'landing'
    previousKey.current = key
    const followed = previousHash.current !== window.location.hash
    previousHash.current = window.location.hash
    if (!followed && !focusWasLost()) return
    // A first result replaces the landing page, where the visitor may have scrolled down to a sample
    // button that is now gone. That scroll is not a place they left, so the result starts at the top.
    if (fromLanding && !followed) window.scrollTo(0, 0)
    else restoreScroll()
    // Focus without a scroll of its own, so the position just restored is kept.
    focusPageHeading({ preventScroll: true })
  }, [key])
}
