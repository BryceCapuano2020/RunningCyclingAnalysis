import { dedupeKey } from '@rca/core/session'
import type { Sport } from '@rca/core/types'

/**
 * Where the runs the athlete counts despite their walking pace are kept: this browser's storage, next to
 * the preferences, whether or not anyone is signed in. A choice is a workout key (see `dedupeKey`), so it
 * holds for that workout whichever library it is in and across a re-import. It is never uploaded.
 */
export const COUNTED_RUNS_KEY = 'rca.countedRuns.v1'

/** The sports whose activities can be at walking pace, so a choice to count one can be kept. */
const CAN_BE_AT_WALKING_PACE: Record<Sport, boolean> = { run: true, ride: false }

/** A workout key of such a sport, in the form `dedupeKey` writes: the sport and the start second. */
const WORKOUT_KEY = new RegExp(
  `^(?:${(Object.keys(CAN_BE_AT_WALKING_PACE) as Sport[])
    .filter((sport) => CAN_BE_AT_WALKING_PACE[sport])
    .map((sport) => dedupeKey(sport, 0).replace(/0$/, ''))
    .join('|')})\\d{1,12}$`,
)

/** The most choices kept: far above any library, so a limit is never reached by a real one, and said when it is. */
export const MAX_COUNTED_RUNS = 20_000

/** Whether the text is a workout key a choice can be kept under. */
export function isCountableKey(text: string): boolean {
  return WORKOUT_KEY.test(text)
}

/** The stored list. Anything that is not a countable workout key is dropped, as is a repeat. */
export function parseCountedRuns(raw: string | null): string[] {
  if (raw === null) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    const kept = new Set<string>()
    for (const item of value as unknown[]) {
      if (typeof item === 'string' && isCountableKey(item)) kept.add(item)
    }
    return [...kept].sort()
  } catch {
    return []
  }
}

export function loadCountedRuns(): string[] {
  try {
    return parseCountedRuns(localStorage.getItem(COUNTED_RUNS_KEY))
  } catch {
    return []
  }
}

const listeners = new Set<() => void>()

/**
 * Calls back when the choices change here or in another tab of this browser (the `storage` event), so every
 * view of them agrees. Returns the way to stop.
 */
export function subscribeCountedRuns(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    // A cleared store fires with no key.
    if (event.key === null || event.key === COUNTED_RUNS_KEY) listener()
  }
  listeners.add(listener)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Stores the list. False when the browser refused (a private window, a full disk), so the choice would not last. */
export function storeCountedRuns(keys: readonly string[]): boolean {
  try {
    if (keys.length === 0) localStorage.removeItem(COUNTED_RUNS_KEY)
    else localStorage.setItem(COUNTED_RUNS_KEY, JSON.stringify(keys))
  } catch {
    return false
  }
  for (const listener of listeners) listener()
  return true
}

/** Forgets every choice. False when the browser refused, and then they are still there. */
export function clearCountedRuns(): boolean {
  return storeCountedRuns([])
}
