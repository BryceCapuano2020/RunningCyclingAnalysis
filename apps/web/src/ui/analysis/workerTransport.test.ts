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
  const onDropped = vi.fn()
  const setError = vi.fn()
  const hook = renderHook(() =>
    useWorkerTransport({ pendingRepliesRef, onSend, onDropped, setError }),
  )
  return { ...hook, pendingRepliesRef, setError, onDropped }
}

/** A worker that only records what it is sent. */
function fakeWorker() {
  return { postMessage: vi.fn() } as unknown as Worker & { postMessage: ReturnType<typeof vi.fn> }
}

describe('worker transport', () => {
  it('settles a detail read after the worker stops without replacing the library error', () => {
    const { result, setError } = setup()
    result.current.stoppedRef.current = true
    const settle = vi.fn()
    act(() => result.current.send({ type: 'activityTrace', id: 'run-1' }, undefined, settle))
    expect(settle).toHaveBeenCalledWith(null)
    expect(setError).not.toHaveBeenCalled()
  })

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

    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'routeShape',
      id: 'run-1',
      requestId: 1,
    })
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

  it('answers a period pick with null, and still says the worker has stopped, once the worker has stopped for good', () => {
    const { result, setError } = setup()
    result.current.stoppedRef.current = true
    const settle = vi.fn()

    act(() =>
      result.current.send({ type: 'setRange', choice: 42, settings: SETTINGS }, undefined, settle),
    )

    expect(settle).toHaveBeenCalledWith(null)
    expect(setError).toHaveBeenCalledWith(STOPPED)
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

const FILE = new File(['x'], 'run.fit')

function renderTransport() {
  const pendingRepliesRef = { current: [] as Pending[] }
  return renderHook(() =>
    useWorkerTransport({
      pendingRepliesRef,
      onSend: vi.fn(),
      onDropped: vi.fn(),
      setError: vi.fn(),
    }),
  )
}

describe('useWorkerTransport: dropping the analysis of files added while the account loads', () => {
  it('drops a provisional import that is still queued, and keeps the imports that were saved', () => {
    const { result } = renderTransport()
    act(() => {
      result.current.send({
        type: 'addFiles',
        files: [FILE],
        settings: SETTINGS,
        sync: null,
        provisional: true,
      })
    })
    act(() => {
      result.current.send({
        type: 'addFiles',
        files: [FILE],
        settings: SETTINGS,
        sync: null,
        saveToDevice: true,
      })
    })
    expect(result.current.unsentRef.current).toHaveLength(2)

    act(() => result.current.dropProvisional())

    expect(result.current.unsentRef.current).toEqual([
      expect.objectContaining({ request: expect.objectContaining({ saveToDevice: true }) }),
    ])
  })
})

describe('useWorkerTransport: an import already sent when the analysis is dropped', () => {
  it('is marked ignored, so its answer is not shown', () => {
    const pendingRepliesRef = { current: [] as Pending[] }
    const { result } = renderHook(() =>
      useWorkerTransport({
        pendingRepliesRef,
        onSend: vi.fn(),
        onDropped: vi.fn(),
        setError: vi.fn(),
      }),
    )
    const posted: unknown[] = []
    act(() => {
      result.current.workerRef.current = {
        postMessage: (message: unknown) => posted.push(message),
      } as unknown as Worker
    })
    act(() => {
      result.current.send({
        type: 'addFiles',
        files: [FILE],
        settings: SETTINGS,
        sync: null,
        provisional: true,
      })
    })
    expect(posted).toHaveLength(1)

    act(() => result.current.dropProvisional())

    expect(pendingRepliesRef.current).toEqual([
      expect.objectContaining({ kind: 'addFiles', ignored: true }),
    ])
  })
})
