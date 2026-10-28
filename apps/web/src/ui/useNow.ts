import { useEffect, useState } from 'react'
import { localDateOf } from '@rca/core/athlete'

/**
 * The current time, which only changes when the local date does, and is read again when the tab comes
 * back into view. Dated settings are in effect by the day, so nothing finer is worth a render.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const refresh = () => {
      const latest = Date.now()
      setNow((held) => (localDateOf(held) === localDateOf(latest) ? held : latest))
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  return now
}
