import { useEffect, useRef, useState } from 'react'
import { focusPageHeading } from './pages/pageHeading'

/**
 * Stop, restart and retry unmount their own button when they finish. Once that button has gone and focus went with
 * it, focus moves to the page's heading. Focus the user has moved elsewhere is left where it is. The control is
 * passed by the caller because Safari and Firefox do not focus a clicked button.
 */
export function useRunThenFocus() {
  const focusAfter = useRef<{ control: Element | null } | null>(null)
  const [, setFocusTick] = useState(0)
  function runThenFocus(action: () => void, control?: Element) {
    const active = document.activeElement
    action()
    focusAfter.current = { control: control ?? (active === document.body ? null : active) }
    setFocusTick((tick) => tick + 1)
  }
  useEffect(() => {
    const pending = focusAfter.current
    if (pending === null) return
    const active = document.activeElement
    // The button that ran the action is still there: wait for it to go.
    if (pending.control?.isConnected) return
    focusAfter.current = null
    if (active !== null && active !== document.body && active.isConnected) return
    focusPageHeading()
  })
  return runThenFocus
}
