// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PREFERENCES, parsePreferences, usePreferences } from './useSettings'
import type { Preferences } from './useSettings'

const KEY = 'rca.preferences.v1'

const SAVED: Preferences = {
  settings: { massKg: 82.5, bikeMassKg: 11 },
  units: 'metric',
}

describe('parsePreferences', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences('')).toEqual(DEFAULT_PREFERENCES)
  })

  it('returns the defaults for invalid JSON', () => {
    expect(parsePreferences('{not json')).toEqual(DEFAULT_PREFERENCES)
  })

  it('returns the defaults when the stored value is not an object', () => {
    expect(parsePreferences('null')).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences('42')).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences('"metric"')).toEqual(DEFAULT_PREFERENCES)
    expect(parsePreferences('true')).toEqual(DEFAULT_PREFERENCES)
  })

  it('falls back to the default weight when a weight is out of range', () => {
    const low = parsePreferences(
      JSON.stringify({ settings: { massKg: 29.9, bikeMassKg: 2.9 }, units: 'metric' }),
    )
    expect(low.settings).toEqual(DEFAULT_PREFERENCES.settings)

    const high = parsePreferences(
      JSON.stringify({ settings: { massKg: 200.1, bikeMassKg: 30.1 }, units: 'metric' }),
    )
    expect(high.settings).toEqual(DEFAULT_PREFERENCES.settings)
  })

  it('keeps each weight independently when only one is out of range', () => {
    const parsed = parsePreferences(JSON.stringify({ settings: { massKg: 500, bikeMassKg: 12 } }))
    expect(parsed.settings).toEqual({
      massKg: DEFAULT_PREFERENCES.settings.massKg,
      bikeMassKg: 12,
    })
  })

  it('falls back to the default weight when a weight is not a number', () => {
    const parsed = parsePreferences(
      JSON.stringify({ settings: { massKg: '80', bikeMassKg: null } }),
    )
    expect(parsed.settings).toEqual(DEFAULT_PREFERENCES.settings)
  })

  it('accepts weights at the limits', () => {
    const parsed = parsePreferences(
      JSON.stringify({ settings: { massKg: 30, bikeMassKg: 30 }, units: 'imperial' }),
    )
    expect(parsed.settings).toEqual({ massKg: 30, bikeMassKg: 30 })
  })

  it('falls back to imperial when the units are not recognised', () => {
    const parsed = parsePreferences(JSON.stringify({ settings: SAVED.settings, units: 'furlongs' }))
    expect(parsed.units).toBe('imperial')
    expect(parsePreferences(JSON.stringify({ settings: SAVED.settings })).units).toBe('imperial')
  })

  it('round-trips valid preferences', () => {
    expect(parsePreferences(JSON.stringify(SAVED))).toEqual(SAVED)
  })
})

describe('usePreferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the saved preferences from localStorage', () => {
    localStorage.setItem(KEY, JSON.stringify(SAVED))
    const { result } = renderHook(() => usePreferences())
    expect(result.current[0]).toEqual(SAVED)
  })

  it('starts from the defaults when nothing is saved', () => {
    const { result } = renderHook(() => usePreferences())
    expect(result.current[0]).toEqual(DEFAULT_PREFERENCES)
  })

  it('saves each change to localStorage', () => {
    const { result } = renderHook(() => usePreferences())
    act(() => {
      result.current[1](SAVED)
    })

    expect(result.current[0]).toEqual(SAVED)
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual(SAVED)
  })

  it('keeps working for the session when localStorage refuses to save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded', 'QuotaExceededError')
    })
    const { result } = renderHook(() => usePreferences())
    act(() => {
      result.current[1](SAVED)
    })

    expect(result.current[0]).toEqual(SAVED)
  })
})
