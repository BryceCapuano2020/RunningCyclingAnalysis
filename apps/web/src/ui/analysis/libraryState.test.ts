// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useLibraryState } from './libraryState'

beforeEach(() => {
  window.history.replaceState(null, '', '#/activities')
})

afterEach(() => {
  cleanup()
})

describe('useLibraryState: the notice of a removal', () => {
  it('clears the notice and the error when the visitor moves to another page', async () => {
    const { result } = renderHook(() => useLibraryState())
    act(() => {
      result.current.setLibraryNotice('Deleted New run.')
      result.current.setLibraryError('Could not delete.')
    })
    window.location.hash = '#/profile'
    await waitFor(() => expect(result.current.libraryNotice).toBeNull())
    expect(result.current.libraryError).toBeNull()
  })

  it('keeps the notice when the move is to the list with a removal marker, for the list to announce', async () => {
    const { result } = renderHook(() => useLibraryState())
    act(() => result.current.setLibraryNotice('Deleted New run.'))
    window.location.hash = '#/activities?removed=1'
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current.libraryNotice).toBe('Deleted New run.')
  })

  it('keeps the notice when the list drops the marker from its own address, since no page may be left to say it', async () => {
    window.history.replaceState(null, '', '#/activities?removed=1')
    const { result } = renderHook(() => useLibraryState())
    act(() => result.current.setLibraryNotice('Deleted New run.'))
    // The list reads the marker and rewrites its address without it; the results may be gone by then (the last activity), and
    // then only the notice above the page says how the removal ended.
    window.location.hash = '#/activities'
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current.libraryNotice).toBe('Deleted New run.')
  })

  it('keeps the notice when only the list address is seen after an activity page, as a browser under load delivers it', async () => {
    window.history.replaceState(null, '', '#/activities/a1')
    const { result } = renderHook(() => useLibraryState())
    act(() => result.current.setLibraryNotice('Deleted New run.'))
    // The marked address came and went before its event ran: the one event says the list, without the marker.
    window.location.hash = '#/activities'
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current.libraryNotice).toBe('Deleted New run.')
  })
})
