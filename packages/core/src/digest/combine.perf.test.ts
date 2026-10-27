import { describe, expect, it } from 'vitest'
import { DEFAULT_ATHLETE, generateActivity } from '../synthetic'
import type { AthleteSettings } from '../types'
import { fastestMs } from '../test/timing'
import { combine } from './combine'
import { digestActivity } from './digestActivity'

/**
 * A combine of the benchmark's library, 1,000 activities of runs and rides over five years, took about
 * 30 ms. Each running equivalent it works out costs one sort of the 4,000 draws, so an equivalent added
 * for every duration costs a few ms more; the budget leaves room for a loaded runner, while about half
 * as much again still fails it. The grade by duration prices its own extra durations, outside combine.
 */
const BUDGET_MS = 45
const ACTIVITIES = 1000
const SESSIONS_PER_WEEK = 4
const DAY_MS = 86_400_000
const START_MS = Date.UTC(2021, 0, 1)
const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

/** The benchmark's library: alternating runs and rides, an hour or so each, a two-hour one every eighth. */
function library() {
  return Array.from({ length: ACTIVITIES }, (_, i) => {
    const week = Math.floor(i / SESSIONS_PER_WEEK)
    const weekday = (i % SESSIONS_PER_WEEK) * 2
    const sport = i % 2 === 0 ? 'run' : 'ride'
    const activity = generateActivity(
      DEFAULT_ATHLETE,
      {
        id: `perf-${i}`,
        name: `Perf ${i}`,
        sport,
        startMs: START_MS + (week * 7 + weekday) * DAY_MS,
        durationS: i % 8 === 0 ? 7200 : i % 2 === 0 ? 3600 : 4500,
        effort: (['easy', 'tempo', 'intervals', 'test'] as const)[i % 4]!,
        terrain: (['flat', 'rolling', 'climb'] as const)[i % 3]!,
        withPower: sport === 'ride' ? i % 5 !== 0 : undefined,
        hrGlitch: i % 13 === 0,
      },
      i + 1,
    )
    return digestActivity(activity)
  })
}

describe('combine performance', () => {
  it(`combines a library of ${ACTIVITIES} activities in under ${BUDGET_MS} ms`, () => {
    const digests = library()
    // Keeping the result means none of the timed work can be skipped.
    let equivalents = 0
    const ms = fastestMs(() => {
      equivalents = combine(digests, SETTINGS).equivalents.length
    })
    expect(equivalents).toBeGreaterThan(0)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
