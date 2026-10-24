// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { previousRoute, restoreScroll, useRouteHistory } from './routeHistory'

/** The history state of the current entry, typed as the app writes it. */
function entryState(): { rcaEntry?: string } {
  return (window.history.state ?? {}) as { rcaEntry?: string }
}

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, writable: true, value })
}

/** Follows a link: a new entry, then the hashchange the browser fires for it. */
function follow(hash: string) {
  const oldURL = window.location.href
  window.history.pushState(null, '', hash)
  window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }))
}

/** Goes back to an entry, which comes back with the state it had, as the browser restores it. */
function goBack(state: unknown, hash: string) {
  const oldURL = window.location.href
  window.history.replaceState(state, '', hash)
  window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }))
}

let scrollTo: ReturnType<typeof vi.fn>

beforeEach(() => {
  window.history.replaceState(null, '', '#/')
  setScrollY(0)
  scrollTo = vi.fn()
  vi.spyOn(window, 'scrollTo').mockImplementation(scrollTo as unknown as typeof window.scrollTo)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useRouteHistory', () => {
  it('gives the first entry an id, and keeps it when the entry is visited again', () => {
    renderHook(() => useRouteHistory())
    const first = entryState().rcaEntry
    expect(first).toEqual(expect.any(String))

    const firstState = window.history.state
    follow('#/run')
    expect(entryState().rcaEntry).not.toBe(first)

    goBack(firstState, '#/')
    expect(entryState().rcaEntry).toBe(first)
  })

  it('reports the page an entry was opened from', () => {
    renderHook(() => useRouteHistory())
    follow('#/activities')
    expect(previousRoute()).toEqual({ page: 'balance' })

    follow('#/activities/abc')
    expect(previousRoute()).toEqual({ page: 'activities' })
  })

  it('reports no page for an entry that was not opened in the app', () => {
    renderHook(() => useRouteHistory())
    expect(previousRoute()).toBeNull()
  })

  it('returns Back to the position the visitor left a page at', () => {
    renderHook(() => useRouteHistory())
    const first = window.history.state
    setScrollY(500)
    window.dispatchEvent(new Event('scroll'))

    follow('#/activities')
    setScrollY(0)
    restoreScroll()
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0)

    goBack(first, '#/')
    restoreScroll()
    expect(scrollTo).toHaveBeenLastCalledWith(0, 500)
  })

  it('starts a page the visitor opens from a link at the top', () => {
    renderHook(() => useRouteHistory())
    setScrollY(800)
    window.dispatchEvent(new Event('scroll'))

    follow('#/run')
    restoreScroll()
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0)
  })

  it('forgets the scroll of the oldest pages once many have been left, so the memory stays bounded', () => {
    renderHook(() => useRouteHistory())
    const oldest = window.history.state
    setScrollY(120)
    window.dispatchEvent(new Event('scroll'))

    for (let page = 1; page <= 60; page += 1) {
      follow('#/run')
      setScrollY(page)
      window.dispatchEvent(new Event('scroll'))
    }
    const newest = window.history.state

    goBack(oldest, '#/')
    restoreScroll()
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0)

    goBack(newest, '#/run')
    restoreScroll()
    expect(scrollTo).toHaveBeenLastCalledWith(0, 60)
  })
})
