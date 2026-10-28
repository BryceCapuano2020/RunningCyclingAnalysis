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
 * date applies, the earliest applies before the first, and settings.massKg applies when none is dated.
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
 * Whether two settings give every activity the same masses, which is what a cached analysis depends
 * on. Dated settings of other kinds do not enter.
 */
export function sameMasses(a: AthleteSettings, b: AthleteSettings): boolean {
  if (a.massKg !== b.massKg || a.bikeMassKg !== b.bikeMassKg) return false
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
