import { describe, expect, it } from 'vitest'
import { DAY_MS } from '@rca/core/constants'
import { weekEndMs } from '@rca/core/digest/trendPoints'
import type { ActivitySummary } from '@rca/core/pipeline'
import { weeklyVolume } from './weeklyVolume'

/**
 * The hours strip under the Balance trend is worked out in the page's render, over every activity of the
 * period and the weeks of the trend. For 2,000 activities and the trend's 200 weeks it takes under a
 * millisecond locally: one lookup per activity. The budget is twenty times that, so a search of the
 * weeks for each activity, or a pass over the activities for each week, fails it.
 */
const BUDGET_MS = 15
const ACTIVITIES = 2000
const WEEKS = 200
const START_MS = Date.UTC(2021, 0, 4, 7)

/** Ten activities a week, runs and rides alternating, each of an hour or so. */
function library(): ActivitySummary[] {
  return Array.from({ length: ACTIVITIES }, (_, i) => ({
    id: `activity-${i}`,
    name: `Activity ${i}`,
    sport: i % 2 === 0 ? 'run' : 'ride',
    startMs: START_MS + Math.floor(i / 10) * 7 * DAY_MS + (i % 7) * DAY_MS,
    durationS: 3600 + (i % 5) * 600,
    distanceM: 10_000,
    elevationGainM: 80,
    hasHeartRate: true,
    indoor: false,
    powerSource: 'none',
    flags: [],
    flagCounts: {},
    maxHeartRate: 170,
  }))
}

/** The end of each week from the first activity's, as a trend of WEEKS points ends them. */
function weekEnds(): number[] {
  const first = weekEndMs(START_MS)
  return Array.from({ length: WEEKS }, (_, week) => first + week * 7 * DAY_MS)
}

/** The fastest of seven timed calls, ms, so neither the cold first call nor a stray pause counts. */
function fastestMs(run: () => void): number {
  let fastest = Infinity
  for (let i = 0; i < 7; i++) {
    const start = performance.now()
    run()
    fastest = Math.min(fastest, performance.now() - start)
  }
  return fastest
}

describe('weekly volume performance', () => {
  const activities = library()
  const ends = weekEnds()

  it(`sums the hours of ${ACTIVITIES} activities over ${WEEKS} weeks in under ${BUDGET_MS} ms`, () => {
    let hours = 0
    const ms = fastestMs(() => {
      hours = weeklyVolume(activities, ends)?.length ?? 0
    })
    // Keeping the result means none of the timed work can be skipped.
    expect(hours).toBe(WEEKS)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
