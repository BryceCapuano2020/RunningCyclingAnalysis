import { describe, expect, it } from 'vitest'
import './test/deviceZone'
import { DAY_MS } from './constants'
import { digestActivity } from './digest'
import { isCustomChoice, orderedRange, dayStartMs, dayOf } from './customRange'
import {
  DEFAULT_PERIOD_DAYS,
  DEFAULT_PERIOD_WEEKS,
  MAX_PERIOD_DAYS,
  periodChoiceOf,
  periodDays,
  periodOf,
  sameChoice,
  sameRegime,
  splitPeriods,
  startedWithin,
  windowEnding,
} from './period'
import type { Period } from './period'
import { sampleDataset } from './synthetic'
import type { Activity, ActivityDigest, Sport } from './types'

const sample = sampleDataset().activities
const NEWEST = Date.UTC(2025, 5, 30, 12)

/** The last millisecond of the local day that holds ms. */
function endOfDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(23, 59, 59, 999)
  return date.getTime()
}

/** The first millisecond of the local day that holds ms. */
function startOfDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** The instant that falls the given number of local calendar days before ms, at the same time of day. */
function daysBefore(ms: number, days: number): number {
  const date = new Date(ms)
  date.setDate(date.getDate() - days)
  return date.getTime()
}

/** A sample activity of one sport, so the digests carry real values of that sport. */
function base(sport: Sport): Activity {
  const found = sample.find((activity) => activity.sport === sport)
  if (found === undefined) throw new Error(`The sample has no ${sport} activity`)
  return found
}

/** A digest of a sample activity of the sport, started at startMs. */
function at(startMs: number, sport: Sport = 'run'): ActivityDigest {
  const digest = digestActivity({ ...base(sport), id: `${sport}-${startMs}`, startMs })
  return { ...digest, id: `${startMs}-${digest.sport}` }
}

describe('windowEnding', () => {
  it('is the calendar days ending on the newest activity’s day, from the first millisecond to the last', () => {
    expect(windowEnding(NEWEST, 42)).toEqual({
      startMs: daysBefore(startOfDay(NEWEST), 41),
      endMs: endOfDay(NEWEST),
    })
  })
})

describe('the default period', () => {
  it('is 12 weeks, the one place the cap is written', () => {
    expect(DEFAULT_PERIOD_WEEKS).toBe(12)
    expect(DEFAULT_PERIOD_DAYS).toBe(84)
  })

  it('dates the window it resolved to: the calendar days up to the newest activity’s day', () => {
    // The library spans more than 12 weeks, so the window is not clipped to its first activity.
    const library = [
      at(NEWEST - 90 * DAY_MS, 'ride'),
      at(NEWEST - 5 * DAY_MS, 'run'),
      at(NEWEST, 'ride'),
    ]
    expect(periodOf(library, 'default', DEFAULT_PERIOD_DAYS)).toEqual({
      choice: 'default',
      startMs: daysBefore(startOfDay(NEWEST), 83),
      endMs: endOfDay(NEWEST),
      days: DEFAULT_PERIOD_DAYS,
      fellBack: false,
    })
    expect(periodOf(library, 'default', 365)).toMatchObject({
      choice: 'default',
      startMs: daysBefore(startOfDay(NEWEST), 364),
      days: 365,
      fellBack: false,
    })
  })

  it('starts on the same day whether the newest activity is at 06:00 or at 12:00', () => {
    // A run 83 calendar days before the newest day, then the newest ride on that day at 06:00 or 12:00.
    const newestDay = new Date(2025, 5, 30).getTime()
    const run = at(daysBefore(newestDay, 83) + 9 * 3_600_000, 'run')
    const early = periodOf([run, at(newestDay + 6 * 3_600_000, 'ride')], 'default', 84)
    const late = periodOf([run, at(newestDay + 12 * 3_600_000, 'ride')], 'default', 84)
    expect(early.startMs).toBe(daysBefore(startOfDay(newestDay), 83))
    expect(late.startMs).toBe(early.startMs)
    expect(early.days).toBe(DEFAULT_PERIOD_DAYS)
    expect(late.days).toBe(DEFAULT_PERIOD_DAYS)
  })

  it('is all time, dated from the first activity, where it resolved to all time or to nothing', () => {
    const first = NEWEST - 4000 * DAY_MS
    const library = [at(first, 'run'), at(NEWEST - 2400 * DAY_MS, 'ride'), at(NEWEST, 'ride')]
    const allTime = {
      choice: 'default',
      startMs: first,
      endMs: endOfDay(NEWEST),
      days: null,
      fellBack: true,
    }
    expect(periodOf(library, 'default', 'all')).toEqual(allTime)
    expect(periodOf(library, 'default')).toEqual(allTime)
  })

  it('ignores the resolved window for any choice but the default', () => {
    const library = [at(NEWEST - 90 * DAY_MS, 'ride'), at(NEWEST, 'run')]
    expect(periodOf(library, 42, 365)).toEqual(periodOf(library, 42))
    expect(periodOf(library, 'all', 365)).toEqual(periodOf(library, 'all'))
  })
})

