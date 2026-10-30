import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_BIKE_MASS_KG, unitsForLocale } from '@rca/contract'
import type { Sex } from '@rca/contract'
import type { UnitSystem } from '@rca/core/units'
import { PLACEHOLDER_BODY_KG, isPlausibleBirthYear, weightWithinLimits } from './athlete'
import type { WeightSettings } from './athlete'

export interface Preferences {
  settings: WeightSettings
  units: UnitSystem
  birthYear: number | null
  sex: Sex | null
  /** The first-analysis setup was answered on this device. */
  setupDone: boolean
}

/**
 * What a device starts with: no body weight, so none is assumed, and the units the browser's
 * language uses. The language is a parameter so the choice can be tested without the browser.
 */
export function defaultPreferences(language: string | undefined = browserLanguage()): Preferences {
  return {
    settings: { massKg: null, bikeMassKg: DEFAULT_BIKE_MASS_KG },
    units: unitsForLocale(language),
    birthYear: null,
    sex: null,
    setupDone: false,
  }
}

function browserLanguage(): string | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.language
}

const KEY = 'rca.preferences.v1'

/**
 * Stored preferences from before a field existed read as that field's default. An out-of-range
 * body weight reads as no weight, not as a number the athlete never entered. So does the 75 kg that
 * was filled in before setup was answered, since the athlete never chose it.
 */
export function parsePreferences(
  raw: string | null,
  language: string | undefined = browserLanguage(),
): Preferences {
  const defaults = defaultPreferences(language)
  if (!raw) return defaults
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return defaults
    const { settings, units, birthYear, sex, setupDone } = value as {
      settings?: { massKg?: unknown; bikeMassKg?: unknown }
      units?: unknown
      birthYear?: unknown
      sex?: unknown
      setupDone?: unknown
    }
    const massKg = settings?.massKg
    const bikeMassKg = settings?.bikeMassKg
    const answered = setupDone === true
    const enteredMass =
      typeof massKg === 'number' &&
      weightWithinLimits(massKg, 'body') &&
      !(massKg === PLACEHOLDER_BODY_KG && !answered)
    return {
      settings: {
        massKg: enteredMass ? massKg : null,
        bikeMassKg:
          typeof bikeMassKg === 'number' && weightWithinLimits(bikeMassKg, 'bike')
            ? bikeMassKg
            : defaults.settings.bikeMassKg,
      },
      units: units === 'metric' || units === 'imperial' ? units : defaults.units,
      birthYear: isPlausibleBirthYear(birthYear) ? birthYear : null,
      sex: sex === 'female' || sex === 'male' ? sex : null,
      setupDone: answered,
    }
  } catch {
    return defaults
  }
}

function load(): Preferences {
  try {
    return parsePreferences(localStorage.getItem(KEY))
  } catch {
    return defaultPreferences()
  }
}

/** The preferences in storage, or null when the browser will not say. */
function loadStored(): Preferences | null {
  try {
    return parsePreferences(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

/**
 * Applies to `base` only the fields where `next` differs from `before`. A tab that changed one field
 * writes that field, not the whole set, so a tab that is out of date cannot put back a value another
 * tab changed meanwhile.
 */
export function applyChanges(
  base: Preferences,
  before: Preferences,
  next: Preferences,
): Preferences {
  const changed = <T>(a: T, b: T) => a !== b
  return {
    settings: {
      massKg: changed(before.settings.massKg, next.settings.massKg)
        ? next.settings.massKg
        : base.settings.massKg,
      bikeMassKg: changed(before.settings.bikeMassKg, next.settings.bikeMassKg)
        ? next.settings.bikeMassKg
        : base.settings.bikeMassKg,
    },
    units: changed(before.units, next.units) ? next.units : base.units,
    birthYear: changed(before.birthYear, next.birthYear) ? next.birthYear : base.birthYear,
    sex: changed(before.sex, next.sex) ? next.sex : base.sex,
    setupDone: changed(before.setupDone, next.setupDone) ? next.setupDone : base.setupDone,
  }
}

/**
 * The preferences kept in this browser. A change is written field by field over what is stored now, and
 * a change another tab makes (the browser's storage event) is taken up as it happens.
 */
export function usePreferences(): [Preferences, (next: Preferences) => void] {
  const [preferences, setPreferences] = useState(load)
  // What this tab last showed, to tell which fields a change touches.
  const shown = useRef(preferences)
  useEffect(() => {
    shown.current = preferences
  }, [preferences])
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== KEY) return
      setPreferences(load())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const update = useCallback((next: Preferences) => {
    // Storage that cannot be read leaves this tab's own copy as the base, as before.
    const merged = applyChanges(loadStored() ?? shown.current, shown.current, next)
    shown.current = merged
    setPreferences(merged)
    try {
      localStorage.setItem(KEY, JSON.stringify(merged))
    } catch {
      // Storage can be unavailable (private windows); the app still works for the session.
    }
  }, [])
  return [preferences, update]
}
