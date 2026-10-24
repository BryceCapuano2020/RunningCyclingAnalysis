import { useEffect } from 'react'
import { parseRoute } from './route'
import type { Route } from './route'

/*
 * Back and Forward return the visitor to the page they left, at the place they left it. Each
 * history entry carries an id and the hash it was opened from in its history state. A scroll
 * position is kept per id while the document is open. A page opened by a link is a new entry, so
 * it starts at the top.
 */

const ENTRY_KEY = 'rcaEntry'
const FROM_KEY = 'rcaFrom'

const scrollById = new Map<string, number>()

function currentState(): Record<string, unknown> {
  const state: unknown = window.history.state
  return typeof state === 'object' && state !== null ? { ...state } : {}
}

function entryId(): string | null {
  const id = currentState()[ENTRY_KEY]
  return typeof id === 'string' ? id : null
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Gives the current entry an id, unless it has one, and records the hash it was opened from. */
function claimEntry(from: string): void {
  if (entryId() !== null) return
  window.history.replaceState({ ...currentState(), [ENTRY_KEY]: newId(), [FROM_KEY]: from }, '')
}

/** The fragment of a URL, with its #, or '' when there is none. */
function hashOf(url: string): string {
  const at = url.indexOf('#')
  return at === -1 ? '' : url.slice(at)
}

/** Most pages whose scroll is kept. An older page starts at the top when Back returns to it. */
const MAX_REMEMBERED_PAGES = 50

function rememberScroll(): void {
  const id = entryId()
  if (id === null) return
  // Delete before setting, so the page most recently left is last in the map.
  scrollById.delete(id)
  scrollById.set(id, window.scrollY)
  if (scrollById.size > MAX_REMEMBERED_PAGES) {
    const oldest = scrollById.keys().next().value
    if (oldest !== undefined) scrollById.delete(oldest)
  }
}

/**
 * Scrolls to where the visitor left the current entry, or to the top of an entry they have not
 * left yet.
 */
export function restoreScroll(): void {
  const id = entryId()
  const saved = id === null ? undefined : scrollById.get(id)
  window.scrollTo(0, saved ?? 0)
}

/** The page the visitor was on before the current entry, or null when it was not opened in the app. */
export function previousRoute(): Route | null {
  const from = currentState()[FROM_KEY]
  return typeof from === 'string' && from !== '' ? parseRoute(from) : null
}

/** Keeps each entry's scroll position, and marks each entry as it is opened. */
export function useRouteHistory(): void {
  useEffect(() => {
    claimEntry('')
    const onHashChange = (event: HashChangeEvent) => claimEntry(hashOf(event.oldURL))
    window.addEventListener('hashchange', onHashChange)
    window.addEventListener('scroll', rememberScroll, { passive: true })
    return () => {
      window.removeEventListener('hashchange', onHashChange)
      window.removeEventListener('scroll', rememberScroll)
    }
  }, [])
}
