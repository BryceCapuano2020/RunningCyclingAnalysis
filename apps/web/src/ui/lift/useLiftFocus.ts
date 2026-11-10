import { useEffect, useRef } from 'react'
import type { LiftOfDay } from './liftPageTypes'
import { liftId } from './liftPageTypes'

/**
 * Puts focus back where a keyboard user was when an edit's form closes, so they are never left on nothing:
 * - after Save or Cancel, on that set's row button;
 * - after a delete, on the set that took its place, else the lift's heading, else the day's heading;
 * - after a change of day, nowhere: moving days is not an edit.
 * It reads the lifts before and after, so the wiring step must close the form (editingKey null) in the same render that
 * gives the lifts without the deleted set, or after it. Closing it first reads as a Cancel.
 */
export function useFocusAfterEdit(
  root: React.RefObject<HTMLElement | null>,
  lifts: readonly LiftOfDay[],
  editingKey: string | null,
  day: string,
): void {
  const before = useRef(lifts)
  const edited = useRef<string | null>(null)
  const shown = useRef(day)
  // Declared first, so the key is held before the effect below reads it in the render that closes the form.
  useEffect(() => {
    if (editingKey !== null) edited.current = editingKey
  }, [editingKey])
  useEffect(() => {
    const key = edited.current
    const was = before.current
    before.current = lifts
    if (shown.current !== day) {
      shown.current = day
      edited.current = null
      return
    }
    if (key === null || editingKey !== null) return
    edited.current = null
    const hasKey = (lift: LiftOfDay) => lift.sets.some((set) => set.key === key)
    const section = (lift: LiftOfDay) =>
      [...(root.current?.querySelectorAll<HTMLElement>('[data-lift]') ?? [])].find(
        (node) => node.dataset.lift === liftId(lift),
      )
    const now = lifts.find(hasKey)
    if (now !== undefined) {
      section(now)
        ?.querySelectorAll<HTMLElement>('.props__action')
        [now.sets.findIndex((set) => set.key === key)]?.focus()
      return
    }
    const old = was.find(hasKey)
    const kept = old && lifts.find((lift) => liftId(lift) === liftId(old))
    const index = old?.sets.findIndex((set) => set.key === key) ?? -1
    const home = kept ? section(kept) : undefined
    const next = home?.querySelectorAll<HTMLElement>('.props__action')[index]
    const target =
      next ??
      home?.querySelector<HTMLElement>('.lift__name') ??
      root.current?.querySelector<HTMLElement>('.lift__day-name') ??
      root.current?.querySelector<HTMLElement>('.btn-primary')
    target?.focus()
  }, [lifts, editingKey, day, root])
}
