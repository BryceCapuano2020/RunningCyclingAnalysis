import { describe, expect, it } from 'vitest'
import { DAY_MS, DEFAULT_BIKE_MODEL } from '../constants'
import { PeriodCache } from '../periodCache'
import { fastestMs } from '../test/timing'
import { changeEvidence } from './evidence'
import { effortLibrary, MONDAY, SETTINGS } from './test/library'

/**
 * What the change test costs on a library of 2,000 activities (a run or a ride in four of every five, about 8 a week over
 * five years), for the longest period that has one before it, a year against the year before: one pass over the two
 * years' digests to read each activity at each of the 21 lengths, and 2,000 deals of the pooled efforts at each. A
 * repeated period is found in the cache and costs a comparison of two lists. Locally the first takes about 10 ms; the
 * budgets are several times that, so a pass over every pair of efforts, or a sort for every deal, fails them.
 */
const WEEKS = 260
const FIRST_BUDGET_MS = 100
const REPEAT_BUDGET_MS = 2

describe('the change test on a large library', () => {
  const library = [
    ...effortLibrary({ sport: 'run', perWeek: 4, weeks: WEEKS, seed: 1 }),
    ...effortLibrary({ sport: 'ride', perWeek: 4, weeks: WEEKS, seed: 2 }),
  ]
  const cut = MONDAY + (WEEKS - 52) * 7 * DAY_MS
  const from = cut - 52 * 7 * DAY_MS
  const selected = library.filter((d) => d.startMs >= cut)
  const previous = library.filter((d) => d.startMs >= from && d.startMs < cut)

  it('holds about 2,000 activities, and a year against a year in under the budget', () => {
    expect(library.length).toBeGreaterThan(1900)
    const ms = fastestMs(() => {
      changeEvidence(selected, previous, SETTINGS, DEFAULT_BIKE_MODEL, null)
    })
    expect(ms).toBeLessThan(FIRST_BUDGET_MS)
  })

  it('costs next to nothing for a period it has just worked out', () => {
    const cache = new PeriodCache()
    cache.change(selected, previous, SETTINGS, DEFAULT_BIKE_MODEL, null)
    const ms = fastestMs(() => {
      cache.change(selected, previous, SETTINGS, DEFAULT_BIKE_MODEL, null)
    })
    expect(ms).toBeLessThan(REPEAT_BUDGET_MS)
  })
})
