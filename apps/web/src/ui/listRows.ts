import type { ActivitySummary } from '@rca/core/pipeline'
import type { LiftRow } from './activitiesLift'
import { movingTimeOf } from './activityFigures'
import type { ActivitySort } from './activitySort'
import { firstActivityOf } from './sessions'
import type { ListEntry } from './sessions'

/** One row of the Activities list: an activity or a session of legs (sessions.ts), or a lifting day. */
export type ListRow = ListEntry | { kind: 'lift'; startMs: number; lift: LiftRow }

/** What a sort ranks an activity and a lifting day by, and which way. A lifting day has no distance or climb. */
interface Rank {
  activity: (activity: ActivitySummary) => number
  lift: (lift: LiftRow) => number
  descending: boolean
}

const RANK: Record<ActivitySort, Rank> = {
  newest: { activity: (a) => a.startMs, lift: (l) => l.startMs, descending: true },
  oldest: { activity: (a) => a.startMs, lift: (l) => l.startMs, descending: false },
  distance: { activity: (a) => a.distanceM, lift: () => 0, descending: true },
  time: { activity: movingTimeOf, lift: (l) => l.seconds, descending: true },
  climb: { activity: (a) => a.elevationGainM, lift: () => 0, descending: true },
}

/** What a row ranks by: an activity's own figure, or a session's at the end the sort meets first. */
function entryKey(entry: ListEntry, rank: Rank): number {
  if (entry.kind === 'activity') return rank.activity(entry.activity)
  const values = entry.legs.map(rank.activity)
  return rank.descending ? Math.max(...values) : Math.min(...values)
}

/** The key a row is named by in a page: its activity's id, or its lifting day's date. */
export function rowKeyOf(row: ListRow): string {
  return row.kind === 'lift' ? `lift:${row.lift.date}` : firstActivityOf(row).id
}

/**
 * The activity rows in the order given, with the lifting days merged in by the same sort, so the rows keep their order
 * among themselves. A lifting day goes before a row only when it ranks strictly ahead of it: on a tie, as a lifting day's
 * nil distance with an indoor ride's, the activity comes first. Lifting days that tie with each other go newest first.
 */
export function withLiftRows(
  entries: readonly ListEntry[],
  lifts: readonly LiftRow[],
  sort: ActivitySort,
): ListRow[] {
  if (lifts.length === 0) return [...entries]
  const rank = RANK[sort]
  const sign = rank.descending ? -1 : 1
  const ordered = [...lifts].sort(
    (a, b) => sign * (rank.lift(a) - rank.lift(b)) || b.startMs - a.startMs,
  )
  const ahead = (lift: LiftRow, key: number) =>
    rank.descending ? rank.lift(lift) > key : rank.lift(lift) < key
  const rows: ListRow[] = []
  let next = 0
  const take = (until: (lift: LiftRow) => boolean) => {
    for (let lift = ordered[next]; lift !== undefined && until(lift); lift = ordered[++next]) {
      rows.push({ kind: 'lift', startMs: lift.startMs, lift })
    }
  }
  for (const entry of entries) {
    const key = entryKey(entry, rank)
    take((lift) => ahead(lift, key))
    rows.push(entry)
  }
  take(() => true)
  return rows
}
