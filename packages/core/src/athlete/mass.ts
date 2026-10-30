import { entriesOf, entryAt, localDayStartMs } from './measurements'
import type { Measurement } from './measurements'
import type { AthleteSettings } from './settings'

/** The body mass, kg, in effect at an instant. See the policy on Measurement. */
export type MassAt = (atMs: number) => number

interface Step {
  fromMs: number
  massKg: number
}

/** The dated body masses of settings, earliest first, each with the instant its day starts. */
function stepsOf(settings: AthleteSettings): Step[] {
  return entriesOf(settings.measurements ?? [], 'massKg').map((entry) => ({
    fromMs: localDayStartMs(entry.from),
    massKg: entry.value,
  }))
}

/**
 * The body mass of an activity by its start. The latest dated mass that starts on or before its local
 * date applies, the earliest applies before the first, and settings.massKg applies when none is dated. This is
 * also the rule of `bodyMassOn`, for one date.
 * Built once per analysis, since each call is a binary search.
 */
export function massAtFor(settings: AthleteSettings): MassAt {
  const steps = stepsOf(settings)
  const first = steps[0]
  if (first === undefined) return () => settings.massKg
  return (atMs) => {
    let low = 0
    let high = steps.length - 1
    let found = first
    while (low <= high) {
      const mid = (low + high) >> 1
      const step = steps[mid]!
      if (step.fromMs <= atMs) {
        found = step
        low = mid + 1
      } else high = mid - 1
    }
    return found.massKg
  }
}

/** Whether any body mass is dated, so activities may be priced at different masses. */
export function hasDatedMass(settings: AthleteSettings): boolean {
  return (settings.measurements ?? []).some((entry) => entry.kind === 'massKg')
}

/**
 * Whether two settings price every activity the same, which is what a cached analysis depends on: the
 * same masses, and the same rides kept despite implausible power. Dated settings of other kinds do not enter.
 */
export function sameMasses(a: AthleteSettings, b: AthleteSettings): boolean {
  if (a.massKg !== b.massKg || a.bikeMassKg !== b.bikeMassKg) return false
  if ((a.massAssumed ?? false) !== (b.massAssumed ?? false)) return false
  const [keptA, keptB] = [a.keepPower ?? [], b.keepPower ?? []]
  if (keptA.length !== keptB.length || !keptA.every((id) => keptB.includes(id))) return false
  const [left, right] = [
    entriesOf(a.measurements ?? [], 'massKg'),
    entriesOf(b.measurements ?? [], 'massKg'),
  ]
  return (
    left.length === right.length &&
    left.every((entry, i) => entry.from === right[i]!.from && entry.value === right[i]!.value)
  )
}

/** The body mass in effect at an instant, kg, or null when no mass is dated. */
export function currentMass(measurements: readonly Measurement[], atMs: number): number | null {
  return entryAt(measurements, 'massKg', undefined, atMs)?.value ?? null
}

/**
 * The one rule for a body mass, wherever one is read for a date: the dated mass in effect then, else the profile's.
 * `massAtFor` is the same rule for many dates (an analysis prices each activity at its own); this is it for one,
 * such as the weight of today, which every figure expressed "at today's weight" and every analysis of the
 * library takes as `AthleteSettings.massKg`. The profile's mass may be null, which stays null.
 */
export function bodyMassOn<Profile extends number | null>(
  profileKg: Profile,
  measurements: readonly Measurement[],
  atMs: number,
): number | Profile {
  return currentMass(measurements, atMs) ?? profileKg
}
