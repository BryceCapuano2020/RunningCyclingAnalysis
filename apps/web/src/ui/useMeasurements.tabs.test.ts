// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Measurement } from '@rca/core/athlete'
import { FakeBroadcastChannel } from '../test/fakeBroadcastChannel'
import * as client from '../api/measurements'
import { MEASUREMENTS_KEY } from './measurementStore'
import { resetTabSync } from './tabSync'
import { useMeasurements } from './useMeasurements'

const MASS_A: Measurement = { kind: 'massKg', value: 70, from: '2026-01-01' }
const MASS_B: Measurement = { kind: 'massKg', value: 71, from: '2026-02-01' }
const MASS_C: Measurement = { kind: 'massKg', value: 72, from: '2026-03-01' }

vi.mock('../api/measurements', () => ({
  listMeasurements: vi.fn(),
  putMeasurement: vi.fn(),
  deleteMeasurement: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
})

describe('dated settings kept in this browser, across tabs', () => {
  it('adds to the list as it stands now, so a stale tab does not write over another tab’s entry', async () => {
    const { result } = renderHook(() => useMeasurements('signed-out', null))
    await act(async () => {
      await result.current.add(MASS_A)
    })
    // Another tab adds an entry this tab has not heard of.
    localStorage.setItem(MEASUREMENTS_KEY, JSON.stringify([MASS_A, MASS_B]))

    await act(async () => {
      await result.current.add(MASS_C)
    })

    const stored = JSON.parse(localStorage.getItem(MEASUREMENTS_KEY) ?? '[]') as Measurement[]
    expect(stored).toEqual([MASS_A, MASS_B, MASS_C])
    expect(result.current.entries).toEqual([MASS_A, MASS_B, MASS_C])
  })

  it('takes up a list another tab stored, as the browser reports it', () => {
    const { result } = renderHook(() => useMeasurements('signed-out', null))

    act(() => {
      localStorage.setItem(MEASUREMENTS_KEY, JSON.stringify([MASS_B]))
      window.dispatchEvent(new StorageEvent('storage', { key: MEASUREMENTS_KEY }))
    })

    expect(result.current.entries).toEqual([MASS_B])
  })

  it('removes from the list as it stands now', async () => {
    localStorage.setItem(MEASUREMENTS_KEY, JSON.stringify([MASS_A]))
    const { result } = renderHook(() => useMeasurements('signed-out', null))
    localStorage.setItem(MEASUREMENTS_KEY, JSON.stringify([MASS_A, MASS_B]))

    await act(async () => {
      await result.current.remove(MASS_A)
    })

    expect(JSON.parse(localStorage.getItem(MEASUREMENTS_KEY) ?? '[]')).toEqual([MASS_B])
  })
})

describe('the account’s dated settings, across tabs', () => {
  let otherTab: FakeBroadcastChannel
  let heard: unknown[]

  beforeEach(() => {
    FakeBroadcastChannel.reset()
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    resetTabSync()
    otherTab = FakeBroadcastChannel.other('rca-sync-v1')
    heard = []
    otherTab.onmessage = (event) => heard.push(event.data)
    vi.mocked(client.listMeasurements).mockReset().mockResolvedValue([MASS_A])
    vi.mocked(client.putMeasurement)
      .mockReset()
      .mockResolvedValue(undefined as never)
  })

  afterEach(() => {
    resetTabSync()
    vi.unstubAllGlobals()
  })

  it('tells the other tabs after it saves one', async () => {
    const { result } = renderHook(() => useMeasurements('signed-in', 'u1'))
    await vi.waitFor(() => expect(result.current.state).toBe('ready'))

    await act(async () => {
      await result.current.add(MASS_B)
    })

    expect(heard).toContainEqual({ type: 'measurements' })
  })

  it('reads the list again when another tab changed it', async () => {
    const { result } = renderHook(() => useMeasurements('signed-in', 'u1'))
    await vi.waitFor(() => expect(result.current.entries).toEqual([MASS_A]))
    vi.mocked(client.listMeasurements).mockResolvedValue([MASS_A, MASS_B])

    act(() => otherTab.postMessage({ type: 'measurements' }))

    await vi.waitFor(() => expect(result.current.entries).toEqual([MASS_A, MASS_B]))
  })

  it('keeps the list it shows when that second read fails', async () => {
    const { result } = renderHook(() => useMeasurements('signed-in', 'u1'))
    await vi.waitFor(() => expect(result.current.entries).toEqual([MASS_A]))
    vi.mocked(client.listMeasurements).mockRejectedValue(new Error('offline'))

    act(() => otherTab.postMessage({ type: 'measurements' }))
    await act(async () => undefined)

    expect(result.current.entries).toEqual([MASS_A])
    expect(result.current.state).toBe('ready')
  })
})
