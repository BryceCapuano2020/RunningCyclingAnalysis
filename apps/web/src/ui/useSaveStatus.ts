import { useCallback, useState } from 'react'

/** Where a save stands: under way, done, or refused. */
export type SaveState = 'saving' | 'saved' | 'failed'

/**
 * Each named field's save state, from the save it started last. `save` runs a change, records it
 * as saving, then saved or failed, and reports whether it was saved. A refusal is recorded, not
 * rethrown, so a page shows it beside the field rather than dropping it. `clear` forgets a field's
 * state, such as a refusal the field's own edit has overtaken.
 */
export function useSaveStatus<K extends string>() {
  const [states, setStates] = useState<Partial<Record<K, SaveState>>>({})
  const clear = useCallback((key: K) => {
    setStates((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }, [])

  const save = useCallback(async (key: K, change: () => Promise<void>): Promise<boolean> => {
    setStates((current) => ({ ...current, [key]: 'saving' }))
    try {
      await change()
      setStates((current) => ({ ...current, [key]: 'saved' }))
      return true
    } catch {
      setStates((current) => ({ ...current, [key]: 'failed' }))
      return false
    }
  }, [])

  return { states, save, clear }
}
