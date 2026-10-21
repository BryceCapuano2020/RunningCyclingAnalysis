import { useCallback, useState } from 'react'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'

export interface Preferences {
  settings: AthleteSettings
  units: UnitSystem
}

export const DEFAULT_PREFERENCES: Preferences = {
  settings: { massKg: 75, bikeMassKg: 9 },
  units: 'imperial',
}

const KEY = 'rca.preferences.v1'

export function parsePreferences(raw: string | null): Preferences {
  if (!raw) return DEFAULT_PREFERENCES
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return DEFAULT_PREFERENCES
    const { settings, units } = value as { settings?: Partial<AthleteSettings>; units?: unknown }
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
