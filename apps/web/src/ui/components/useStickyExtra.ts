import { useLayoutEffect } from 'react'

/** The height each stuck bar below the header adds to --sticky-extra; the bars on screen are summed. */
const heights = new Map<HTMLElement, number>()

function publish(): void {
  const root = document.documentElement
  let total = 0
  for (const height of heights.values()) total += height
  if (total === 0) root.style.removeProperty('--sticky-extra')
  else root.style.setProperty('--sticky-extra', `${total}px`)
}

/**
 * Keeps --sticky-extra at the height of a bar that sticks under the header (the section row, the chart readout)
 * whenever its position is sticky at this width, whether or not the page is scrolled far enough to stick it now,
 * so `scroll-padding-top` clears it as well as the header and a control the browser scrolls to is not left behind
 * the bar (WCAG 2.4.11). A bar that is not sticky at this width adds nothing. The element is a state value, not a
 * ref, so the hook measures once it exists.
 */
export function useStickyExtra(bar: HTMLElement | null): void {
  useLayoutEffect(() => {
    if (bar === null) return
    const measure = () => {
      const sticky = ['sticky', 'fixed'].includes(getComputedStyle(bar).position)
      heights.set(bar, sticky ? bar.offsetHeight : 0)
      publish()
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(bar)
    // A breakpoint can make the bar stick without changing its size.
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      heights.delete(bar)
      publish()
    }
  }, [bar])
}
