/** Weekly lifting load per body region (docs/design/e1rm.md, section 5). */
import { dateTextOfDay, mondayOfWeek, weekOfDay } from '../calendar'
import { exerciseInfo } from './catalog'
import type { LiftRegion } from './catalog'
import { HARD_RPE, WARMUP_SHARE } from './constants'
import { dayOfLiftDate } from './estimate'
import { exerciseKeyOf } from './key'
import type { LiftSet } from './types'

export interface RegionLoad {
  workingSets: number
  /** Working sets at RPE 7 or higher. */
  hardSets: number
  /** Working sets with no RPE, counted apart and never guessed. */
  effortUnknownSets: number
  /** Reps times load, kg; both dumbbells for a paired lift. Bodyweight lifts count added load only. */
  volumeKg: number
  /** Working sets of bodyweight lifts, whose volume is added load only. */
  bodyweightSets: number
}

export interface LiftWeek {
  /** The Monday that starts the week, YYYY-MM-DD. */
  weekStart: string
  regions: Record<LiftRegion, RegionLoad>
}

const emptyLoad = (): RegionLoad => ({
  workingSets: 0,
  hardSets: 0,
  effortUnknownSets: 0,
  volumeKg: 0,
  bodyweightSets: 0,
})

/** Sets that are work: not marked warm-up, and not an unmarked warm-up (under 70% of the session's top, before it). */
function workingSets(sets: readonly LiftSet[]): LiftSet[] {
  const sessions = new Map<string, LiftSet[]>()
  for (const s of sets) {
    if (s.warmup) continue
    const id = `${s.date}|${exerciseKeyOf(s)}`
    sessions.set(id, [...(sessions.get(id) ?? []), s])
  }
  const work: LiftSet[] = []
  for (const group of sessions.values()) {
    // The top set is the heaviest; of equal loads, the lowest setOrder.
    const top = group.reduce((a, s) =>
      s.loadKg > a.loadKg || (s.loadKg === a.loadKg && s.setOrder < a.setOrder) ? s : a,
    )
    for (const s of group) {
      const warm = s.loadKg < WARMUP_SHARE * top.loadKg && s.setOrder < top.setOrder
      if (!warm) work.push(s)
    }
  }
  return work
}

/** Calendar weeks (Monday start) with their load per region, oldest first. Weeks with no working set are absent. */
export function weeklyLoad(sets: readonly LiftSet[]): LiftWeek[] {
  const weeks = new Map<number, Record<LiftRegion, RegionLoad>>()
  for (const s of workingSets(sets)) {
    const week = weekOfDay(dayOfLiftDate(s.date))
    let row = weeks.get(week)
    if (!row) {
      row = { lower: emptyLoad(), upper: emptyLoad(), other: emptyLoad() }
      weeks.set(week, row)
    }
    const info = exerciseInfo(s.exercise)
    const load = row[info.region]
    const bodyweight = s.equipment === 'bodyweight' || info.bodyweight === true
    load.workingSets += 1
    if (s.rpe === undefined) load.effortUnknownSets += 1
    else if (s.rpe >= HARD_RPE) load.hardSets += 1
    if (bodyweight) load.bodyweightSets += 1
    const pair = info.pair === true && s.equipment === 'dumbbell' ? 2 : 1
    // An assisted lift's load is the help, not weight moved.
    if (info.assisted !== true) load.volumeKg += s.reps * s.loadKg * pair
  }
  return [...weeks.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, regions]) => ({ weekStart: dateTextOfDay(mondayOfWeek(week)), regions }))
}

/** The Monday that starts the week of a lifting date, as weeklyLoad names its weeks ("YYYY-MM-DD"). */
export function liftWeekStart(date: string): string {
  return dateTextOfDay(mondayOfWeek(weekOfDay(dayOfLiftDate(date))))
}
