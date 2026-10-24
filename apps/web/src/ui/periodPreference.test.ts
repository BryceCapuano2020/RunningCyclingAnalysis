// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { PERIOD_KEY, parsePeriodChoice, usePeriodChoice } from './periodPreference'

describe('parsePeriodChoice', () => {
  it('is the default when nothing is stored, or the stored value is not a period', () => {
    expect(parsePeriodChoice(null)).toBe('default')
    expect(parsePeriodChoice('not json')).toBe('default')
    expect(parsePeriodChoice(JSON.stringify(55))).toBe('default')
    expect(parsePeriodChoice(JSON.stringify({ choice: 42 }))).toBe('default')
  })

  it('reads back a period the athlete picked', () => {
    expect(parsePeriodChoice(JSON.stringify('all'))).toBe('all')
    expect(parsePeriodChoice(JSON.stringify(91))).toBe(91)
    expect(parsePeriodChoice(JSON.stringify('default'))).toBe('default')
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
