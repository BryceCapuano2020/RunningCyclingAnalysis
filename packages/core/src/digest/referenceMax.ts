import { DAY_MS } from '../constants'
import type { ActivityDigest } from '../types'
import { localDayNumber } from './localDay'

/**
 * How many separate days must reach a heart rate before it counts as a maximum. One reading can be a sensor
 * artefact, and a wrist sensor gives them in runs of a minute or two, but a value reached on three different days
 * within a few beats of each other is a heart rate the athlete's body gave.
 */
export const CORROBORATING_DAYS = 3

/**
 * How near each other, in bpm, the days that corroborate a maximum must lie. A real maximum is reached on several
 * days within a few beats of it; an artefact lands anywhere above, so two of them rarely agree to within this.
 */
export const SUPPORT_SPREAD_BPM = 3

/**
 * How far down the days, highest first, a corroborated maximum is looked for: the larger of this many days and this
 * share of them. Further down, three days within a few beats are only easy days that happen to agree.
 */
export const SUPPORT_MIN_DAYS = 6
export const SUPPORT_SHARE = 0.08

/** The trailing window a maximum is taken over, so a maximum from many years ago does not set today's zones. */
export const REFERENCE_WINDOW_DAYS = 3 * 365

/** Fewest days with a heart rate the window must hold; with fewer, all time is used. */
export const MIN_WINDOW_DAYS = 12

/**
 * Fewest days with a heart rate for three to be asked for. A library of fewer has too few hard days for three to agree,
 * so the highest value two days reached is its maximum (one, with a single day).
 */
export const THIN_LIBRARY_DAYS = 30

export interface ReferenceMax {
  bpm: number
  /** How many separate days reached it. */
  days: number
  /** The start of the stretch it was taken over: the window's start, or the first day when the library is shorter. */
  sinceMs: number
}

interface Day {
  day: number
  bpm: number
  startMs: number
}

/** Each day's highest per-activity maximum among the digests that started in [fromMs, toMs]. */
function dayMaxima(digests: readonly ActivityDigest[], fromMs: number, toMs: number): Day[] {
  const byDay = new Map<number, Day>()
  for (const digest of digests) {
    const { startMs, maxHeartRate } = digest
    if (maxHeartRate === null || !Number.isFinite(maxHeartRate) || !Number.isFinite(startMs))
      continue
    if (startMs < fromMs || startMs > toMs) continue
    const day = localDayNumber(startMs)
    const held = byDay.get(day)
    if (held === undefined || maxHeartRate > held.bpm)
      byDay.set(day, { day, bpm: maxHeartRate, startMs })
    else if (maxHeartRate === held.bpm && startMs < held.startMs) held.startMs = startMs
  }
  return [...byDay.values()]
}

/**
 * Days above the typical day whose highest reading is a whole number that another day's reading equals exactly count
 * once between them. A sustained heart rate is a mean of many samples, so it is rarely a whole number and two days
 * almost never agree to the decimal; a sensor that stops at a ceiling (or repeats the last value) gives the same whole
 * number each time, and one that holds a reading for half a minute or more makes whole-number peaks of real ones. One
 * representative of each such number stays, so the days cannot corroborate each other but the value is not lost: stuck
 * 210s count as one day, and a real 190 reached flat on five days still counts. Below the middle of the days a repeated
 * number says nothing of a ceiling, and every day is kept.
 */
function withoutRepeatedCeilings(days: Day[]): Day[] {
  if (days.length === 0) return days
  const seen = new Map<number, number>()
  for (const { bpm } of days) seen.set(bpm, (seen.get(bpm) ?? 0) + 1)
  const median = days.map((d) => d.bpm).sort((a, b) => a - b)[days.length >> 1]!
  const kept = new Set<number>()
  return days.filter(({ bpm }) => {
    if (!(Number.isInteger(bpm) && bpm > median && (seen.get(bpm) ?? 0) > 1)) return true
    if (kept.has(bpm)) return false
    kept.add(bpm)
    return true
  })
}

/**
 * The highest value that `days` separate days reached, among days in descending order of their value: the first run of
 * `CORROBORATING_DAYS` days, within the top of the list, whose values lie within `SUPPORT_SPREAD_BPM` of each other
 * gives its lowest. Without such a run, the third-highest day. Fewer than `THIN_LIBRARY_DAYS` days are too few
 * to ask for three to agree, and the second-highest day is the maximum.
 */
