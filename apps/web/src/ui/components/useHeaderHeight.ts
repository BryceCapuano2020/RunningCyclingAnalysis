import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Keeps --header-height at the header's measured height. The tokens hold the height of the header's
 * usual rows; the text can make it taller, and a control the browser scrolls to must clear it.
 */
export function useHeaderHeight(header: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = header.current
    if (element === null) return
    const root = document.documentElement
    const measure = () => root.style.setProperty('--header-height', `${element.offsetHeight}px`)
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(element)
    return () => {
      observer?.disconnect()
      root.style.removeProperty('--header-height')
    }
  }, [header])
}
