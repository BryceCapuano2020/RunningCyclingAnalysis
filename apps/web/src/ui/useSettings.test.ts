// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPreferences, parsePreferences, usePreferences } from './useSettings'
import type { Preferences } from './useSettings'

const KEY = 'rca.preferences.v1'

const SAVED: Preferences = {
  settings: { massKg: 82.5, bikeMassKg: 11 },
  units: 'metric',
  birthYear: 1990,
  sex: 'female',
  setupDone: true,
}

describe('defaultPreferences', () => {
  it('assumes no body weight, so none is used until one is entered', () => {
    expect(defaultPreferences('en-US').settings).toEqual({ massKg: null, bikeMassKg: 9 })
  })

  it('takes the units from the browser language', () => {
    expect(defaultPreferences('en-US').units).toBe('imperial')
    expect(defaultPreferences('en-GB').units).toBe('metric')
  })
})

describe('parsePreferences', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(parsePreferences(null, 'en-US')).toEqual(defaultPreferences('en-US'))
    expect(parsePreferences('', 'en-US')).toEqual(defaultPreferences('en-US'))
  })

  it('returns the defaults for invalid JSON', () => {
    expect(parsePreferences('{not json', 'en-US')).toEqual(defaultPreferences('en-US'))
  })

  it('returns the defaults when the stored value is not an object', () => {
    const defaults = defaultPreferences('en-US')
    expect(parsePreferences('null', 'en-US')).toEqual(defaults)
    expect(parsePreferences('42', 'en-US')).toEqual(defaults)
    expect(parsePreferences('"metric"', 'en-US')).toEqual(defaults)
    expect(parsePreferences('true', 'en-US')).toEqual(defaults)
  })

  it('leaves the body weight unset when it is out of range', () => {
    const low = parsePreferences(
      JSON.stringify({ settings: { massKg: 29.9, bikeMassKg: 2.9 }, units: 'metric' }),
      'en-US',
    )
    expect(low.settings).toEqual({ massKg: null, bikeMassKg: 9 })

    const high = parsePreferences(
      JSON.stringify({ settings: { massKg: 200.1, bikeMassKg: 30.1 }, units: 'metric' }),
      'en-US',
    )
    expect(high.settings).toEqual({ massKg: null, bikeMassKg: 9 })
  })

  it('keeps each weight independently when only one is out of range', () => {
    const parsed = parsePreferences(
      JSON.stringify({ settings: { massKg: 500, bikeMassKg: 12 } }),
      'en-US',
    )
    expect(parsed.settings).toEqual({ massKg: null, bikeMassKg: 12 })
  })

  it('leaves the body weight unset when it is not a number, and the bike weight at its default', () => {
    const parsed = parsePreferences(
      JSON.stringify({ settings: { massKg: '80', bikeMassKg: null } }),
      'en-US',
    )
    expect(parsed.settings).toEqual({ massKg: null, bikeMassKg: 9 })
  })

  it('reads no body weight as unset, and keeps a body weight that was saved', () => {
    expect(parsePreferences(JSON.stringify({ settings: {} }), 'en-US').settings.massKg).toBeNull()
    expect(
      parsePreferences(JSON.stringify({ settings: { massKg: 80, bikeMassKg: 9 } }), 'en-US')
        .settings.massKg,
    ).toBe(80)
  })

  it('accepts weights at the limits', () => {
    const parsed = parsePreferences(
      JSON.stringify({ settings: { massKg: 30, bikeMassKg: 30 }, units: 'imperial' }),
      'en-US',
    )
    expect(parsed.settings).toEqual({ massKg: 30, bikeMassKg: 30 })
  })

  it('treats a stored 75 kg as unset until setup is answered, since 75 kg was the old silent default', () => {
    const parsed = parsePreferences(
      JSON.stringify({ settings: { massKg: 75, bikeMassKg: 9 }, setupDone: false }),
      'en-US',
    )
    expect(parsed.settings).toEqual({ massKg: null, bikeMassKg: 9 })
  })

  it('keeps a stored 75 kg once setup is answered, as a weight the athlete chose', () => {
    const parsed = parsePreferences(
      JSON.stringify({ settings: { massKg: 75, bikeMassKg: 9 }, setupDone: true }),
      'en-US',
    )
    expect(parsed.settings.massKg).toBe(75)
  })

  it('takes the browser units when the stored units are not recognised or missing', () => {
    const unknown = parsePreferences(
      JSON.stringify({ settings: SAVED.settings, units: 'furlongs' }),
      'en-GB',
    )
    expect(unknown.units).toBe('metric')
    const missing = parsePreferences(JSON.stringify({ settings: SAVED.settings }), 'en-LR')
    expect(missing.units).toBe('imperial')
  })

  it('round-trips valid preferences', () => {
    expect(parsePreferences(JSON.stringify(SAVED), 'en-US')).toEqual(SAVED)
  })

  it('round-trips a body weight that is not entered', () => {
    const unset: Preferences = { ...SAVED, settings: { massKg: null, bikeMassKg: 9 } }
    expect(parsePreferences(JSON.stringify(unset), 'en-US')).toEqual(unset)
  })

  it('reads preferences saved before the athlete fields and setup existed', () => {
    const parsed = parsePreferences(
      JSON.stringify({ settings: { massKg: 82.5, bikeMassKg: 11 }, units: 'metric' }),
      'en-US',
    )
    expect(parsed).toEqual({
      settings: { massKg: 82.5, bikeMassKg: 11 },
      units: 'metric',
      birthYear: null,
      sex: null,
      setupDone: false,
    })
  })

  it('keeps a plausible year of birth and drops any other', () => {
    const withYear = (birthYear: unknown) =>
      parsePreferences(JSON.stringify({ settings: SAVED.settings, birthYear }), 'en-US').birthYear

    expect(withYear(1990)).toBe(1990)
    expect(withYear(1800)).toBeNull()
    expect(withYear(2100)).toBeNull()
    expect(withYear(1990.5)).toBeNull()
    expect(withYear('1990')).toBeNull()
    expect(withYear(null)).toBeNull()
  })

  it('keeps a stored year from 1900 to this year on load, even when its age is not graded', () => {
    // Loading must not clear a year the athlete typed; the grades say when the age is out of range.
    const withYear = (birthYear: unknown) =>
      parsePreferences(JSON.stringify({ settings: SAVED.settings, birthYear }), 'en-US').birthYear
    const thisYear = new Date().getFullYear()

    expect(withYear(1900)).toBe(1900)
    expect(withYear(thisYear)).toBe(thisYear)
    expect(withYear(1899)).toBeNull()
    expect(withYear(thisYear + 1)).toBeNull()
  })

  it('keeps female or male, and reads anything else as not given', () => {
    const withSex = (sex: unknown) => parsePreferences(JSON.stringify({ sex }), 'en-US').sex

    expect(withSex('female')).toBe('female')
    expect(withSex('male')).toBe('male')
    expect(withSex('other')).toBeNull()
    expect(withSex(null)).toBeNull()
  })

  it('reads setup as done only when it is stored as true', () => {
    const setupDone = (value: unknown) =>
      parsePreferences(JSON.stringify({ setupDone: value }), 'en-US').setupDone
    expect(setupDone(true)).toBe(true)
    expect(setupDone('yes')).toBe(false)
    expect(setupDone(1)).toBe(false)
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
    expect(result.current[0]).toEqual(defaultPreferences())
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
