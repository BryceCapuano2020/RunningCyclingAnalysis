import { liftSessionsOf } from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import { dayOfCivil, localDayOfInstant } from '@rca/core/calendar'
import { windowEnding } from '@rca/core/period'
import { bucketSpan } from './activitiesVolume'
import type { LiftDay } from './volumeKinds'

/** The lifting days of the live sets: one per day with a set, in estimated seconds. Dates that are not dates are left out. */
export function liftDaysOf(sets: readonly LiftSet[]): LiftDay[] {
  return liftSessionsOf(sets)
    .map((session) => ({
      day: dayOfCivil(
        Number(session.date.slice(0, 4)),
        Number(session.date.slice(5, 7)) - 1,
        Number(session.date.slice(8, 10)),
      ),
      seconds: session.seconds,
    }))
    .filter((lift) => Number.isFinite(lift.day))
}

/**
 * The lifting days in the period the list is narrowed to: all of them for all time, else the days of the window that
 * ends on the newest activity's day, as the activities' own window does.
 */
export function liftDaysInPeriod(
  lifts: readonly LiftDay[],
  days: number | null,
  newestMs: number,
): readonly LiftDay[] {
  if (days === null || !Number.isFinite(newestMs)) return lifts
  const { startMs, endMs } = windowEnding(newestMs, days)
  const from = localDayOfInstant(startMs)
  const to = localDayOfInstant(endMs)
  return lifts.filter((lift) => lift.day >= from && lift.day <= to)
}

/** The lifting days in the week or month a key names; all of them for no key or one that is not valid. */
export function liftDaysInBucket(
  lifts: readonly LiftDay[],
  key: string | null,
): readonly LiftDay[] {
  const span = key === null ? null : bucketSpan(key)
  if (span === null) return lifts
  const from = localDayOfInstant(span.startMs)
  const to = localDayOfInstant(span.endMs)
  return lifts.filter((lift) => lift.day >= from && lift.day < to)
}
