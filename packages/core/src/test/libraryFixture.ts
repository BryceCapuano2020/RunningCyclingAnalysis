import { DAY_MS } from '../constants'
import { digestActivity } from '../digest/digestActivity'
import { DEFAULT_ATHLETE, generateActivity } from '../synthetic'
import type { ActivitySpec } from '../synthetic'
import type { ActivityDigest } from '../types'

const START_MS = Date.UTC(2021, 0, 4, 7)
const SESSIONS_PER_WEEK = 10
const TEMPLATES = 24

/**
 * The efforts the templates of a library with hard efforts cycle through, one for each pair of templates (a run and a
 * ride), so every sport has all four. Five in eight are easy: a library whose typical day is at its maximum heart rate has
 * a reference that cannot show an effort hard (the effort gate), and its thresholds would be withheld.
 */
const HARD_LIBRARY_EFFORTS = [
  'easy',
  'easy',
  'tempo',
  'easy',
  'intervals',
  'easy',
  'test',
  'easy',
] as const

/**
 * One of the few activities a large library is copied from: runs and rides of every effort and terrain. By default the runs
 * have only easy and interval efforts and the rides only tempo and test, which the effort gate reads as no hard 20 minutes in
 * either sport (the runs' typical day sits at their maximum, the rides' best 20 minutes under the hard line), so no fit
 * survives. With `hard`, the efforts cycle through HARD_LIBRARY_EFFORTS and a test lasts two hours, which is long enough for its
 * 20 minute hold, and the library has thresholds.
 */
function template(i: number, hard: boolean): ActivityDigest {
  const sport = i % 2 === 0 ? 'run' : 'ride'
  const effort = hard
    ? HARD_LIBRARY_EFFORTS[Math.floor(i / 2) % HARD_LIBRARY_EFFORTS.length]!
    : (['easy', 'tempo', 'intervals', 'test'] as const)[i % 4]!
  const spec: ActivitySpec = {
    id: `template-${i}`,
    name: `Template ${i}`,
    sport,
    startMs: START_MS,
    durationS: hard && effort === 'test' ? 7200 : i % 8 === 0 ? 7200 : i % 2 === 0 ? 3600 : 4500,
    effort,
    terrain: (['flat', 'rolling', 'climb'] as const)[i % 3]!,
    withPower: sport === 'ride' ? i % 5 !== 0 : undefined,
    hrGlitch: i % 13 === 0,
  }
  return digestActivity(generateActivity(DEFAULT_ATHLETE, spec, i + 1))
}

/**
 * A library of `count` digests, ten a week from January 2021, alternating runs and rides. Each is a
 * copy of one of 24 digested activities with its own id, name and start, so a library of thousands
 * costs the digesting of 24 and is the same every time. The copies share their curves and evidence,
 * as no two digests of a real library do, which changes the memory but not the work done on them. With `hard` it has hard
 * efforts in both sports (see `template`).
 */
export function copiedLibrary(count: number, options: { hard?: boolean } = {}): ActivityDigest[] {
  const templates = Array.from({ length: TEMPLATES }, (_, i) => template(i, options.hard === true))
  return Array.from({ length: count }, (_, i) => {
    const source = templates[i % TEMPLATES]!
    const week = Math.floor(i / SESSIONS_PER_WEEK)
    const day = i % SESSIONS_PER_WEEK
    return {
      ...source,
      id: `library-${i}`,
      name: `Library ${i}`,
      // Two sessions a day at most, hours apart, so no two copies read as one workout.
      startMs: START_MS + (week * 7 + (day % 7)) * DAY_MS + Math.floor(day / 7) * 36_000_000,
    }
  })
}
