import type { Equipment, LiftSet } from '@rca/core/lift'
import type { LoggedDay, LoggedLift } from './liftDays'
import { liftName } from './liftNames'
import type { EarlierDay, LiftOfDay } from './liftPageTypes'

/** The sessions the list of earlier sessions adds at a time. */
export const EARLIER_STEP = 12

/** A day's lifts as the page shows them: the lift's name, its equipment and its sets in set order. */
export function liftsOfDay(day: LoggedDay | undefined): LiftOfDay[] {
  return (day?.lifts ?? []).map((lift) => ({
    name: liftName(lift.exercise),
    equipment: lift.equipment,
    sets: lift.sets.map(({ key, set }) => ({
      key,
      reps: set.reps,
      loadKg: set.loadKg,
      ...(set.rpe !== undefined && { rpe: set.rpe }),
      ...(set.warmup === true && { warmup: true }),
    })),
  }))
}

/** The days with sets before the one shown, newest first: the first `count`, and whether more follow. */
export function earlierDays(
  days: readonly LoggedDay[],
  day: string,
  count: number,
): { shown: EarlierDay[]; more: boolean } {
  const before = days.filter((logged) => logged.date < day)
  return {
    shown: before.slice(0, count).map((logged) => ({
      day: logged.date,
      lifts: [...new Set(logged.lifts.map((lift) => liftName(lift.exercise)))],
    })),
    more: before.length > count,
  }
}

/** The set a stored key names, on the day shown. */
export function setOfKey(day: LoggedDay | undefined, key: string): LiftSet | undefined {
  for (const lift of day?.lifts ?? []) {
    const found = lift.sets.find((logged) => logged.key === key)
    if (found) return found.set
  }
  return undefined
}

/** The last set of a lift, from the newest day that has it, on `equipment` when given. */
export function lastSetOf(
  days: readonly LoggedDay[],
  exercise: string,
  equipment: Equipment | undefined,
): LiftSet | undefined {
  const matches = (lift: LoggedLift) =>
    lift.exercise === exercise && (equipment === undefined || lift.equipment === equipment)
  for (const day of days) {
    const lift = day.lifts.find(matches)
    if (lift && lift.sets.length > 0) return lift.sets[lift.sets.length - 1]?.set
  }
  return undefined
}
