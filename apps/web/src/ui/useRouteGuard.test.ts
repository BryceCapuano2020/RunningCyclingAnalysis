// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { COLD_NOTICE, coldNoticeFor, needsResult, useRouteGuard } from './useRouteGuard'
import type { RouteGuardInput } from './useRouteGuard'

const cold = { hasResult: false, busy: false, restoring: false, settled: true }

describe('needsResult', () => {
  it('lets Balance, Profile and How sure is this? show without a result, and every other page needs one', () => {
    expect(needsResult({ page: 'balance' })).toBe(false)
    expect(needsResult({ page: 'profile' })).toBe(false)
    expect(needsResult({ page: 'method' })).toBe(false)
    expect(needsResult({ page: 'run' })).toBe(true)
    expect(needsResult({ page: 'activity', id: 'a' })).toBe(true)
  })
})

describe('coldNoticeFor', () => {
  it('says what a deep link needs, once the library has answered', () => {
    expect(coldNoticeFor({ route: { page: 'activity', id: 'a' }, ...cold })).toBe(COLD_NOTICE)
    expect(coldNoticeFor({ route: { page: 'run' }, ...cold })).toBe(COLD_NOTICE)
  })

  it('says nothing on Balance or Profile, which the landing page is for', () => {
    expect(coldNoticeFor({ route: { page: 'balance' }, ...cold })).toBeNull()
    expect(coldNoticeFor({ route: { page: 'profile' }, ...cold })).toBeNull()
  })

  it('says nothing while a result is on screen', () => {
    expect(coldNoticeFor({ route: { page: 'run' }, ...cold, hasResult: true })).toBeNull()
  })

  it('says nothing while an import is running, since the import reports its own progress', () => {
    expect(coldNoticeFor({ route: { page: 'run' }, ...cold, busy: true })).toBeNull()
  })

  it('waits until the account and library have answered, so a saved library is not called missing', () => {
    expect(coldNoticeFor({ route: { page: 'run' }, ...cold, settled: false })).toBeNull()
  })

  it('says nothing while a kept library is restoring, since the restore may bring the result', () => {
    expect(coldNoticeFor({ route: { page: 'run' }, ...cold, restoring: true })).toBeNull()
  })
})

describe('useRouteGuard on a deep link', () => {
  afterEach(() => {
    cleanup()
    window.location.hash = ''
  })

  const cold: RouteGuardInput = {
    route: { page: 'run' },
    hasResult: false,
    busy: false,
    waiting: false,
    libraryLoading: false,
    restoring: false,
    settled: true,
  }

  it('shows no notice while a kept library restores, nor once the restore brings a result', () => {
    const restoring: RouteGuardInput = { ...cold, restoring: true }
    const { result, rerender } = renderHook((input: RouteGuardInput) => useRouteGuard(input), {
      initialProps: restoring,
    })
    expect(result.current).toBeNull()
    rerender({ ...restoring, restoring: false, hasResult: true })
    expect(result.current).toBeNull()
  })

  it('shows the notice once a restore ends with no result to show', () => {
    const restoring: RouteGuardInput = { ...cold, restoring: true }
    const { result, rerender } = renderHook((input: RouteGuardInput) => useRouteGuard(input), {
      initialProps: restoring,
    })
    rerender({ ...restoring, restoring: false })
    expect(result.current).toBe(COLD_NOTICE)
  })

  it('keeps the deep link through a signed-in library load, which holds the page busy but is not an import', () => {
    window.location.hash = '#/run'
    const loading: RouteGuardInput = { ...cold, busy: true, libraryLoading: true, settled: false }
    const { rerender } = renderHook((input: RouteGuardInput) => useRouteGuard(input), {
      initialProps: loading,
    })
    rerender({ ...loading, busy: false, libraryLoading: false, hasResult: true, settled: true })
    expect(window.location.hash).toBe('#/run')
  })

  it('moves a visitor who imports from the deep link to Balance, the home page', async () => {
    window.location.hash = '#/run'
    const importing: RouteGuardInput = { ...cold, busy: true }
    const { rerender } = renderHook((input: RouteGuardInput) => useRouteGuard(input), {
      initialProps: importing,
    })
    rerender({ ...importing, busy: false, hasResult: true })
    await waitFor(() => expect(window.location.hash).toBe('#/'))
  })

  it('moves the visitor to Balance when an import queued behind a library load brings the result', async () => {
    window.location.hash = '#/run'
    const queued: RouteGuardInput = {
      ...cold,
      busy: true,
      waiting: true,
      libraryLoading: true,
      settled: false,
    }
    const { rerender } = renderHook((input: RouteGuardInput) => useRouteGuard(input), {
      initialProps: queued,
    })
    rerender({ ...queued, busy: false, waiting: false, libraryLoading: false, hasResult: true })
    await waitFor(() => expect(window.location.hash).toBe('#/'))
  })
})
