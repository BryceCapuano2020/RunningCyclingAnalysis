// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PERIOD_KEY,
  parsePeriodChoice,
  storedPeriodChoice,
  usePeriodChoice,
} from './periodPreference'

describe('parsePeriodChoice', () => {
  it('is the default when nothing is stored, or the stored value is not a period', () => {
    expect(parsePeriodChoice(null)).toBe('default')
    expect(parsePeriodChoice('not json')).toBe('default')
    expect(parsePeriodChoice(JSON.stringify(55))).toBe('default')
    expect(parsePeriodChoice(JSON.stringify({ choice: 42 }))).toBe('default')
  })

  it('reads back a period the athlete picked', () => {
    expect(parsePeriodChoice(JSON.stringify('all'))).toBe('all')
    expect(parsePeriodChoice(JSON.stringify(365))).toBe(365)
    expect(parsePeriodChoice(JSON.stringify('default'))).toBe('default')
  })

  it('falls back to the default for 3 months, which the control no longer offers', () => {
    expect(parsePeriodChoice(JSON.stringify(91))).toBe('default')
  })
})

describe('usePeriodChoice', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts from the period stored on this device, and keeps a new pick there', () => {
    localStorage.setItem(PERIOD_KEY, JSON.stringify(365))
    const { result } = renderHook(() => usePeriodChoice())
    expect(result.current[0]).toBe(365)

    act(() => {
      result.current[1]('all')
    })
    expect(result.current[0]).toBe('all')
    expect(JSON.parse(localStorage.getItem(PERIOD_KEY) ?? 'null')).toBe('all')
  })
})

describe('storedPeriodChoice', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('is the period stored on this device, and the default when there is none', () => {
    expect(storedPeriodChoice()).toBe('default')
    localStorage.setItem(PERIOD_KEY, JSON.stringify(42))
    expect(storedPeriodChoice()).toBe(42)
  })

  it('is the default when storage cannot be read', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      expect(storedPeriodChoice()).toBe('default')
    } finally {
      read.mockRestore()
    }
  })
})
