import { useEffect, useState } from 'react'

/**
 * Whether `on` has stayed true for `delayMs`. It is false as soon as `on` turns off, and each new run
 * waits the delay again, so a short run never shows what waits on it.
 */
export function useDelayedFlag(on: boolean, delayMs: number): boolean {
  const [due, setDue] = useState(false)
  const [timedOn, setTimedOn] = useState(on)

  // A change of run restarts the wait, so the flag never carries over from the run before.
  if (on !== timedOn) {
    setTimedOn(on)
    setDue(false)
  }
  useEffect(() => {
    if (!on) return
    const timer = setTimeout(() => setDue(true), delayMs)
    return () => clearTimeout(timer)
  }, [on, delayMs])

  return on && due
}
