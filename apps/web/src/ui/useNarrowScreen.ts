import { useMediaQuery } from './useMediaQuery'

/**
 * Whether the window is at or below a width, so a page can fold a section on a phone and leave it open
 * on a desktop. It follows a resize, and a place with no window is never narrow.
 */
export function useNarrowScreen(maxWidthPx: number): boolean {
  return useMediaQuery(`(max-width: ${maxWidthPx}px)`)
}
