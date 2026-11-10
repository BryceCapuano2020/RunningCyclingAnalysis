import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { WEEK_MS, endOfLocalDay, weekEndInstant } from '../calendar'
import type { Measurement } from '../athlete/measurements'
import type { ThresholdStep } from '../digest/thresholdTimelineTypes'
import { flatSpeedOfWkg, ridePowerOfWkg } from '../display'
import type { AthleteSettings } from '../types'
import { settledThresholds } from './settleThresholds'
import { estimatesOf } from './test/estimates'
import { noon } from './test/zoneDigests'
import { zonesAt } from './zones'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const FIGURES = {
  runCp: null,
  rideCp: null,
  runMaxHeartRate: 190,
  rideMaxHeartRate: 180,
  runObservedMaxHeartRate: 190,
  rideObservedMaxHeartRate: 180,
}
/** A Sunday's end on the week axis, the label a step is dated by. */
const SUNDAY = Date.UTC(2025, 5, 1, 23, 59, 59, 999)
const week = (n: number) => SUNDAY + n * WEEK_MS

const fit = (cp: number) => ({ cp, cpSe: 0.1 })
const step = (weekN: number, cp: number | null, lastFit: number, asOfMs: number | null = null) =>
  ({
    fromMs: week(weekN),
    fit: cp === null ? null : fit(cp),
    asOfMs,
    lastFit,
  }) satisfies ThresholdStep

const find = (sets: ReturnType<typeof zonesAt>, measure: string) =>
  sets.find((set) => set.measure === measure)

describe('the window a pace or power zone set is the threshold of', () => {
  // The run's threshold moves at week 6 and holds; the ride's has a window with no effort after week 2.
  const timeline = settledThresholds(
    {
      run: [step(0, 14, 0), step(3, 14.05, 1), step(6, 16, 2), step(9, 16.05, 3)],
      ride: [step(0, 3.5, 0, week(-1)), step(2, null, 0)],
    },
    week(40),
  )
  const estimates = { ...estimatesOf(FIGURES), thresholds: timeline }
  const on = (n: number, startMs = week(n) - 3 * DAY_MS) => zonesAt(startMs, SETTINGS, estimates)

  it('is the end of the week the fit was taken over, as an instant in the viewer’s zone', () => {
    expect(find(on(0), 'pace')!.windowEndMs).toBe(weekEndInstant(week(0)))
    // Within error of the first, the second window's fit is not what the zones are cut from: the first's is.
    const held = find(on(3), 'pace')!
    expect(held.windowEndMs).toBe(weekEndInstant(week(0)))
    expect(held.reference).toBe(flatSpeedOfWkg(14))
    const moved = find(on(7), 'pace')!
    expect(moved.windowEndMs).toBe(weekEndInstant(week(6)))
    expect(moved.reference).toBe(flatSpeedOfWkg(16))
    expect(new Date(moved.windowEndMs!).getUTCDay()).toBe(0)
  })

  it('names the older window while it stands in for a window with no fit', () => {
    const power = find(on(5), 'power')!
    // The step is week 0's, but the ride's newest activity was a week before its Sunday: the window ends on that day.
    expect(power).toMatchObject({ asOfMs: week(-1), windowEndMs: endOfLocalDay(week(-1)) })
    expect(power.reference).toBe(Math.round(ridePowerOfWkg(3.5, 70)))
  })

  it('ends on the day of the newest activity while its week has not ended', () => {
    // The newest run was on a Tuesday and the Sunday that ends its week is still to come.
    const tuesday = Date.UTC(2025, 4, 27, 14, 30)
    const adopted = settledThresholds({ run: [step(0, 14, 0, tuesday)], ride: [] }, week(40))
    const sets = zonesAt(tuesday, SETTINGS, { ...estimatesOf(FIGURES), thresholds: adopted })
    const end = find(sets, 'pace')!.windowEndMs!
    expect(end).toBeLessThanOrEqual(endOfLocalDay(tuesday))
    expect(end).toBeLessThan(weekEndInstant(week(0)))
    expect(new Date(end).getUTCDay()).toBe(2)
  })

  it('is absent for an entered threshold and for a heart rate', () => {
    const entries: Measurement[] = [
      { kind: 'thresholdPace', sport: 'run', value: 3.5, from: '2020-01-01' },
    ]
    const sets = zonesAt(week(7), { ...SETTINGS, measurements: entries }, estimates)
    expect(find(sets, 'pace')).toMatchObject({ source: 'entered', windowEndMs: null })
    expect(sets.filter((set) => set.measure === 'heartRate').map((set) => set.windowEndMs)).toEqual(
      [null, null],
    )
  })

  it('has no zones, and no best standing in, once the older window is a year old', () => {
    // The ride's newest effort was in week -1; a year and a week on it has lapsed, whatever bests the library holds.
    const lapsed = zonesAt(noon(2026, 6, 20), SETTINGS, estimates)
    expect(find(lapsed, 'power')).toBeUndefined()
    expect(find(lapsed, 'pace')).toMatchObject({ windowEndMs: weekEndInstant(week(6)) })
  })
})
