import { DAY_MS } from '../../constants'
import { digestActivity } from '../../digest/digestActivity'
import { DEFAULT_ATHLETE, generateActivity } from '../../synthetic'
import type { Effort } from '../../synthetic'
import type { ActivityDigest, Sport } from '../../types'

/** The newest day of every library here, so a window's age is a plain number of days before it. */
export const NEWEST_MS = Date.UTC(2026, 5, 1, 7)

const SEEDS = { run: 11, ride: 12 } satisfies Record<Sport, number>
const sources = new Map<string, ActivityDigest>()

/** A digested hour of a sport at an effort (a test lasts two hours, long enough for its 20 min hold); its copies are dated with `copyOn`. Rides carry power, and a heart rate only when asked. */
function source(sport: Sport, effort: Effort, heartRate: boolean): ActivityDigest {
  const key = `${sport}/${effort}/${heartRate}`
  let digest = sources.get(key)
  if (digest === undefined) {
    digest = digestActivity(
      generateActivity(
        DEFAULT_ATHLETE,
        {
          id: key,
          name: key,
          sport,
          startMs: NEWEST_MS,
          durationS: effort === 'test' ? 7200 : 3600,
          effort,
          terrain: 'flat',
          withPower: true,
          withHeartRate: heartRate,
        },
        SEEDS[sport],
      ),
    )
    sources.set(key, digest)
  }
  return digest
}

function copyOn(base: ActivityDigest, daysAgo: number, id: string): ActivityDigest {
  return { ...base, id, name: id, startMs: NEWEST_MS - daysAgo * DAY_MS }
}

export interface AthleteShape {
  /** How many days the athlete trained for, counting back from `from`. */
  spanDays: number
  /** Days before the newest day that the training starts counting back from. */
  from?: number
  /** The sports done, each every third day. */
  sports?: Sport[]
  /** Days before the newest of runs at a hard effort, between the easy ones. */
  hardRuns?: number[]
}

/**
 * A runner and a rider who train every third day: easy runs with a heart rate, and rides whose power meter gives a best 20 min
 * but whose heart rate is not recorded, so the gate has nothing to judge of them and counts them. Hard runs (a test effort)
 * are dated by `hardRuns`, on days between the easy ones.
 */
export function athlete({
  spanDays,
  from = 0,
  sports = ['run', 'ride'],
  hardRuns = [],
}: AthleteShape): ActivityDigest[] {
  const days = Array.from({ length: Math.ceil(spanDays / 3) }, (_, i) => from + i * 3)
  const easy = sports.flatMap((sport) =>
    days.map((day) =>
      sport === 'run'
        ? copyOn(source('run', 'easy', true), day, `easy-run-${day}`)
        : copyOn(source('ride', 'tempo', false), day, `ride-${day}`),
    ),
  )
  const hard = hardRuns.map((day) => copyOn(source('run', 'test', true), day, `hard-run-${day}`))
  return [...easy, ...hard]
}

/** Days before the newest of `count` hard runs, one every third day from the day after `from`. */
export function hardRunsFrom(from: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => from + 1 + i * 3)
}
