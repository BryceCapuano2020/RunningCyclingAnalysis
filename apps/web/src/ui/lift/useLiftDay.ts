import { useCallback, useSyncExternalStore } from 'react'
import { localDateOf } from '@rca/core/athlete'
import { liftDayOf, liftHashOf } from './liftDay'

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

/**
 * The lifting day the address names, with today from the app's clock (useNow, which ticks at local midnight), and a way
 * to open another day. A change of day is a step in the browser's history, so Back returns to the day before.
 */
export function useLiftDay(now: number): {
  day: string
  today: string
  openDay: (day: string) => void
} {
  // The app renders in the browser only, so there is no server snapshot.
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  const today = localDateOf(now)
  const openDay = useCallback(
    (day: string) => {
      window.location.hash = liftHashOf(day, today)
    },
    [today],
  )
  return { day: liftDayOf(hash, today), today, openDay }
}
