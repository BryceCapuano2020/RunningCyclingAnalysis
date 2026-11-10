import { useEffect, useRef } from 'react'
import type { LiftOfDay } from './liftPageTypes'
import { liftId } from './liftPageTypes'

/**
 * After a delete, focus moves to the set that took the deleted one's place, else the lift's heading, so a keyboard
 * user is not left on nothing. It reads the lifts before and after: the edited set's key is gone from the new ones.
 */
export function useFocusAfterDelete(
  root: React.RefObject<HTMLElement | null>,
  lifts: readonly LiftOfDay[],
  editingKey: string | null,
): void {
  const before = useRef(lifts)
  const edited = useRef<string | null>(null)
  // Declared first, so the key is held before the effect below reads it in the render that closes the form.
  useEffect(() => {
    if (editingKey !== null) edited.current = editingKey
  }, [editingKey])
  useEffect(() => {
    const key = edited.current
    const gone = key !== null && !lifts.some((lift) => lift.sets.some((set) => set.key === key))
    if (gone) {
      const was = before.current.find((lift) => lift.sets.some((set) => set.key === key))
      const index = was?.sets.findIndex((set) => set.key === key) ?? -1
      const section = [...(root.current?.querySelectorAll<HTMLElement>('[data-lift]') ?? [])].find(
        (node) => was !== undefined && node.dataset.lift === liftId(was),
      )
      const next = section?.querySelectorAll<HTMLElement>('.props__action')[index]
      ;(next ?? section?.querySelector<HTMLElement>('.lift__name'))?.focus()
    }
    if (gone || editingKey === null) edited.current = null
    before.current = lifts
  }, [lifts, editingKey, root])
}
