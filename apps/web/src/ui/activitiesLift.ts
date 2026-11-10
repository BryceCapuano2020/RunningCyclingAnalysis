import { liftSessionsOf } from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import { dateTextOfDay, dayOfCivil, localDayOfInstant } from '@rca/core/calendar'
import { windowEnding } from '@rca/core/period'
import { bucketSpan } from './activitiesVolume'
import type { LiftDay } from './volumeKinds'

/**
 * The lifting days of the live sets: one per day with a set, in seconds measured or estimated (core `liftSessionsOf`). A date that is not a real day (2025-13-45,
 * which Date would roll into another) is left out: a day counts only when it reads back as the same date.
 */
export function liftDaysOf(sets: readonly LiftSet[]): LiftDay[] {
  return liftSessionsOf(sets).flatMap((session) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session.date)) return []
    const day = dayOfCivil(
      Number(session.date.slice(0, 4)),
      Number(session.date.slice(5, 7)) - 1,
      Number(session.date.slice(8, 10)),
    )
    return Number.isFinite(day) && dateTextOfDay(day) === session.date
      ? [{ day, seconds: session.seconds, measured: session.measured }]
      : []
  })
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
