import { dayPart } from '../import/names'
import type { Sport } from '../types'

/**
 * What the sample's sessions are called. A real athlete's list is mostly a watch's default ("Morning Run") with
 * a title now and then, so each kind of session draws from a small pool and an empty entry takes the default for
 * the hour. No name is in more than a quarter of the list (sampleSeason.test.ts checks).
 */

export type NameKind =
  | 'easyRun'
  | 'longRun'
  | 'tempoRun'
  | 'intervalRun'
  | 'treadmillRun'
  | 'easyRide'
  | 'longRide'
  | 'tempoRide'
  | 'intervalRide'
  | 'climbRide'
  | 'commute'

const DEFAULT = ''

const POOLS: Record<NameKind, readonly string[]> = {
  easyRun: [DEFAULT, DEFAULT, 'Easy Run', 'Recovery Run', 'Shakeout', 'Park Loop', 'Canal Path'],
  longRun: [
    'Long Run',
    'Sunday Long Run',
    DEFAULT,
    'Ridge Trail Run',
    'Reservoir Loop',
    'Long Run with the group',
  ],
  tempoRun: ['Tempo Run', 'Threshold Run', 'Steady State', 'Tempo Miles'],
  intervalRun: ['Track Intervals', 'Fartlek', '6 x 800 m', 'Hill Strides'],
  treadmillRun: ['Treadmill Run', 'Treadmill, 40 min', 'Gym Treadmill'],
  easyRide: [DEFAULT, 'Easy Spin', 'Recovery Ride', 'Coffee Ride'],
  longRide: ['Long Ride', 'Saturday Long Ride', DEFAULT, 'Coast Ride', 'Farm Loop', 'Group Ride'],
  tempoRide: ['Tempo Ride', 'Sweet Spot', 'Threshold Ride', 'Steady Ride'],
  intervalRide: ['VO2 Intervals', 'Hill Repeats', 'Over-Unders', '4 x 8 min'],
  climbRide: ['Canyon Climb', 'Mountain Climb', 'Pass Climb'],
  commute: ['Commute', 'Ride to work', DEFAULT],
}

const SPORT_WORD: Record<Sport, string> = { run: 'Run', ride: 'Ride' }

/** The name of a session of `kind` starting at a local `hour` (0 to 24), by a draw in [0, 1). */
export function sampleName(kind: NameKind, sport: Sport, hour: number, draw: number): string {
  const pool = POOLS[kind]
  const chosen = pool[Math.min(pool.length - 1, Math.floor(draw * pool.length))]!
  return chosen === DEFAULT ? `${dayPart(Math.floor(hour) % 24)} ${SPORT_WORD[sport]}` : chosen
}
