import { describe, expect, it } from 'vitest'
import { DAY_MS } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { flatSpeedToMetabolic } from '@rca/core/metabolic'
import type { ActivitySummary } from '@rca/core/pipeline'
import { weekEndMs } from '@rca/core/digest/trendPoints'
import { gradeWeeks } from './gradeTrend'
import { volumeRowsOf } from './monthlyVolume'
import type { ChartSize } from './chartTypes'
import { PLOT_BOTTOM_WITHOUT_X_TITLE, plotBoxOf } from './plotBox'
import { sharedTrendLayout } from './sharedTrendLayout'
import { trendRowsOf } from './sharedTrendRows'
import { trendTakeaway } from './trendTakeaway'
import { weeklyVolume } from '../weeklyVolume'
import { volumeCaption } from '../volumeCaption'
import { weeklyVolumeLayout } from './weeklyVolumeLayout'

/**
 * What the Balance charts do when the trend or the period changes, for an eleven-year library of 2,000 activities
 * (about 570 weekly points): grade every week, thin to months, find the breaks, judge the title on the weeks, lay the
 * trend out at a chart's width, and sum, thin and lay out the hours strip. The page keeps these between renders, so
 * this is the cost of a change, not of every render. It takes about 3 ms locally, most of it the 570 grades. The
 * budget is ten times that, so a pass of the weeks for each week, or a layout that searches, fails it.
 */
const BUDGET_MS = 30
const ACTIVITIES = 2000
const WEEKS = 570
const START_MS = Date.UTC(2014, 0, 6, 7)
const PROFILE = { birthYear: 1985, sex: 'male' } as const

function library(): ActivitySummary[] {
  return Array.from({ length: ACTIVITIES }, (_, i) => ({
    id: `activity-${i}`,
    name: `Activity ${i}`,
    sport: i % 2 === 0 ? 'run' : 'ride',
    startMs: START_MS + Math.floor((i / ACTIVITIES) * WEEKS) * 7 * DAY_MS + (i % 7) * DAY_MS,
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

function trend(): TrendPoint[] {
  const first = weekEndMs(START_MS)
  return Array.from({ length: WEEKS }, (_, week) => {
    const endMs = first + week * 7 * DAY_MS
    return {
      endMs,
      runWkg: flatSpeedToMetabolic(3.6 + (week % 40) / 100),
      rideWkg: null,
      runCount: 2,
      rideCount: 0,
      runAtMs: endMs - 2 * DAY_MS,
      rideAtMs: null,
      rideRunSpeed: null,
    }
  })
}

const SIZE: ChartSize = {
  width: 1000,
  height: 340,
  plot: plotBoxOf(1000, 340, 90, PLOT_BOTTOM_WITHOUT_X_TITLE),
  tooltipId: 't',
  hintId: 'h',
  titleId: 'i',
}

function fastestMs(run: () => void): number {
  let fastest = Infinity
  for (let i = 0; i < 7; i++) {
    const start = performance.now()
    run()
    fastest = Math.min(fastest, performance.now() - start)
  }
  return fastest
}

describe('the Balance trend and hours strip over eleven years', () => {
  it(`are rebuilt from ${WEEKS} weeks and ${ACTIVITIES} activities in under ${BUDGET_MS} ms`, () => {
    const points = trend()
    const activities = library()
    let months = 0
    let bars = 0
    const ms = fastestMs(() => {
      const weeks = gradeWeeks(points, PROFILE)
      const data = trendRowsOf(weeks)
      trendTakeaway(data.weekly, { rideKnown: true })
      months = sharedTrendLayout(data, SIZE)?.xs.length ?? 0
      const volume = weeklyVolume(
        activities,
        points.map((point) => point.endMs),
      )
      if (volume === null) throw new Error('no volume')
      volumeCaption(volume)
      bars = weeklyVolumeLayout(volumeRowsOf(volume).rows, SIZE)?.bars.length ?? 0
    })
    expect(months).toBeGreaterThan(100)
    expect(months).toBeLessThan(WEEKS / 3)
    expect(bars).toBe(months)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
