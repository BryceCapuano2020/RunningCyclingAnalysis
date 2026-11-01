// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from '../api/apiError'
import type { SetupOptions } from './useSetup'
import { useSetup } from './useSetup'

const OFFLINE = new ApiRequestError(0, 'network_error', 'Could not reach the server')

function renderSignedIn() {
  const addFiles = vi.fn<(files: File[]) => void>()
  const save = vi.fn<SetupOptions['save']>(async () => undefined)
  const view = renderHook(() =>
    useSetup({
      status: 'signed-in',
      preferencesDone: false,
      workerStopped: false,
      addFiles,
      save,
    }),
  )
  return { ...view, addFiles, save }
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('useSetup, signed in and offline', () => {
  it('says why nothing happened when the connection is lost', async () => {
    const { result, save, addFiles } = renderSignedIn()
    save.mockRejectedValueOnce(OFFLINE)
    act(() => result.current.requestImport([new File(['x'], 'a.fit')]))

    await act(() => result.current.finish({ birthYear: 1990 }))

    expect(result.current.saveError).toMatch(/connection dropped/)
    expect(result.current.saveError).toMatch(/when it returns/)
    expect(addFiles).not.toHaveBeenCalled()
  })

  it('runs the press again by itself when the connection returns, so it is not dropped', async () => {
    const { result, save, addFiles } = renderSignedIn()
    save.mockRejectedValueOnce(OFFLINE)
    act(() => result.current.requestImport([new File(['x'], 'a.fit')]))
    await act(() => result.current.finish({ birthYear: 1990 }))
    expect(save).toHaveBeenCalledTimes(1)

    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })

    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith({ birthYear: 1990, setupDone: true })
    expect(addFiles).toHaveBeenCalledTimes(1)
    expect(result.current.saveError).toBeNull()
  })

  it('does not run a press that was answered another way: a Skip after the failure', async () => {
    const { result, save } = renderSignedIn()
    save.mockRejectedValueOnce(OFFLINE)
    act(() => result.current.requestImport([new File(['x'], 'a.fit')]))
    await act(() => result.current.finish({ birthYear: 1990 }))
    await act(() => result.current.skip({}))
    const calls = save.mock.calls.length

    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })

    expect(save).toHaveBeenCalledTimes(calls)
  })

  it('keeps a refusal that is not a lost connection as it was', async () => {
    const { result, save } = renderSignedIn()
    save.mockRejectedValueOnce(new Error('Could not save your profile.'))
    act(() => result.current.requestImport([new File(['x'], 'a.fit')]))
    await act(() => result.current.finish({ birthYear: 1990 }))
    expect(result.current.saveError).toBe('Could not save your profile.')

    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })
    expect(save).toHaveBeenCalledTimes(1)
  })
})
