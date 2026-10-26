/**
 * Whether an element whose top edge is `top` pixels from the viewport's top starts on screen. The top
 * edge decides it, so a control that is cut off at the foot of the screen still counts as there.
 */
export function startsOnScreen(top: number, viewportHeight = window.innerHeight): boolean {
  return top >= 0 && top < viewportHeight
}

/** Where a control was on screen when a pick was made: its top edge, and how far the page was scrolled. */
export interface PickSpot {
  top: number
  scrollY: number
}

/** The spot a pick is made from, or null when the control is off screen then, so there is none to keep. */
export function pickSpot(top: number, scrollY: number, viewportHeight: number): PickSpot | null {
  return startsOnScreen(top, viewportHeight) ? { top, scrollY } : null
}

/**
 * How far the page scrolls so the control sits where the pick found it: the distance its top edge has
 * moved. Zero when there was no spot, or when the athlete has scrolled since the pick, since then they
 * chose a place of their own.
 */
export function scrollToKeep(spot: PickSpot | null, top: number, scrollY: number): number {
  if (spot === null || spot.scrollY !== scrollY) return 0
  return top - spot.top
}
