import { DAY_MS } from '../constants'
import { mulberry32 } from '../math'
import type { Activity, Sport } from '../types'
import { DEFAULT_ATHLETE } from './athlete'
import type { SyntheticAthlete } from './athlete'
import { generateActivity } from './generate'
import type { Effort, Terrain } from './spec'

const HOUR_MS = 3_600_000
/** Fixed reference time, so the sample data is the same on every run. */
const SAMPLE_END_MS = 1_750_000_000_000
const SAMPLE_RIDE_HOUR = 7

interface SampleEntry {
  name: string
  sport: Sport
  effort: Effort
  terrain: Terrain
  minutes: number
  daysBefore: number
  withPower?: boolean
  hrGlitch?: boolean
}

/** Oldest first. All dates fall within the eight weeks before SAMPLE_END_MS. */
const SAMPLE_ENTRIES: readonly SampleEntry[] = [
  {
    name: 'Morning Run',
    sport: 'run',
    effort: 'easy',
    terrain: 'flat',
    minutes: 45,
    daysBefore: 55,
  },
  {
    name: 'Saturday Long Ride',
    sport: 'ride',
    effort: 'easy',
    terrain: 'rolling',
    minutes: 120,
    daysBefore: 53,
  },
  { name: 'Lunch Run', sport: 'run', effort: 'easy', terrain: 'flat', minutes: 45, daysBefore: 50 },
  {
    name: 'Sunday Long Run',
    sport: 'run',
    effort: 'easy',
    terrain: 'rolling',
    minutes: 70,
    daysBefore: 48,
  },
  {
    name: 'Tempo Ride',
    sport: 'ride',
    effort: 'tempo',
    terrain: 'rolling',
    minutes: 90,
    daysBefore: 46,
  },
  {
    name: 'Tempo Run',
    sport: 'run',
    effort: 'tempo',
    terrain: 'flat',
    minutes: 50,
    daysBefore: 43,
  },
  {
    name: 'VO2 Intervals',
    sport: 'ride',
    effort: 'intervals',
    terrain: 'flat',
    minutes: 75,
    daysBefore: 40,
  },
  {
    name: 'Track Intervals',
    sport: 'run',
    effort: 'intervals',
    terrain: 'flat',
    minutes: 55,
    daysBefore: 37,
  },
  {
    name: 'Power Test',
    sport: 'ride',
    effort: 'test',
    terrain: 'flat',
    minutes: 110,
    daysBefore: 34,
  },
  {
    name: '5K and 10K Time Trials',
    sport: 'run',
    effort: 'test',
    terrain: 'flat',
    minutes: 100,
    daysBefore: 31,
  },
  {
    name: 'Mountain Climb',
    sport: 'ride',
    effort: 'tempo',
    terrain: 'climb',
    minutes: 80,
    daysBefore: 28,
    withPower: false,
  },
  {
    name: 'Evening Ride',
    sport: 'ride',
    effort: 'tempo',
    terrain: 'rolling',
    minutes: 90,
    daysBefore: 25,
    hrGlitch: true,
  },
  {
    name: 'Canyon Climb',
    sport: 'ride',
    effort: 'tempo',
    terrain: 'climb',
    minutes: 80,
    daysBefore: 20,
  },
  {
    name: 'Hill Repeats',
    sport: 'ride',
    effort: 'intervals',
    terrain: 'climb',
    minutes: 70,
    daysBefore: 12,
  },
]

/** Sample activities for the "Try sample data" button. Deterministic for a given seed. */
export function sampleDataset(seed = 1): { athlete: SyntheticAthlete; activities: Activity[] } {
  const rand = mulberry32(seed)
  const activities = SAMPLE_ENTRIES.map((entry, index) =>
    generateActivity(
      DEFAULT_ATHLETE,
      {
        id: `sample-${String(index + 1).padStart(2, '0')}`,
        name: entry.name,
        sport: entry.sport,
        startMs: SAMPLE_END_MS - entry.daysBefore * DAY_MS + SAMPLE_RIDE_HOUR * HOUR_MS,
        durationS: entry.minutes * 60,
        effort: entry.effort,
        terrain: entry.terrain,
        withPower: entry.withPower,
        hrGlitch: entry.hrGlitch,
      },
      Math.floor(rand() * 0x100000000),
    ),
  )
  return { athlete: DEFAULT_ATHLETE, activities }
}
