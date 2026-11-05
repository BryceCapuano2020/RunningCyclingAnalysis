import type { Route } from '../route'
import { previousRoute } from '../routeHistory'

/**
 * The page a route belongs to, for the header and the rail to mark. An activity keeps the page of the sport it was
 * opened from, and otherwise belongs to Activities; the method page belongs to Balance; Profile to none.
 */
export function sectionOf(route: Route): Route['page'] | null {
  if (route.page === 'activity') {
    const from = previousRoute()?.page
    return from === 'run' || from === 'ride' ? from : 'activities'
  }
  if (route.page === 'method') return 'balance'
  if (route.page === 'profile') return null
  return route.page
}

/**
 * A link's aria-current. The link of the page itself is "page". An activity is a page of its section, so that
 * section's link is "true" there. Any other page, such as the method page, marks its link by class only, so a
 * screen reader is not told the link is the page.
 */
export function ariaCurrentOf(
  route: Route | null,
  target: Route['page'],
  current: Route['page'] | null,
): 'page' | 'true' | undefined {
  if (route?.page === target) return 'page'
  return route?.page === 'activity' && current === target ? 'true' : undefined
}