describe('periodOf', () => {
  const visible = [at(NEWEST, 'run'), at(NEWEST - 10 * DAY_MS, 'ride')]

  it('dates a number of calendar days back from the newest activity’s day, to the end of that day', () => {
    expect(periodOf(visible, 42)).toEqual({
      choice: 42,
      startMs: daysBefore(startOfDay(NEWEST), 41),
      endMs: endOfDay(NEWEST),
      days: 42,
      fellBack: false,
    })
  })

  it('dates all time from the first activity to the end of the newest activity’s day', () => {
    expect(periodOf(visible, 'all')).toEqual({
      choice: 'all',
      startMs: NEWEST - 10 * DAY_MS,
      endMs: endOfDay(NEWEST),
      days: null,
      fellBack: false,
    })
  })

  it('has no dates for an empty library', () => {
    expect(periodOf([], 'default')).toEqual({
      choice: 'default',
      startMs: null,
      endMs: null,
      days: null,
      fellBack: false,
    })
  })

  it('takes in an activity later on the newest activity’s day, 11 hours on, as part of the period', () => {
    // The morning run and the evening ride share a local day, and the ride is the newest activity.
    const morning = new Date(2025, 5, 30, 8).getTime()
    const evening = morning + 11 * 3_600_000
    const both = [at(morning, 'run'), at(evening, 'ride')]
    const { selected, period } = splitPeriods(both, 'all')
    expect(period.endMs).toBe(endOfDay(evening))
    expect(selected).toHaveLength(2)
  })
})

describe('splitPeriods', () => {
  const visible = [at(NEWEST), at(NEWEST - 10 * DAY_MS), at(NEWEST - 30 * DAY_MS)]

  it('selects the last days up to the newest activity’s day, and the same number of days before it', () => {
    const { selected, previous, period } = splitPeriods(visible, 7)
    expect(period.startMs).toBe(daysBefore(startOfDay(NEWEST), 6))
    expect(selected.map((d) => d.startMs)).toEqual([NEWEST])
    expect(previous.map((d) => d.startMs)).toEqual([NEWEST - 10 * DAY_MS])
  })

  it('selects everything for all time, with no period before it', () => {
    const { selected, previous, period } = splitPeriods(visible, 'all')
    expect(selected).toEqual(visible)
    expect(previous).toEqual([])
    expect(period.days).toBeNull()
  })

  it('selects the window the default resolved to, and the same number of days before its start', () => {
    const inside = at(NEWEST - 50 * DAY_MS, 'run')
    const before = at(NEWEST - 120 * DAY_MS, 'ride')
    const outside = at(NEWEST - 200 * DAY_MS, 'run')
    const library = [inside, before, outside, at(NEWEST, 'ride')]
    const { selected, previous, period } = splitPeriods(library, 'default', DEFAULT_PERIOD_DAYS)
    expect(period.days).toBe(DEFAULT_PERIOD_DAYS)
    expect(selected.map((d) => d.startMs)).toEqual([inside.startMs, NEWEST])
    expect(previous.map((d) => d.startMs)).toEqual([before.startMs])
    // A year back takes in all of them and has no digest before it.
    const year = splitPeriods(library, 'default', 365)
    expect(year.selected).toHaveLength(4)
    expect(year.previous).toEqual([])
  })

  it('gives a one-sport library the previous 12 weeks, like any other', () => {
    const { selected, previous } = splitPeriods(
      [at(NEWEST - 100 * DAY_MS, 'run'), at(NEWEST - 5 * DAY_MS, 'run'), at(NEWEST, 'run')],
      'default',
      84,
    )
    expect(selected).toHaveLength(2)
    expect(previous).toHaveLength(1)
  })

  it('gives nothing for an empty library', () => {
    expect(splitPeriods([], 7)).toEqual({ period: periodOf([], 7), selected: [], previous: [] })
  })
})

