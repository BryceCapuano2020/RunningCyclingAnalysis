import { useCallback, useState } from 'react'
import type { Sex } from '@rca/contract'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { isBirthYear } from './athlete'

export interface Preferences {
  settings: AthleteSettings
  units: UnitSystem
  birthYear: number | null
  sex: Sex | null
  /** The first-analysis setup was answered on this device. */
  setupDone: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  settings: { massKg: 75, bikeMassKg: 9 },
  units: 'imperial',
  birthYear: null,
  sex: null,
  setupDone: false,
}

const KEY = 'rca.preferences.v1'

/** Stored preferences from before a field existed read as that field's default. */
export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return DEFAULT_PREFERENCES
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return DEFAULT_PREFERENCES
    const { settings, units, birthYear, sex, setupDone } = value as {
      settings?: Partial<AthleteSettings>
      units?: unknown
      birthYear?: unknown
      sex?: unknown
      setupDone?: unknown
    }
    const massKg = settings?.massKg
    const bikeMassKg = settings?.bikeMassKg
    return {
      settings: {
        massKg:
          typeof massKg === 'number' && massKg >= 30 && massKg <= 200
            ? massKg
            : DEFAULT_PREFERENCES.settings.massKg,
        bikeMassKg:
          typeof bikeMassKg === 'number' && bikeMassKg >= 3 && bikeMassKg <= 30
            ? bikeMassKg
            : DEFAULT_PREFERENCES.settings.bikeMassKg,
      },
      units: units === 'metric' || units === 'imperial' ? units : DEFAULT_PREFERENCES.units,
      birthYear: isBirthYear(birthYear) ? birthYear : null,
      sex: sex === 'female' || sex === 'male' ? sex : null,
      setupDone: setupDone === true,
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

function load(): Preferences {
  try {
    return parsePreferences(localStorage.getItem(KEY))
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function usePreferences(): [Preferences, (next: Preferences) => void] {
  const [preferences, setPreferences] = useState(load)
  const update = useCallback((next: Preferences) => {
    setPreferences(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Storage can be unavailable (private windows); the app still works for the session.
    }
  }, [])
  return [preferences, update]
}
