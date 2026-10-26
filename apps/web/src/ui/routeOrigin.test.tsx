// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browserHashChange, recordHashListeners } from '../test/hashchange'
import { useRoute } from './route'
import { previousRoute, useRouteHistory } from './routeHistory'

/** The page the entry was opened from, as the probe reads it at each render. */
type Seen = string | null

/** Mounted in App's order: the route first, then the history that records where an entry came from. */
function Probe({ seen }: { seen: (origin: Seen) => void }) {
  const route = useRoute()
  useRouteHistory()
  seen(previousRoute()?.page ?? null)
  return <p>{route.page}</p>
}

let hashListeners: EventListener[] = []

beforeEach(() => {
  window.history.replaceState(null, '', '#/run')
  hashListeners = recordHashListeners()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '#/')
})

describe('the origin of an entry, as the route renders', () => {
  it('is written before the route re-renders, so the new page sees where it was opened from', async () => {
    const seen: Seen[] = []
    render(<Probe seen={(origin) => seen.push(origin)} />)

    const oldURL = window.location.href
    window.history.pushState(null, '', '#/activities/a1')
    seen.length = 0
    await browserHashChange(hashListeners, oldURL)

    expect(seen.at(-1)).toBe('run')
  })
})
