import { localDateText, startOfDayText } from '../calendar'
import type { Sport } from '../types'

/** The settings an athlete can date. Body mass is a single value; the others are kept per sport. */
export const MEASUREMENT_KINDS = [
  'massKg',
  'maxHeartRate',
  'thresholdPower',
  'thresholdPace',
] as const
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number]

/** The sports each kind is kept for. Body mass has none, since it is the athlete's, not a sport's. */
export const MEASUREMENT_SPORTS: Record<MeasurementKind, readonly Sport[]> = {
  massKg: [],
  maxHeartRate: ['run', 'ride'],
  thresholdPower: ['ride'],
  thresholdPace: ['run'],
}

/**
 * A value the athlete entered, in effect from a local date. Mass is kg, heart rate is bpm, threshold
 * power is W and threshold pace is a speed in m/s, so every figure is one number in one unit.
 *
 * Policy: an activity uses the entry in effect on its local date, which is the latest entry that
 * starts on or before that date. Before the first entry the earliest entry applies. With no entry
 * the app's own figure applies: the profile mass, or an estimate from the activities.
 */
export interface Measurement {
  kind: MeasurementKind
  /** Present for the kinds kept per sport (see MEASUREMENT_SPORTS), absent for body mass. */
  sport?: Sport
  value: number
  /** The local calendar date the entry takes effect, as YYYY-MM-DD. */
  from: string
}

const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/

/** Whether the text is a real calendar date written YYYY-MM-DD. */
export function isLocalDate(text: string): boolean {
  const match = DATE_TEXT.exec(text)
  if (match === null) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/** The local calendar date of an instant, as YYYY-MM-DD, in the time zone the code runs in. */
export function localDateOf(ms: number): string {
  return localDateText(ms)
}

/** The instant a local date starts, ms, in the time zone the code runs in. */
export function localDayStartMs(date: string): number {
  return startOfDayText(date)
}

/** The one text that names an entry, such as `maxHeartRate.run.2026-03-01`. It is the entry's identity. */
export function measurementKey(entry: Pick<Measurement, 'kind' | 'sport' | 'from'>): string {
  return [entry.kind, entry.sport, entry.from].filter((part) => part !== undefined).join('.')
}

/** Entries of one kind, and of one sport when given, earliest date first. */
export function entriesOf(
  entries: readonly Measurement[],
  kind: MeasurementKind,
  sport?: Sport,
): Measurement[] {
  return entries
    .filter((entry) => entry.kind === kind && (sport === undefined || entry.sport === sport))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
}

/**
 * The entry in effect at an instant, by the policy on Measurement; null when the kind has none.
 * The instant is read as the activity's local date. Entries may be in any order.
 */
export function entryAt(
  entries: readonly Measurement[],
  kind: MeasurementKind,
  sport: Sport | undefined,
  at: number,
): Measurement | null {
  const own = entriesOf(entries, kind, sport)
  const first = own[0]
  if (first === undefined) return null
  const date = localDateOf(at)
  let inEffect = first
  for (const entry of own) {
    if (entry.from > date) break
    inEffect = entry
  }
  return inEffect
}

/** Adds an entry, replacing the one with the same kind, sport and date. */
export function withEntry(entries: readonly Measurement[], entry: Measurement): Measurement[] {
  const key = measurementKey(entry)
  return [...entries.filter((other) => measurementKey(other) !== key), entry]
}

/** Removes the entry with this key. */
export function withoutEntry(entries: readonly Measurement[], key: string): Measurement[] {
  return entries.filter((entry) => measurementKey(entry) !== key)
}
