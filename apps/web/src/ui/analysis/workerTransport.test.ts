// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WorkerRequest } from '../../worker/protocol'
import { STOPPED } from './copy'
import type { Pending } from './model'
import { useWorkerTransport } from './workerTransport'

const SETTINGS = { massKg: 75, bikeMassKg: 9 }

function setup() {
  const pendingRepliesRef = { current: [] as Pending[] }
  const onSend = vi.fn()
  const setError = vi.fn()
  const hook = renderHook(() => useWorkerTransport({ pendingRepliesRef, onSend, setError }))
  return { ...hook, pendingRepliesRef, setError }
}

/** A worker that only records what it is sent. */
function fakeWorker() {
  return { postMessage: vi.fn() } as unknown as Worker & { postMessage: ReturnType<typeof vi.fn> }
}

describe('worker transport', () => {
  it('keeps a route request made while there is no worker, with its settle, and sends both when a worker starts', () => {
    const { result, pendingRepliesRef } = setup()
    const settle = vi.fn()
    act(() => result.current.send({ type: 'routeShape', id: 'run-1' }, undefined, settle))
    expect(settle).not.toHaveBeenCalled()

    const worker = fakeWorker()
    act(() => {
      result.current.workerRef.current = worker
      result.current.flushUnsent()
    })

    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'routeShape', id: 'run-1' })
    expect(pendingRepliesRef.current[0]?.settle).toBe(settle)
  })

  it('answers a route request left waiting for a worker as unread when the wait is dropped', () => {
    const { result } = setup()
    const settle = vi.fn()
    act(() => result.current.send({ type: 'routeShape', id: 'run-1' }, undefined, settle))

    act(() => result.current.dropUnsent())

    expect(settle).toHaveBeenCalledWith(null)
  })

  it('answers a route request as unread, with no error, once the worker has stopped for good', () => {
    const { result, setError } = setup()
    result.current.stoppedRef.current = true
    const settle = vi.fn()

    act(() => result.current.send({ type: 'routeShape', id: 'run-1' }, undefined, settle))

    expect(settle).toHaveBeenCalledWith(null)
    expect(setError).not.toHaveBeenCalled()
  })

  it('still tells the user to act again when an import is made after the worker has stopped', () => {
    const { result, setError } = setup()
    result.current.stoppedRef.current = true
    const request: WorkerRequest = {
      type: 'addFiles',
      files: [],
      settings: SETTINGS,
      sync: null,
    }

    act(() => result.current.send(request))

    expect(setError).toHaveBeenCalledWith(STOPPED)
  })

  it('drops a request to forget the routes quietly once the worker has stopped', () => {
    const { result, setError } = setup()
    result.current.stoppedRef.current = true

    act(() => result.current.send({ type: 'forgetRoutes' }))

    expect(setError).not.toHaveBeenCalled()
  })
})
