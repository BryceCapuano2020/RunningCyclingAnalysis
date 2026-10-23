import { useSyncExternalStore } from 'react'

/**
 * The page the URL hash names. Hash routes need no fallback rule on the static host, and an
 * unknown hash shows Balance rather than an error.
 */
export type Route =
  | { page: 'balance' | 'run' | 'ride' | 'activities' | 'method' | 'profile' }
  | { page: 'activity'; id: string }

const SIMPLE_PAGES = ['run', 'ride', 'activities', 'method', 'profile'] as const

export function parseRoute(hash: string): Route {
  // One trailing slash is ignored, so '#/run/' and '#/run' are the same page.
  const [first, second, ...rest] = hash.replace(/^#\/?/, '').replace(/\/$/, '').split('/')
  if (first === 'activities' && second && rest.length === 0) {
    try {
      return { page: 'activity', id: decodeURIComponent(second) }
    } catch {
      return { page: 'activities' }
    }
  }
  const simple = SIMPLE_PAGES.find((page) => page === first)
  return simple && !second ? { page: simple } : { page: 'balance' }
}

export function hrefFor(route: Route): string {
  if (route.page === 'balance') return '#/'
  if (route.page === 'activity') return `#/activities/${encodeURIComponent(route.id)}`
  return `#/${route.page}`
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function currentHash(): string {
  return window.location.hash
}

/** The current route; the component re-renders when the hash changes. */
export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, currentHash, () => ''))
}
