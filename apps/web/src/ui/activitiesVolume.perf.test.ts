import { describe, expect, it } from 'vitest'
import type { ActivitySummary } from '@rca/core/pipeline'
import { makeActivity } from './components/fixtures'
import { inBucket, monthTotals, volumeBuckets } from './activitiesVolume'
import { sortActivities } from './activitySort'

/**
 * Everything the Activities list works out for its volume strip and month headers runs in a render of
 * the page, so with a library of 2,000 activities it must stay far from a long task (50 ms).
 */
const BUDGET_MS = 25

const DAY_MS = 86_400_000

/** Six years of mixed activities, newest first as the page holds them. */
function library(count: number): ActivitySummary[] {
  const newest = Date.UTC(2025, 5, 1)
  return Array.from({ length: count }, (_, i) =>
    makeActivity({
      id: `a-${i}`,
      sport: i % 3 === 0 ? 'ride' : 'run',
      startMs: newest - Math.floor((i * 6 * 365 * DAY_MS) / count),
      durationS: 1800 + (i % 17) * 300,
      distanceM: 5000 + (i % 23) * 1000,
    }),
  )
}

/** The fastest of five timed calls, ms, so neither the cold first call nor a stray pause counts. */
function fastestMs(run: () => void): number {
  let fastest = Infinity
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    run()
    fastest = Math.min(fastest, performance.now() - start)
  }
  return fastest
}

describe('the Activities list sums for 2,000 activities', () => {
  const activities = library(2000)

  it(`buckets them by month, and by week for the last 20 weeks, in under ${BUDGET_MS} ms`, () => {
    const recent = activities.filter((a) => a.startMs > Date.UTC(2025, 5, 1) - 140 * DAY_MS)
    expect(volumeBuckets(activities)[0]?.kind).toBe('month')
    expect(volumeBuckets(recent)[0]?.kind).toBe('week')
    expect(fastestMs(() => volumeBuckets(activities))).toBeLessThan(BUDGET_MS)
  })

  it(`totals each month, narrows to a week and sorts, in under ${BUDGET_MS} ms`, () => {
    expect(monthTotals(activities).size).toBeGreaterThan(60)
    const ms = fastestMs(() => {
      monthTotals(activities)
      sortActivities(inBucket(activities, 'm:2024-5'), 'distance')
    })
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