describe('startedWithin', () => {
  const items = [
    { startMs: NEWEST },
    { startMs: NEWEST - 10 * DAY_MS },
    { startMs: NEWEST - 50 * DAY_MS },
  ]

  it('keeps the items started within the calendar days counted back from the newest', () => {
    expect(startedWithin(items, 42)).toEqual(items.slice(0, 2))
  })

  it('keeps every item for all time', () => {
    expect(startedWithin(items, null)).toEqual(items)
  })

  it('keeps nothing from an empty list', () => {
    expect(startedWithin([], 42)).toEqual([])
  })
})

describe('a custom range', () => {
  // 12 May to 3 June 2025 is 23 calendar days; the 23 days before 12 May are the previous period.
  const FROM = '2025-05-12'
  const TO = '2025-06-03'
  const MAY12 = new Date(2025, 4, 12, 12).getTime()
  const JUNE3 = new Date(2025, 5, 3, 12).getTime()
  const JUNE_HOURS = endOfDay(JUNE3)

  it('dates the period from the first millisecond of its first day to the last of its last, and counts the days', () => {
    expect(periodOf([at(MAY12)], { from: FROM, to: TO })).toEqual({
      choice: { from: FROM, to: TO },
      startMs: startOfDay(MAY12),
      endMs: JUNE_HOURS,
      days: 23,
      fellBack: false,
    })
  })

  it('swaps a range whose last day is before its first, so the period reads in order', () => {
    const period = periodOf([at(MAY12)], { from: TO, to: FROM })
    expect(period.choice).toEqual({ from: FROM, to: TO })
    expect(period.days).toBe(23)
    expect(orderedRange({ from: TO, to: FROM })).toEqual({ from: FROM, to: TO })
  })

  it('selects the activities that fall on its days, the last one late in the day included', () => {
    const late = new Date(2025, 5, 3, 22).getTime()
    const outside = new Date(2025, 5, 4, 8).getTime()
    const before = new Date(2025, 4, 11, 20).getTime()
    const { selected } = splitPeriods([at(before), at(MAY12), at(late), at(outside)], {
      from: FROM,
      to: TO,
    })
    expect(selected.map((d) => d.startMs)).toEqual([MAY12, late])
  })

  it('selects the days of the same length before its first day as the previous period', () => {
    const inside = new Date(2025, 4, 1, 9).getTime()
    const tooEarly = new Date(2025, 3, 18, 9).getTime()
    const { previous } = splitPeriods([at(inside), at(tooEarly), at(MAY12)], {
      from: FROM,
      to: TO,
    })
    expect(previous.map((d) => d.startMs)).toEqual([inside])
  })

  it('is allowed to hold no activities, so its selection is empty', () => {
    const quiet = { from: '2024-01-01', to: '2024-01-10' }
    const { selected, previous, period } = splitPeriods([at(MAY12)], quiet)
    expect(selected).toEqual([])
    expect(previous).toEqual([])
    expect(period.days).toBe(10)
  })

  it('tells a range from a number of days, and the same range from another one', () => {
    expect(sameChoice({ from: FROM, to: TO }, { from: FROM, to: TO })).toBe(true)
    expect(sameChoice({ from: FROM, to: TO }, { from: FROM, to: '2025-06-04' })).toBe(false)
    expect(sameChoice({ from: FROM, to: TO }, 23)).toBe(false)
    expect(sameChoice(42, 42)).toBe(true)
    expect(sameChoice('all', 'default')).toBe(false)
  })

  it('reads its own days back through dayOf, so the form and the period agree on them', () => {
    expect(dayOf(MAY12)).toBe(FROM)
    expect(dayOf(JUNE_HOURS)).toBe(TO)
    expect(dayStartMs(FROM)).toBe(startOfDay(MAY12))
  })

  it('accepts only two real days as YYYY-MM-DD, and names no day that rolls over', () => {
    expect(isCustomChoice({ from: FROM, to: TO })).toBe(true)
    expect(isCustomChoice({ from: '2025-06-31', to: TO })).toBe(false)
    expect(isCustomChoice({ from: '12/05/2025', to: TO })).toBe(false)
    expect(isCustomChoice({ from: FROM })).toBe(false)
    expect(isCustomChoice(42)).toBe(false)
    expect(isCustomChoice(null)).toBe(false)
  })

  it('refuses a number of days past the sane maximum, which would date an impossible period', () => {
    expect(periodChoiceOf(MAX_PERIOD_DAYS)).toBe(MAX_PERIOD_DAYS)
    expect(periodChoiceOf(MAX_PERIOD_DAYS + 1)).toBeUndefined()
    expect(periodChoiceOf(1e9)).toBeUndefined()
  })

  it('orders a reversed range even when the library is empty', () => {
    expect(periodOf([], { from: TO, to: FROM }).choice).toEqual({ from: FROM, to: TO })
  })

  it('gives the choice a stored or sent value names, and nothing for anything else', () => {
    expect(periodChoiceOf({ from: FROM, to: TO, extra: 1 })).toEqual({ from: FROM, to: TO })
    expect(periodChoiceOf(42)).toBe(42)
    expect(periodChoiceOf('all')).toBe('all')
    expect(periodChoiceOf('nonsense')).toBeUndefined()
    expect(periodChoiceOf(-3)).toBeUndefined()
    expect(periodChoiceOf({ from: '2025-02-30', to: TO })).toBeUndefined()
  })

  it('dates the first and last day on screen, so the form can start from them', () => {
    expect(periodDays(periodOf([at(MAY12)], { from: FROM, to: TO }))).toEqual({
      from: FROM,
      to: TO,
    })
    expect(periodDays(periodOf([], { from: FROM, to: TO }))).toBeNull()
  })
})

