import type { ActivitySummary } from '@rca/core/pipeline'

/**
 * One row of the list: an activity, or the legs of one file shown as one session. A session has two
 * legs or more, and a row's start is its first leg's.
 */
export type ListEntry =
  | { kind: 'activity'; startMs: number; activity: ActivitySummary }
  | { kind: 'session'; startMs: number; key: string; legs: ActivitySummary[] }

/**
 * The list's rows in order. Consecutive activities that share a session key, the legs of one file,
 * become one session. An activity whose file has no other leg next to it is a row of its own.
 */
export function listEntries(activities: readonly ActivitySummary[]): ListEntry[] {
  const entries: ListEntry[] = []
  for (const activity of activities) {
    const key = activity.sessionKey
    const last = entries.at(-1)
    if (key !== undefined && last?.kind === 'session' && last.key === key) {
      last.legs.push(activity)
    } else if (key !== undefined && last?.kind === 'activity' && last.activity.sessionKey === key) {
      entries[entries.length - 1] = {
        kind: 'session',
        startMs: last.startMs,
        key,
        legs: [last.activity, activity],
      }
    } else {
      entries.push({ kind: 'activity', startMs: activity.startMs, activity })
    }
  }
  return entries
}

/** The activity a row leads with: the activity itself, or a session's first leg. */
export function firstActivityOf(entry: ListEntry): ActivitySummary {
  return entry.kind === 'activity' ? entry.activity : entry.legs[0]!
}

/**
 * The rows the list pages over. In a date sort the legs of one upload are grouped into sessions. Any
 * other sort lists each activity as its own row, since its legs are not next to each other.
 */
export function rowEntries(
  activities: readonly ActivitySummary[],
  dateOrder: boolean,
): ListEntry[] {
  if (dateOrder) return listEntries(activities)
  return activities.map((activity) => ({ kind: 'activity', startMs: activity.startMs, activity }))
}
