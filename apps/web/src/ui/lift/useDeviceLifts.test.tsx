// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openLiftStore } from '../../worker/liftStore'
import { fakeTransport, make } from '../../worker/liftTestKit'
import type { AdoptionOutcome } from '../analysis/model'
import { useAddWithLifts, useDeviceLifts } from './useDeviceLifts'

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
})

const OUTCOME: AdoptionOutcome = { saved: 1, conflicts: 0, failed: 0, again: 0, held: 0 }

describe('the lifting sets kept on the device', () => {
  it('counts them for a signed-in account, and adds them with insertOnly', async () => {
    const device = openLiftStore('device')
    await device.save(make(1))
    await device.save(make(2))
    const fake = fakeTransport({ put: () => ({ liftRevision: 3, skipped: [] }) })
    const view = renderHook(() => useDeviceLifts('u1', () => fake.transport))
    await waitFor(() => expect(view.result.current.count).toBe(2))

    await act(async () => void (await view.result.current.adopt()))

    expect(fake.calls).toEqual([{ type: 'put', orders: [1, 2], insertOnly: true }])
    expect(view.result.current.count).toBe(0)
    expect(view.result.current.result).toMatchObject({ sent: 2, skipped: 0 })
  })

  it('reads nothing signed out', async () => {
    await openLiftStore('device').save(make(1))
    const view = renderHook(() => useDeviceLifts(undefined))
    await act(async () => undefined)
    expect(view.result.current.count).toBe(0)
  })

  it('removes them from this browser', async () => {
    await openLiftStore('device').save(make(1))
    const view = renderHook(() => useDeviceLifts('u1'))
    await waitFor(() => expect(view.result.current.count).toBe(1))
    await act(async () => void (await view.result.current.forget()))
    expect(await openLiftStore('device').list()).toEqual([])
  })
})

describe('adding with the activities', () => {
  const setup = (adoption: AdoptionOutcome | null) => {
    const lifts = { adopt: vi.fn(async () => null) } as unknown as Parameters<
      typeof useAddWithLifts
    >[0]
    const addActivities = vi.fn()
    const view = renderHook(
      (props: { adoption: AdoptionOutcome | null }) =>
        useAddWithLifts(lifts, props.adoption, addActivities),
      { initialProps: { adoption } },
    )
    return { lifts, addActivities, view }
  }

  it('adds the sets only after the activities adoption reports', async () => {
    const { lifts, addActivities, view } = setup(null)
    act(() => view.result.current(true))
    expect(addActivities).toHaveBeenCalledOnce()
    expect(lifts.adopt).not.toHaveBeenCalled()

    view.rerender({ adoption: OUTCOME })
    await waitFor(() => expect(lifts.adopt).toHaveBeenCalledOnce())
  })

  it('adds the sets at once when no activity is being added', () => {
    const { lifts, addActivities, view } = setup(null)
    act(() => view.result.current(false))
    expect(addActivities).not.toHaveBeenCalled()
    expect(lifts.adopt).toHaveBeenCalledOnce()
  })
})
