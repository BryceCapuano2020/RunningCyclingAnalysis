// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Measurement } from '@rca/core/athlete'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('../api/measurements', () => ({
  listMeasurements: api.list,
  putMeasurement: api.put,
  deleteMeasurement: api.remove,
}))

import { useMeasurements } from './useMeasurements'

const MASS_A: Measurement = { kind: 'massKg', value: 70, from: '2026-01-01' }
const MASS_B: Measurement = { kind: 'massKg', value: 71, from: '2026-02-01' }
const MASS_C: Measurement = { kind: 'massKg', value: 72, from: '2026-03-01' }

/** A request the test settles by hand, so writes can overlap. */
function pending() {
  let finish!: () => void
  let fail!: (error: Error) => void
  const promise = new Promise<void>((resolve, reject) => {
    finish = resolve
    fail = reject
  })
  return { promise, finish, fail }
}

async function signedIn(initial: Measurement[] = []) {
  api.list.mockResolvedValue(initial)
  const hook = renderHook(() => useMeasurements('signed-in', 'user-1'))
  await waitFor(() => expect(hook.result.current.state).toBe('ready'))
  return hook
}

beforeEach(() => {
  api.list.mockReset()
  api.put.mockReset()
  api.remove.mockReset()
  window.localStorage.clear()
})

describe('useMeasurements overlapping writes', () => {
  it('keeps both settings when two are added before the first is stored', async () => {
    const { result } = await signedIn()
    const first = pending()
    api.put.mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined)

    let both!: Promise<unknown>
    act(() => {
      both = Promise.all([result.current.add(MASS_A), result.current.add(MASS_B)])
    })
    await act(async () => {
      first.finish()
      await both
    })

    expect(result.current.entries).toEqual([MASS_A, MASS_B])
    expect(api.put).toHaveBeenCalledTimes(2)
  })

  it('does not bring back a row that was removed while another was being added', async () => {
    const { result } = await signedIn([MASS_A])
    const adding = pending()
    api.put.mockReturnValueOnce(adding.promise)
    api.remove.mockResolvedValueOnce(undefined)

    let both!: Promise<unknown>
    act(() => {
      both = Promise.all([result.current.add(MASS_B), result.current.remove(MASS_A)])
    })
    await act(async () => {
      adding.finish()
      await both
    })

    expect(result.current.entries).toEqual([MASS_B])
  })

  it('lets later writes go ahead when an earlier one is refused', async () => {
    const { result } = await signedIn()
    const refused = pending()
    api.put.mockReturnValueOnce(refused.promise).mockResolvedValueOnce(undefined)

    let first!: Promise<unknown>
    let second!: Promise<unknown>
    act(() => {
      first = result.current.add(MASS_A).catch((error: Error) => error.message)
      second = result.current.add(MASS_C)
    })
    await act(async () => {
      refused.fail(new Error('refused'))
      await Promise.all([first, second])
    })

    await expect(first).resolves.toBe('refused')
    expect(result.current.entries).toEqual([MASS_C])
  })

  it('keeps both settings added together while signed out', async () => {
    const { result } = renderHook(() => useMeasurements('signed-out', null))
    await act(async () => {
      await Promise.all([result.current.add(MASS_A), result.current.add(MASS_B)])
    })
    expect(result.current.entries).toEqual([MASS_A, MASS_B])
  })
})
