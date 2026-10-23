import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * Returns a function that gives the value from the latest render. An effect that reads through it
 * does not need to list the values it reads, so it does not re-run when one of them changes
 * identity. The value is stored in a layout effect, so it is current before any passive effect or
 * event handler runs.
 */
export function useLatest<T>(value: T): () => T {
  const ref = useRef(value)
  useLayoutEffect(() => {
    ref.current = value
  })
  return useCallback(() => ref.current, [])
}
