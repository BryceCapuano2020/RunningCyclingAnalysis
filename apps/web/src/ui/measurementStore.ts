import { MAX_MEASUREMENTS_PER_USER, MeasurementSchema } from '@rca/contract'
import { measurementKey } from '@rca/core/athlete'
import type { Measurement } from '@rca/core/athlete'

/**
 * Where a signed-out visitor's dated settings are kept: this browser's storage, next to the
 * preferences (see useSettings). A signed-in account keeps them on the server instead.
 */
const KEY = 'rca.measurements.v1'

/** The storage key, for a tab that listens for another tab's change to it. */
export const MEASUREMENTS_KEY = KEY

/** Earliest date first, then by kind and sport, so a list reads the same wherever it came from. */
export function sortedMeasurements(entries: readonly Measurement[]): Measurement[] {
  return [...entries].sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1
    const [left, right] = [measurementKey(a), measurementKey(b)]
    return left < right ? -1 : left > right ? 1 : 0
  })
}

/**
 * The stored list. Anything that is not a valid entry is dropped, as is a second entry for the same
 * kind, sport and date, and entries past the most one account keeps, so a damaged value reads as
 * fewer settings, never as a number the athlete did not enter.
 */
export function parseMeasurements(raw: string | null): Measurement[] {
  if (raw === null) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    const seen = new Map<string, Measurement>()
    for (const item of value as unknown[]) {
      const parsed = MeasurementSchema.safeParse(item)
      if (parsed.success) seen.set(measurementKey(parsed.data), parsed.data)
    }
    return sortedMeasurements([...seen.values()]).slice(0, MAX_MEASUREMENTS_PER_USER)
  } catch {
    return []
  }
}

export function loadMeasurements(): Measurement[] {
  try {
    return parseMeasurements(localStorage.getItem(KEY))
  } catch {
    return []
  }
}

/** The stored list, or null when the browser will not say (a write then builds on the tab's own copy). */
export function readStoredMeasurements(): Measurement[] | null {
  try {
    return parseMeasurements(localStorage.getItem(KEY))
  } catch {
    return null
  }
}

/** Stores the list. False when the browser refused (a private window, a full disk). */
export function storeMeasurements(entries: readonly Measurement[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
    return true
  } catch {
    return false
  }
}
