import { describe, expect, it } from 'vitest'
import { DEFAULT_ATHLETE, generateActivity } from '../synthetic'
import type { AthleteSettings } from '../types'
import { fastestMs } from '../test/timing'
import { digestActivity } from './digestActivity'
import { fitnessTrend } from './trend'
import { EFFORT_LENGTHS_S } from './trendPoints'
import { thinTrend } from './trendSeries'

/**
 * The weekly trends of a library of 2,000 activities over eleven years, uncapped, so every week from the
 * first activity is a point (about 570 of them). The page builds one trend for each of the three effort
 * lengths, the headline one with running equivalents. That takes about 60 ms locally, most of it the
 * equivalents, which are priced once for each distinct ride and so cost the same capped or not.
 */
const BUDGET_MS = 150
const ACTIVITIES = 2000
const YEARS = 11
const DAY_MS = 86_400_000
const START_MS = Date.UTC(2014, 0, 1)
const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

function library() {
  const spanDays = YEARS * 365
  return Array.from({ length: ACTIVITIES }, (_, i) => {
    const sport = i % 2 === 0 ? 'run' : 'ride'
    const activity = generateActivity(
      DEFAULT_ATHLETE,
      {
        id: `trend-perf-${i}`,
        name: `Trend perf ${i}`,
        sport,
        startMs: START_MS + Math.floor((i / ACTIVITIES) * spanDays) * DAY_MS,
        durationS: i % 8 === 0 ? 7200 : 3600,
        effort: (['easy', 'tempo', 'intervals', 'test'] as const)[i % 4]!,
        terrain: (['flat', 'rolling', 'climb'] as const)[i % 3]!,
        withPower: sport === 'ride' ? i % 5 !== 0 : undefined,
      },
      i + 1,
    )
    return digestActivity(activity)
  })
}

describe('fitnessTrend performance', () => {
  it(`builds ${YEARS} years of weeks from ${ACTIVITIES} activities in under ${BUDGET_MS} ms for the three effort lengths`, () => {
    const digests = library()
    let weeks = 0
    const ms = fastestMs(() => {
      for (const durationS of EFFORT_LENGTHS_S) {
        weeks = fitnessTrend(digests, SETTINGS, { durationS }).length
      }
    })
    // The span is the library's: no 260-week cap cuts the first years off.
    expect(weeks).toBeGreaterThan(YEARS * 52)
    expect(ms).toBeLessThan(BUDGET_MS)
  })

  it('thins them to months in well under a millisecond', () => {
    const points = fitnessTrend(library(), SETTINGS).map((point) => ({
      endMs: point.endMs,
      run: point.runWkg,
    }))
    let rows = 0
    const ms = fastestMs(() => {
      rows = thinTrend(points, ['run']).rows.length
    })
    expect(rows).toBeLessThan(points.length / 3)
    expect(ms).toBeLessThan(5)
  })
})
