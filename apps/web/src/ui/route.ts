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
  // A query is not part of the page. One trailing slash is ignored, so '#/run/' and '#/run' are the same page.
  const path = hash.replace(/^#\/?/, '').split('?')[0]!.replace(/\/$/, '')
  const [first, second, ...rest] = path.split('/')
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

/** The query of a hash route, such as '#/activities?page=2', as search parameters. */
export function hashQuery(hash: string): URLSearchParams {
  const at = hash.indexOf('?')
  return new URLSearchParams(at === -1 ? '' : hash.slice(at + 1))
}

/**
 * The hash to show for a URL: an unknown hash becomes Balance's, so the address names the page
 * the visitor sees. The empty and Balance hashes are already canonical.
 */
export function canonicalHash(hash: string): string {
  if (hash === '' || hash === '#' || hash === '#/') return hash
  return parseRoute(hash).page === 'balance' ? '#/' : hash
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
