import { EXERCISE_CATALOG } from '../catalog'
import { readLiftSet } from '../validate'
import type { Equipment, LiftSet } from '../types'

export type HevyLayout = 'A' | 'B'

/** A data row left out, or kept with a value set aside. `row` counts the CSV records, the header as 1: a blank line or a line break inside a quoted field is not counted, so it can differ from the file's line number. */
export interface HevySkip {
  row: number
  reason: string
}

export interface HevyCsvResult {
  sets: LiftSet[]
  skipped: HevySkip[]
  /** Sets kept with a value set aside: an RPE that is not 1 to 10 in halves. */
  adjusted: HevySkip[]
  /** Slugs the catalog does not hold, in file order, each once. */
  customExercises: string[]
  layout: HevyLayout
}

/** One readable row, before set orders are given. */
export interface Staged {
  row: number
  session: string
  date: string
  time?: string
  exercise: string
  equipment: Equipment
  index: number
  reps: number
  loadKg: number
  rpe?: number
  warmup: boolean
}

/**
 * Gives each staged row its set order and checks it against the record. Within a date, workouts run by
 * time, then file order; within a workout, by set index, then row. A row the record refuses is skipped.
 */
export function assembleHevySets(
  staged: Staged[],
  skipped: HevySkip[],
  adjusted: HevySkip[],
  layout: HevyLayout,
): HevyCsvResult {
  const first = new Map<string, number>()
  const head = new Map<string, Staged>()
  for (const s of staged) {
    if (first.has(s.session)) continue
    first.set(s.session, s.row)
    head.set(s.session, s)
  }
  const sessions = [...first.keys()]
  sessions.sort((a, b) => {
    const x = head.get(a) as Staged
    const y = head.get(b) as Staged
    if (x.date !== y.date) return x.date < y.date ? -1 : 1
    const tx = x.time ?? ''
    const ty = y.time ?? ''
    if (tx !== ty) return tx < ty ? -1 : 1
    return (first.get(a) as number) - (first.get(b) as number)
  })
  const rank = new Map(sessions.map((id, i) => [id, i]))
  const order = [...staged].sort(
    (a, b) =>
      (rank.get(a.session) as number) - (rank.get(b.session) as number) ||
      a.index - b.index ||
      a.row - b.row,
  )
  const counts = new Map<string, number>()
  const orders = new Map<Staged, number>()
  for (const s of order) {
    const key = `${s.date}|${s.exercise}|${s.equipment}`
    const n = (counts.get(key) ?? 0) + 1
    counts.set(key, n)
    orders.set(s, n)
  }
  const sets: LiftSet[] = []
  const custom = new Set<string>()
  for (const s of staged) {
    const set = readLiftSet({
      date: s.date,
      ...(s.time !== undefined && { time: s.time, timePrecision: 'session' }),
      exercise: s.exercise,
      equipment: s.equipment,
      setOrder: orders.get(s),
      reps: s.reps,
      loadKg: s.loadKg,
      ...(s.rpe !== undefined && { rpe: s.rpe }),
      ...(s.warmup && { warmup: true }),
    })
    if (set === null) {
      skipped.push({ row: s.row, reason: 'The set is outside the record limits.' })
      continue
    }
    sets.push(set)
    if (!Object.hasOwn(EXERCISE_CATALOG, s.exercise)) custom.add(s.exercise)
  }
  skipped.sort((a, b) => a.row - b.row)
  return { sets, skipped, adjusted, customExercises: [...custom], layout }
}
