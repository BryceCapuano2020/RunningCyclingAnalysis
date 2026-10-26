/**
 * The How sure is this? section a link asked for. A fragment would change the hash route, so the
 * link leaves the section's id here, and the page focuses it once it has mounted.
 *
 * A request belongs to the navigation its link made. The first hash change after the link keeps it,
 * since that is the navigation itself; every later hash change is a route change the request did not
 * cause, so it drops the request. A request therefore never outlives a visit that did not come from its
 * link, and a page reached some other way does not jump.
 */
let requested: string | null = null
let awaitingOwnNavigation = false

export function requestMethodSection(id: string): void {
  requested = id
  awaitingOwnNavigation = true
}

export function requestedMethodSection(): string | null {
  return requested
}

export function clearRequestedMethodSection(): void {
  requested = null
  awaitingOwnNavigation = false
}

function onHashChange(): void {
  if (awaitingOwnNavigation) awaitingOwnNavigation = false
  else requested = null
}

if (typeof window !== 'undefined') window.addEventListener('hashchange', onHashChange)
