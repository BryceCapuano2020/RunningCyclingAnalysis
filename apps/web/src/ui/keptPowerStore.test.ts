// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { parseKeptPower, useKeptPower } from './keptPowerStore'

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
})
