// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LibraryState } from './libraryState'
import type { WorkerTransport } from './workerTransport'
import { useLibraryActions } from './libraryActions'

function setup(status: 'loaded' | 'failed' | 'idle' = 'loaded', keepFiles?: boolean) {
  const send = vi.fn()
  const setLibrary = vi.fn()
  const library = {
    libraryStatusRef: { current: status },
    setLibrary,
    libraryWaitRef: { current: [] },
    savedActivitiesRef: { current: [] },
    setLibraryNotice: vi.fn(),
    setLibraryError: vi.fn(),
    readEndedRef: { current: () => undefined },
  } as unknown as LibraryState
  const hook = renderHook(() =>
    useLibraryActions({
      library,
      transport: {
        send,
        workerRef: { current: null },
        restartWorker: vi.fn(),
      } as unknown as WorkerTransport,
      refreshBusy: vi.fn(),
      accountRef: {
        current: {
          status: 'signed-in',
          me: keepFiles === undefined ? null : { profile: { keepFiles } },
        },
      } as never,
      settingsRef: { current: { massKg: 75, bikeMassKg: 9 } },
      setError: vi.fn(),
    }),
  )
  const loads = () => send.mock.calls.filter(([request]) => request.type === 'loadServer').length
  return { ...hook, library, send, setLibrary, loads }
}

describe('reading the library again', () => {
  it('leaves the status alone for a quiet read of a loaded library, and sets loading from any other', () => {
    const loaded = setup('loaded')
    act(() => loaded.result.current.loadLibrary('u1', true))
    expect(loaded.setLibrary).not.toHaveBeenCalled()
    expect(loaded.loads()).toBe(1)

    const failed = setup('failed')
    act(() => failed.result.current.loadLibrary('u1', true))
    expect(failed.setLibrary).toHaveBeenCalledWith('loading')
  })

  it('reads once at a time: a quiet read asked for while one runs waits and runs once after it', () => {
    const { result, library, loads } = setup('loaded')
    act(() => result.current.loadLibrary('u1', true))
    act(() => result.current.loadLibrary('u1', true))
    act(() => result.current.loadLibrary('u1', true))
    expect(loads()).toBe(1)
    act(() => library.readEndedRef.current())
    expect(loads()).toBe(2)
    act(() => library.readEndedRef.current())
    expect(loads()).toBe(2)
  })

  it('reads at once for a first read, whatever runs', () => {
    const { result, loads } = setup('loaded')
    act(() => result.current.loadLibrary('u1', true))
    act(() => result.current.loadLibrary('u2'))
    expect(loads()).toBe(2)
  })

  it('tells the worker whether the account keeps original files, so a refused original is not waited for when it never will be', () => {
    const off = setup('loaded', false)
    act(() => off.result.current.loadLibrary('u1'))
    expect(off.send).toHaveBeenCalledWith({ type: 'loadServer', userId: 'u1', keepFiles: false })
    const on = setup('loaded', true)
    act(() => on.result.current.loadLibrary('u1'))
    expect(on.send).toHaveBeenCalledWith({ type: 'loadServer', userId: 'u1' })
    const unknown = setup('loaded')
    act(() => unknown.result.current.loadLibrary('u1'))
    expect(unknown.send).toHaveBeenCalledWith({ type: 'loadServer', userId: 'u1' })
  })
})
