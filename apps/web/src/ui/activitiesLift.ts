import { liftSessionsOf } from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import { dateTextOfDay, dayOfCivil, localDayOfInstant, startOfDayNumber } from '@rca/core/calendar'
import { windowEnding } from '@rca/core/period'
import { bucketSpan } from './activitiesVolume'
import { liftName } from './lift/liftNames'
import type { LiftDay } from './volumeKinds'

/** How many lifts a row names before it counts the rest: "Bench press, incline bench press +6". */
const NAMED_LIFTS = 2

/** A lifting day as the Activities list shows it: the volume's day, with its date, sets, start and name. */
export interface LiftRow extends LiftDay {
  /** Local date, YYYY-MM-DD, which the Lift page opens at. */
  date: string
  sets: number
  /** When the row sits in the day: its first stamped set, or the day's start when no set has a time. */
  startMs: number
  /** Whether a set of the day carries a time of day, which the row then gives. */
  timed: boolean
  /** The day's main lifts, most sets first: "Bench press, incline bench press +6". */
  name: string
}

/** A later name in a list starts in lower case, unless it is an initialism ("RDL"). */
function inList(name: string): string {
  const second = name.charAt(1)
  return second !== '' && second === second.toUpperCase()
    ? name
    : `${name.charAt(0).toLowerCase()}${name.slice(1)}`
}

/** The day's lifts by how many sets each has, most first and in the order logged on a tie, named and counted. */
function nameOf(sets: readonly LiftSet[]): string {
  const counts = new Map<string, number>()
  for (const set of sets) counts.set(set.exercise, (counts.get(set.exercise) ?? 0) + 1)
  const lifts = [...counts].sort((a, b) => b[1] - a[1]).map(([exercise]) => liftName(exercise))
  const named = lifts
    .slice(0, NAMED_LIFTS)
    .map((name, index) => (index === 0 ? name : inList(name)))
  const rest = lifts.length - named.length
  return `${named.join(', ')}${rest > 0 ? ` +${rest}` : ''}`
}

/** The moment an HH:MM time is on a day, kept on that day across a clock change; the day's start for no time. */
function startMsOf(day: number, start: string | undefined): number {
  const midnight = startOfDayNumber(day)
  if (start === undefined) return midnight
  const at = midnight + (Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5))) * 60_000
  return localDayOfInstant(at) === day ? at : midnight
}

/**
 * The lifting days of the live sets: one per day with a set, with its seconds (measured or estimated, core
 * `liftSessionsOf`), oldest first. A date that is not a real day (2025-13-45, which Date would roll into another) is
 * left out: a day counts only when it reads back as the same date.
 */
export function liftDaysOf(sets: readonly LiftSet[]): LiftRow[] {
  const byDate = new Map<string, LiftSet[]>()
  for (const set of sets) {
    const daySets = byDate.get(set.date)
    if (daySets === undefined) byDate.set(set.date, [set])
    else daySets.push(set)
  }
  return liftSessionsOf(sets).flatMap((session) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(session.date)) return []
    const day = dayOfCivil(
      Number(session.date.slice(0, 4)),
      Number(session.date.slice(5, 7)) - 1,
      Number(session.date.slice(8, 10)),
    )
    if (!Number.isFinite(day) || dateTextOfDay(day) !== session.date) return []
    return [
      {
        day,
        seconds: session.seconds,
        measured: session.measured,
        date: session.date,
        sets: session.sets,
        startMs: startMsOf(day, session.start),
        timed: session.start !== undefined,
        name: nameOf(byDate.get(session.date) ?? []),
      },
    ]
  })
}

/**
 * The lifting days in the period the list is narrowed to: all of them for all time, else the days of the window that
 * ends on the newest activity's day, as the activities' own window does.
 */
export function liftDaysInPeriod<T extends LiftDay>(
  lifts: readonly T[],
  days: number | null,
  newestMs: number,
): readonly T[] {
  if (days === null || !Number.isFinite(newestMs)) return lifts
  const { startMs, endMs } = windowEnding(newestMs, days)
  const from = localDayOfInstant(startMs)
  const to = localDayOfInstant(endMs)
  return lifts.filter((lift) => lift.day >= from && lift.day <= to)
}

/** The lifting days in the week or month a key names; all of them for no key or one that is not valid. */
export function liftDaysInBucket<T extends LiftDay>(
  lifts: readonly T[],
  key: string | null,
): readonly T[] {
  const span = key === null ? null : bucketSpan(key)
  if (span === null) return lifts
  const from = localDayOfInstant(span.startMs)
  const to = localDayOfInstant(span.endMs)
  return lifts.filter((lift) => lift.day >= from && lift.day < to)
}