function corroborated(values: number[]): { bpm: number; days: number } {
  const sorted = [...values].sort((a, b) => b - a)
  if (sorted.length < THIN_LIBRARY_DAYS) {
    const days = Math.min(2, sorted.length)
    return { bpm: sorted[days - 1]!, days }
  }
  const last = CORROBORATING_DAYS - 1
  const reach = Math.min(
    Math.max(SUPPORT_MIN_DAYS, Math.ceil(sorted.length * SUPPORT_SHARE)),
    sorted.length - last,
  )
  for (let i = 0; i < reach; i++) {
    if (sorted[i]! - sorted[i + last]! <= SUPPORT_SPREAD_BPM) {
      return { bpm: sorted[i + last]!, days: CORROBORATING_DAYS }
    }
  }
  return { bpm: sorted[last]!, days: CORROBORATING_DAYS }
}

/** The days a maximum is taken over: the window's when it holds enough, else every day. */
function daysFor(digests: readonly ActivityDigest[], endMs: number) {
  const windowStart = endMs - REFERENCE_WINDOW_DAYS * DAY_MS
  const everyDay = dayMaxima(digests, -Infinity, Infinity)
  const windowed = withoutRepeatedCeilings(dayMaxima(digests, windowStart, endMs))
  const useWindow = windowed.length >= MIN_WINDOW_DAYS
  const days = useWindow ? windowed : withoutRepeatedCeilings(everyDay)
  return { days, everyDay, useWindow, windowStart }
}

/**
 * The maximum heart rate the digests support: the highest value several separate days reached, within the trailing
 * window that ends at `endMs`, so one artefact, or two, sets nothing (see `corroborated`). With fewer than
 * `MIN_WINDOW_DAYS` days with a heart rate in the window it is taken over all time. Null without a heart rate.
 *
 * A day counts for its highest per-activity maximum (`ActivityDigest.maxHeartRate`, already a 30 s mean), so
 * several hard efforts in one day are one day, by local date. Days that read the same whole number count once (see
 * `withoutRepeatedCeilings`). The rule was picked against the alternatives in referenceMax.sim.test.ts.
 */
export function referenceMaxOf(
  digests: readonly ActivityDigest[],
  endMs: number,
): ReferenceMax | null {
  return maximumAndTypicalDay(digests, endMs).max
}

/** The newest start among the digests that recorded a heart rate; -Infinity without one. */
export function newestHeartRateMs(digests: readonly ActivityDigest[]): number {
  let newest = -Infinity
  for (const { startMs, maxHeartRate } of digests) {
    if (maxHeartRate !== null && Number.isFinite(startMs) && startMs > newest) newest = startMs
  }
  return newest
}

/** How the days' peak heart rates sit under the maximum they gave: the median day's share of it, over this many days. */
export interface TypicalDay {
  /** The median day's peak over the maximum, 0 to 1. A true maximum is rare, so a typical day sits well under it. */
  share: number
  days: number
}

/**
 * The typical day against the maximum, over the same days `referenceMaxOf` takes its maximum from. A library
 * whose typical day is near its maximum has no day it could be told apart from: the maximum is where the athlete
 * lives. Null without a heart rate.
 */
export function typicalDayOf(digests: readonly ActivityDigest[], endMs: number): TypicalDay | null {
  return maximumAndTypicalDay(digests, endMs).typical
}

/** The maximum and the typical day together, from one pass over the days: what the references of a sport read. */
export function maximumAndTypicalDay(
  digests: readonly ActivityDigest[],
  endMs: number,
): { max: ReferenceMax | null; typical: TypicalDay | null } {
  const { days, everyDay, useWindow, windowStart } = daysFor(digests, endMs)
  if (days.length === 0) return { max: null, typical: null }
  const peaks = days.map((d) => d.bpm)
  const { bpm, days: corroborating } = corroborated(peaks)
  // A library that began inside the window was read from its first day, not from the window's start.
  const first = Math.min(...everyDay.map((d) => d.startMs))
  const sorted = [...peaks].sort((a, b) => a - b)
  return {
    max: { bpm, days: corroborating, sinceMs: useWindow ? Math.max(first, windowStart) : first },
    typical: { share: sorted[sorted.length >> 1]! / bpm, days: sorted.length },
  }
}
