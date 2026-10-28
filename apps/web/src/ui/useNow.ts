import { useEffect, useState } from 'react'
import { localDateOf } from '@rca/core/athlete'

/** A moment after local midnight, so the tick lands on the new day whatever the timer's drift. */
const MIDNIGHT_SLACK_MS = 1000

/** Milliseconds from now to the next local midnight, plus the slack. */
function untilMidnight(now: number): number {
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime() - now + MIDNIGHT_SLACK_MS
}

/**
 * The current time, which only changes when the local date does: it ticks at local midnight, and is
 * read again when the tab comes back into view, since a timer can be held while a tab sleeps. Dated
 * settings are in effect by the day, so nothing finer is worth a render, and an entry dated tomorrow
 * takes effect on its day with no edit.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      const latest = Date.now()
      setNow((held) => (localDateOf(held) === localDateOf(latest) ? held : latest))
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        refresh()
        schedule()
      }, untilMidnight(Date.now()))
    }
    const wake = () => {
      refresh()
      schedule()
    }
    schedule()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
    }
  }, [])
  return now
}