describe('sameRegime', () => {
  const period = (over: Partial<Period>): Period => ({
    choice: 'default',
    startMs: 1,
    endMs: 2,
    days: DEFAULT_PERIOD_DAYS,
    fellBack: false,
    ...over,
  })

  it('holds for windows of one length, whichever choice named them', () => {
    expect(sameRegime(period({}), period({ choice: DEFAULT_PERIOD_DAYS }))).toBe(true)
  })

  it('does not hold between the default window and the all time it falls back to', () => {
    expect(sameRegime(period({}), period({ days: null, fellBack: true }))).toBe(false)
  })

  it('holds between two readings of all time, however the choice named it', () => {
    expect(sameRegime(period({ days: null }), period({ choice: 'all', days: null }))).toBe(true)
  })

  it('holds for one custom range only', () => {
    const a = { from: '2025-01-01', to: '2025-02-01' }
    const b = { from: '2025-01-01', to: '2025-03-01' }
    expect(sameRegime(period({ choice: a, days: 32 }), period({ choice: a, days: 32 }))).toBe(true)
    expect(sameRegime(period({ choice: a, days: 32 }), period({ choice: b, days: 60 }))).toBe(false)
    expect(sameRegime(period({ choice: a, days: 32 }), period({ days: 32 }))).toBe(false)
  })
})
