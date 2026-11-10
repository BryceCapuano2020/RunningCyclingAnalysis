import { isCountableKey, MAX_COUNTED_RUNS } from '@rca/core/athlete'

/**
 * Where the runs the athlete counts despite their walking pace are kept: this browser's storage, next to
 * the preferences, whether or not anyone is signed in. Signed in, the account keeps them too and this copy follows it
 * (accountSettings). A choice is a workout key (see `workoutKey`), so it holds for that workout whichever library it is
 * in and across a re-import.
 */
export const COUNTED_RUNS_KEY = 'rca.countedRuns.v1'

export { isCountableKey, MAX_COUNTED_RUNS }

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
