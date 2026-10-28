import { DAY_MS } from '@rca/core/constants'
import { describe, expect, it } from 'vitest'
import { makeActivity } from './components/fixtures'
import {
  MIN_TRAINING_WEEKS,
  formatHours,
  hoursOf,
  totalSeconds,
  weeklyVolume,
} from './weeklyVolume'

/** Sunday 12 January 2025, 23:59:59.999 UTC: the end of the first week, as the trend dates it. */
const FIRST_END = Date.UTC(2025, 0, 12, 23, 59, 59, 999)
const WEEK_MS = 7 * DAY_MS

/** The ends of n consecutive weeks from the first. */
function weekEnds(n: number): number[] {
  return Array.from({ length: n }, (_, i) => FIRST_END + i * WEEK_MS)
}

/** An activity that starts `days` after Monday 6 January 2025 00:00 UTC, the first week's start. */
function activityOn(days: number, overrides: Parameters<typeof makeActivity>[0] = {}) {
  return makeActivity({
    id: `a-${days}-${overrides.sport ?? 'run'}`,
    startMs: Date.UTC(2025, 0, 6) + days * DAY_MS + 7 * 3600_000,
    movingS: 3600,
    ...overrides,
  })
}

describe('weeklyVolume', () => {
  it('adds each sport’s moving time to the week the activity started in, by the trend’s own weeks', () => {
    const weeks = weeklyVolume(
      [
        activityOn(0, { movingS: 3000, durationS: 4000 }),
        activityOn(6, { movingS: 600 }),
        activityOn(2, { sport: 'ride', movingS: 7200 }),
        activityOn(8, { sport: 'ride', movingS: 3600 }),
        activityOn(15, { movingS: 1800 }),
      ],
      weekEnds(3),
    )
    expect(weeks?.map((week) => week.seconds)).toEqual([
      { run: 3600, ride: 7200 },
      { run: 0, ride: 3600 },
      { run: 1800, ride: 0 },
    ])
    expect(weeks?.map((week) => week.endMs)).toEqual(weekEnds(3))
  })

  it('cuts a week at Sunday midnight UTC, where the trend cuts it', () => {
    const sundayLate = makeActivity({ id: 'late', startMs: FIRST_END, movingS: 100 })
    const mondayFirst = makeActivity({ id: 'early', startMs: FIRST_END + 1, movingS: 200 })
    const weeks = weeklyVolume(
      [sundayLate, mondayFirst, activityOn(14), activityOn(21)],
      weekEnds(4),
    )
    expect(weeks?.[0]?.seconds.run).toBe(100)
    expect(weeks?.[1]?.seconds.run).toBe(200)
  })

  it('times an activity from before moving time was kept by its elapsed time', () => {
    const old = makeActivity({
      id: 'old',
      startMs: Date.UTC(2025, 0, 6, 7),
      durationS: 1800,
    })
    const weeks = weeklyVolume([old, activityOn(7), activityOn(14)], weekEnds(3))
    expect(weeks?.[0]?.seconds.run).toBe(1800)
  })

  it('leaves out an activity that falls outside the trend’s weeks', () => {
    const weeks = weeklyVolume(
      [
        activityOn(-1, { movingS: 9999 }),
        activityOn(0),
        activityOn(7),
        activityOn(14),
        activityOn(70),
      ],
      weekEnds(3),
    )
    expect(weeks?.map(totalSeconds)).toEqual([3600, 3600, 3600])
  })

  it('keeps a week with no training as a week of zeros, so the strip shows the gap', () => {
    const weeks = weeklyVolume([activityOn(0), activityOn(14), activityOn(21)], weekEnds(4))
    expect(weeks).toHaveLength(4)
    expect(weeks?.[1] && totalSeconds(weeks[1])).toBe(0)
  })

  it(`folds away with fewer than ${MIN_TRAINING_WEEKS} weeks with training, however many weeks there are`, () => {
    const two = [activityOn(0), activityOn(14)]
    expect(weeklyVolume(two, weekEnds(8))).toBeNull()
    expect(weeklyVolume([...two, activityOn(21)], weekEnds(8))).not.toBeNull()
    expect(weeklyVolume([], [])).toBeNull()
  })

  it('writes hours to one decimal', () => {
    expect(hoursOf(5400)).toBe(1.5)
    expect(formatHours(11_700)).toBe('3.3')
    expect(formatHours(0)).toBe('0.0')
  })
})
