import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Keeps --header-height at the header's measured height while it stays at the top of the screen, and at zero
 * while it scrolls away with the page (below the rail's width). The text can make it taller, and a control the
 * browser scrolls to, or a bar stuck under it, must clear it.
 */
export function useHeaderHeight(header: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = header.current
    if (element === null) return
    const root = document.documentElement
    const measure = () => {
      const stuck = getComputedStyle(element).position === 'sticky'
      root.style.setProperty('--header-height', `${stuck ? element.offsetHeight : 0}px`)
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      root.style.removeProperty('--header-height')
    }
  }, [header])
}
