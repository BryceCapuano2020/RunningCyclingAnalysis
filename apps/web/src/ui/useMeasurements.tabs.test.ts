// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Measurement } from '@rca/core/athlete'
import { MEASUREMENTS_KEY } from './measurementStore'
import { useMeasurements } from './useMeasurements'

const MASS_A: Measurement = { kind: 'massKg', value: 70, from: '2026-01-01' }
const MASS_B: Measurement = { kind: 'massKg', value: 71, from: '2026-02-01' }
const MASS_C: Measurement = { kind: 'massKg', value: 72, from: '2026-03-01' }

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
