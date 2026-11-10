import { exerciseKeyOf } from '@rca/core/lift'
import type { Equipment, ExerciseKey, LiftSet } from '@rca/core/lift'
import type { LiftRow, LiftRowState } from '../../worker/liftTransitions'

/** One set as the page shows it, with whether the server has it yet. */
export interface LoggedSet {
  /** The set key (`LiftRow.key`), which `remove` takes. */
  key: string
  set: LiftSet
  state: LiftRowState
}

/** One lift, with its equipment, on one day: its sets in set order. */
export interface LoggedLift {
  key: ExerciseKey
  exercise: string
  equipment: Equipment
  sets: LoggedSet[]
}

export interface LoggedDay {
  /** Local date, YYYY-MM-DD. */
  date: string
  /** Ordered by the earliest set time (lifts with no time last), then by name. */
  lifts: LoggedLift[]
}

export interface RecentLift {
  key: ExerciseKey
  exercise: string
  equipment: Equipment
}

/** How many recent lifts the picker lists first. */
export const RECENT_LIFTS = 12

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

const earliestTime = (lift: LoggedLift) =>
  lift.sets.reduce(
    (least, { set }) => (set.time !== undefined && set.time < least ? set.time : least),
    '99:99',
  )

/** Put and synced rows, grouped by date (newest day first), then by lift and equipment. Delete rows do not show. */
export function groupDays(rows: readonly LiftRow[]): LoggedDay[] {
  const days = new Map<string, Map<ExerciseKey, LoggedLift>>()
  for (const row of rows) {
    if (row.state === 'delete') continue
    const { set } = row
    const lifts = days.get(set.date) ?? new Map<ExerciseKey, LoggedLift>()
    days.set(set.date, lifts)
    const key = exerciseKeyOf(set)
    const lift = lifts.get(key) ?? {
      key,
      exercise: set.exercise,
      equipment: set.equipment,
      sets: [],
    }
    lifts.set(key, lift)
    lift.sets.push({ key: row.key, set, state: row.state })
  }
  return [...days]
    .sort(([a], [b]) => compare(b, a))
    .map(([date, lifts]) => {
      const ordered = [...lifts.values()]
      for (const lift of ordered) lift.sets.sort((a, b) => a.set.setOrder - b.set.setOrder)
      ordered.sort((a, b) => compare(earliestTime(a), earliestTime(b)) || compare(a.key, b.key))
      return { date, lifts: ordered }
    })
}

/** The lifts last used, newest first: by the latest date and time, then by name. */
export function recentLifts(rows: readonly LiftRow[]): RecentLift[] {
  const latest = new Map<ExerciseKey, { at: string; set: LiftSet }>()
  for (const { set, state } of rows) {
    if (state === 'delete') continue
    const key = exerciseKeyOf(set)
    const at = `${set.date} ${set.time ?? '00:00'}`
    const held = latest.get(key)
    if (held === undefined || at > held.at) latest.set(key, { at, set })
  }
  return [...latest]
    .sort(([ka, a], [kb, b]) => compare(b.at, a.at) || compare(ka, kb))
    .slice(0, RECENT_LIFTS)
    .map(([key, { set }]) => ({ key, exercise: set.exercise, equipment: set.equipment }))
}
