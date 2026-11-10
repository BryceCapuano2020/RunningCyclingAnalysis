// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openLiftStore } from '../../worker/liftStore'
import { fakeTransport, make } from '../../worker/liftTestKit'
import { LiftTransportError } from '../../worker/liftTransport'
import { useDeviceLifts } from './useDeviceLifts'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})

const account = () => ({ refresh: vi.fn(async () => null), markExpired: vi.fn() })

describe('the lifting sets kept on the device', () => {
  it('is not counted until read, and makes no database to count', async () => {
    const view = renderHook(() => useDeviceLifts('u1', account()))
    expect(view.result.current.count).toBeNull()
    await waitFor(() => expect(view.result.current.count).toBe(0))
    expect(await indexedDB.databases()).toEqual([])
  })

  it('adds them with insertOnly, reports the total, and reads the account again', async () => {
    const device = openLiftStore('device')
    await device.save(make(1))
    await device.save(make(2))
    const fake = fakeTransport({ put: () => ({ liftRevision: 3, skipped: [] }) })
    const mine = account()
    const view = renderHook(() => useDeviceLifts('u1', mine, () => fake.transport))
    await waitFor(() => expect(view.result.current.count).toBe(2))

    await act(async () => void (await view.result.current.adopt()))

    expect(fake.calls).toEqual([{ type: 'put', orders: [1, 2], insertOnly: true }])
    expect(view.result.current.count).toBe(0)
    expect(view.result.current.result).toMatchObject({ sent: 2, skipped: 0, total: 2 })
    expect(mine.refresh).toHaveBeenCalledOnce()
    expect(view.result.current.adopting).toBe(false)

    act(() => view.result.current.dismissResult())
    expect(view.result.current.result).toBeNull()
  })

  it('ends the session on a 401, and ignores a second press while it runs', async () => {
    await openLiftStore('device').save(make(1))
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fake = fakeTransport({
      put: () => new LiftTransportError('unauthorized'),
      gate: () => gate,
    })
    const mine = account()
    const view = renderHook(() => useDeviceLifts('u1', mine, () => fake.transport))
    await waitFor(() => expect(view.result.current.count).toBe(1))
    act(() => void view.result.current.adopt())
    await waitFor(() => expect(view.result.current.adopting).toBe(true))
    await act(async () => void (await view.result.current.adopt()))
    release()
    await waitFor(() => expect(mine.markExpired).toHaveBeenCalledOnce())
    expect(fake.calls.filter((c) => c.type === 'put')).toHaveLength(1)
    expect(await openLiftStore('device').list()).toHaveLength(1)
  })

  it('reads nothing signed out', async () => {
    await openLiftStore('device').save(make(1))
    const view = renderHook(() => useDeviceLifts(undefined, account()))
    await act(async () => undefined)
    expect(view.result.current.count).toBeNull()
  })

  it('removes them from this browser', async () => {
    await openLiftStore('device').save(make(1))
    const view = renderHook(() => useDeviceLifts('u1', account()))
    await waitFor(() => expect(view.result.current.count).toBe(1))
    await act(async () => void (await view.result.current.forget()))
    expect(await openLiftStore('device').list()).toEqual([])
  })
})
