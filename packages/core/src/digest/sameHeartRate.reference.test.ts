import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { sameHeartRate } from './sameHeartRate'
import { BASE, MONDAY, revised, weeksOf } from './test/sameHeartRateFixture'

const WEEK_MS = 7 * DAY_MS
const NONE = new Set<string>()
const FROM_START = { fromMs: MONDAY }

/** The fitness card's heart rate, which the session gives the weeks to read at (`referenceHr`). */
describe('the weeks at the heart rate the fitness card names', () => {
  it('reads at the heart rate it is given, the fitness card’s, and at its own only when it is given none', () => {
    const steady = weeksOf('ride', 12, () => 1)
    const own = sameHeartRate(steady, NONE, FROM_START).ride
    expect(own.referenceHeartRate).toBe(145)
    const given = sameHeartRate(steady, NONE, { ...FROM_START, referenceHr: { ride: 140 } }).ride
    expect(given.referenceHeartRate).toBe(140)
    // Every reported week is the output at 140 bpm, not at the library's own heart rate.
    const reported = given.weeks.filter((week) => week.fit !== null)
    expect(reported.length).toBeGreaterThan(4)
    for (const week of reported) {
      expect(week.fit!.output / BASE.ride(140)).toBeGreaterThan(0.98)
      expect(week.fit!.output / BASE.ride(140)).toBeLessThan(1.02)
    }
    // A sport the card has no heart rate for is read at its own.
    const none = sameHeartRate(steady, NONE, { ...FROM_START, referenceHr: { ride: null } }).ride
    expect(none.referenceHeartRate).toBe(145)
  })

  it('reads a week over a longer window when the card’s heart rate is outside what its 28 days held, at the one heart rate', () => {
    const higher = (d: { hrBlocks: { heartRate: number }[] }) => ({
      hrBlocks: d.hrBlocks.map((b) => ({
        ...b,
        heartRate: b.heartRate + 25,
        value: BASE.ride(b.heartRate + 25),
      })),
    })
    // Twenty weeks of rides at 124 to 166 bpm, those of weeks 8 to 13 25 bpm higher: 135 bpm is below all their blocks.
    const stretch = revised(
      weeksOf('ride', 20, () => 1),
      (d) =>
        d.startMs >= MONDAY + 8 * WEEK_MS && d.startMs < MONDAY + 14 * WEEK_MS ? higher(d) : {},
    )
    const { weeks, referenceHeartRate } = sameHeartRate(stretch, NONE, {
      ...FROM_START,
      referenceHr: { ride: 135 },
    }).ride
    expect(referenceHeartRate).toBe(135)
    const widened = weeks.filter((week) => week.widenedToDays !== undefined)
    expect(widened.length).toBeGreaterThanOrEqual(2)
    for (const week of widened) {
      expect(week.widenedToDays).toBe(56)
      expect(week.lacks).toBeNull()
      // Read at 135 bpm itself, not at the nearest heart rate its 28 days held.
      expect(week.fit!.output / BASE.ride(135)).toBeGreaterThan(0.97)
      expect(week.fit!.output / BASE.ride(135)).toBeLessThan(1.03)
    }
    // Every week that has a reading is one heart rate, and a week whose 28 days held it is read over 28.
    expect(weeks.filter((week) => week.lacks === 'range')).toEqual([])
    expect(
      weeks.filter((week) => week.widenedToDays === undefined && week.fit !== null).length,
    ).toBeGreaterThan(widened.length)
  })

  it('has no reading for a week that no window reaches the heart rate in, and says so', () => {
    const all = revised(
      weeksOf('ride', 14, () => 1),
      (d) => ({
        hrBlocks: d.hrBlocks.map((b) => ({
          ...b,
          heartRate: b.heartRate + 25,
          value: BASE.ride(b.heartRate + 25),
        })),
      }),
    )
    const { weeks, reportedWeeks } = sameHeartRate(all, NONE, {
      ...FROM_START,
      referenceHr: { ride: 135 },
    }).ride
    expect(weeks.length).toBeGreaterThan(0)
    expect(reportedWeeks).toBe(0)
    expect(weeks.every((w) => w.lacks === 'range' && w.widenedToDays === undefined)).toBe(true)
  })
})
