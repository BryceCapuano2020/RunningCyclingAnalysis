// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearKeptPower, parseKeptPower, useKeptPower } from './keptPowerStore'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('parseKeptPower', () => {
  it('reads a list of ids, sorted and without repeats', () => {
    expect(parseKeptPower('["b","a","b"]')).toEqual(['a', 'b'])
  })

  it('reads anything else as none', () => {
    for (const raw of [null, '', 'nope', '{"a":1}', '[1,2]', '[]']) {
      expect(parseKeptPower(raw)).toEqual([])
    }
  })
})

describe('useKeptPower', () => {
  it('keeps and releases a ride, in this browser, and keeps the same list until a choice changes', () => {
    const { result } = renderHook(() => useKeptPower())
    const first = result.current.ids
    expect(first).toEqual([])
    act(() => result.current.keep('ride-1'))
    expect(result.current.ids).toEqual(['ride-1'])
    expect(JSON.parse(localStorage.getItem('rca.keepPower.v1') ?? 'null')).toEqual(['ride-1'])
    const kept = result.current.ids
    act(() => result.current.keep('ride-1'))
    expect(result.current.ids).toBe(kept)
    act(() => result.current.release('ride-1'))
    expect(result.current.ids).toEqual([])
    expect(JSON.parse(localStorage.getItem('rca.keepPower.v1') ?? 'null')).toEqual([])
  })

  it('clears every kept ride, and tells the readers', () => {
    const { result } = renderHook(() => useKeptPower())
    act(() => result.current.keep('ride-1'))
    act(() => clearKeptPower())
    expect(result.current.ids).toEqual([])
    expect(localStorage.getItem('rca.keepPower.v1')).toBeNull()
  })

  it('keeps a choice for the visit when the browser refuses to store it', () => {
    const { result } = renderHook(() => useKeptPower())
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    act(() => result.current.keep('ride-1'))
    expect(result.current.ids).toEqual(['ride-1'])
    set.mockRestore()
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    act(() => clearKeptPower())
    expect(result.current.ids).toEqual([])
    remove.mockRestore()
  })

  it('follows another tab’s change, and the whole storage being cleared', () => {
    const { result } = renderHook(() => useKeptPower())
    localStorage.setItem('rca.keepPower.v1', '["from-tab"]')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'rca.keepPower.v1' }))
    })
    expect(result.current.ids).toEqual(['from-tab'])
    // Another key changing is not this list's business.
    localStorage.setItem('rca.keepPower.v1', '["changed-quietly"]')
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'other' }))
    })
    expect(result.current.ids).toEqual(['from-tab'])
    // A null key is every key gone.
    localStorage.clear()
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }))
    })
    expect(result.current.ids).toEqual([])
  })

  it('keeps at most 500 rides', () => {
    const { result } = renderHook(() => useKeptPower())
    act(() => {
      for (let i = 0; i < 520; i++) result.current.keep(`ride-${String(i).padStart(4, '0')}`)
    })
    expect(result.current.ids).toHaveLength(500)
    expect(
      parseKeptPower(JSON.stringify(Array.from({ length: 600 }, (_, i) => `id-${i}`))),
    ).toHaveLength(500)
  })
})
