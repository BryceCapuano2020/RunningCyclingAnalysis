import { DAY_MS } from '../../constants'
import { mulberry32 } from '../../math'
import { generateActivity, sampleSeason } from '../../synthetic'
import { SAMPLE_ATHLETE, SAMPLE_NOISE } from '../../synthetic/sampleSeason'
import type { ActivitySpec, Terrain } from '../../synthetic'
import type { Activity } from '../../types'
import { syntheticActivity } from './syntheticActivity'

/**
 * The libraries the mixing study (D12 section 1.8) digests at both revisions. Every one is drawn from fixed seeds
 * and fixed dates, so the same activities come out on every machine and clock. The revision-6 digests of them are
 * checked in (`test/fixtures/rev6`, see `mixingFixtures.ts`), so the study stays a regression test after the code
 * that made them is gone.
 */
export interface StudyLibrary {
  name: string
  activities: Activity[]
}

/** A Monday, 00:00 UTC, which the generated libraries count their weeks from. */
const FIRST_MONDAY_MS = Date.UTC(2025, 0, 6)

/** The sample athlete's own season: runs and rides, a planted slip in easy running, hard efforts and awkward recordings. */
function season(seed: number): Activity[] {
  return sampleSeason(undefined, seed).activities
}

/**
 * Runs on a terrain, three a week: two easy ones, and a tempo run, with a test effort every fourth week so the
 * hard efforts the threshold and the effort gate need are there.
 */
function terrainRuns(
  name: string,
  terrains: readonly Terrain[],
  weeks: number,
  seed: number,
): Activity[] {
  const rand = mulberry32(seed)
  const activities: Activity[] = []
  for (let week = 0; week < weeks; week++) {
    const slots: { day: number; effort: ActivitySpec['effort']; minutes: number }[] = [
      { day: 1, effort: 'easy', minutes: 35 + Math.round(rand() * 20) },
      { day: 3, effort: week % 4 === 3 ? 'test' : 'tempo', minutes: week % 4 === 3 ? 60 : 40 },
      { day: 5, effort: 'easy', minutes: 40 + Math.round(rand() * 25) },
    ]
    slots.forEach((slot, i) => {
      const terrain = terrains[Math.floor(rand() * terrains.length)]!
      const spec: ActivitySpec = {
        id: `${name}-${String(week).padStart(2, '0')}-${i}`,
        name: `${name} ${week}.${i}`,
        sport: 'run',
        startMs: FIRST_MONDAY_MS + (week * 7 + slot.day) * DAY_MS + 7 * 3_600_000,
        durationS: slot.minutes * 60,
        effort: slot.effort,
        terrain,
        withHeartRate: true,
      }
      activities.push(
        generateActivity(SAMPLE_ATHLETE, spec, Math.floor(rand() * 0x100000000), SAMPLE_NOISE),
      )
    })
  }
  return activities
}

/**
 * Steady runs with short steep descents, two a week: a pace that holds from kilometre to kilometre, a heart rate that
 * holds, and three times a climb of 8% for 80 s and then a descent of 8 to 12% for 80 s. A kilometre with one is
 * still one the fitness unit reads (its grade credit stays under 15%), so this is the case where the revision-7
 * descent cost, which saves less below 4%, moves the grade credit of the kilometres the fitness run value is read from.
 */
function descentRuns(weeks: number, seed: number): Activity[] {
  const rand = mulberry32(seed)
  const activities: Activity[] = []
  for (let week = 0; week < weeks; week++) {
    for (let i = 0; i < 2; i++) {
      const n = 2900
      const steep = -(0.08 + 0.04 * rand())
      const gradeAt = (s: number): number => {
        for (const start of [400, 1100, 1800]) {
          if (s >= start && s < start + 80) return 0.08
          if (s >= start + 80 && s < start + 160) return steep
        }
        return 0
      }
      const pace = 3.3 * (1 + 0.03 * (rand() - 0.5))
      const speed = new Float64Array(n).fill(pace)
      const altitude = new Float64Array(n)
      altitude[0] = 300
      for (let s = 1; s < n; s++) altitude[s] = altitude[s - 1]! + gradeAt(s) * pace
      const heartRate = new Float64Array(n).fill(150 + Math.round(6 * rand()))
      activities.push({
        ...syntheticActivity({ id: `descent-${week}-${i}`, n, speed, altitude, heartRate }),
        name: `descent ${week}.${i}`,
        startMs: FIRST_MONDAY_MS + (week * 7 + 2 + i * 3) * DAY_MS + 7 * 3_600_000,
      })
    }
  }
  return activities
}

/** A steady outdoor run of `n` seconds: a pace that holds, a heart rate that holds, a little of each's wobble. */
function steadyRun(
  id: string,
  startMs: number,
  n: number,
  pace: number,
  rand: () => number,
): Activity {
  const speed = Float64Array.from({ length: n }, () => pace * (1 + 0.004 * (rand() - 0.5)))
  const heartRate = Float64Array.from({ length: n }, () => 150 + Math.round(2 * (rand() - 0.5)))
  return { ...syntheticActivity({ id, n, speed, heartRate }), name: id, startMs }
}

/**
 * Easy runs two a week, and every fourth week a run of 3.5 hours at a steady pace that covers the marathon (E6): the case
 * where revision 7 keeps a best over 42,195 m and revision 6 did not, so the records and the look-back differ by it.
 */
function longRuns(weeks: number, seed: number): Activity[] {
  const rand = mulberry32(seed)
  const activities: Activity[] = []
  for (let week = 0; week < weeks; week++) {
    for (const [i, day] of [1, 4].entries()) {
      const startMs = FIRST_MONDAY_MS + (week * 7 + day) * DAY_MS + 7 * 3_600_000
      activities.push(
        steadyRun(`long-${week}-${i}`, startMs, 2400, 3.3 * (1 + 0.02 * (rand() - 0.5)), rand),
      )
    }
    if (week % 4 === 3) {
      const startMs = FIRST_MONDAY_MS + (week * 7 + 6) * DAY_MS + 6 * 3_600_000
      activities.push(steadyRun(`long-${week}-run`, startMs, 12_600, 3.45, rand))
    }
  }
  return activities
}

/**
 * Two years and a half of steady runs, two a week, each with a temperature (a year's swing of 5 to 30 degrees and the
 * day's wobble) and a pace that loses 4% for each ten degrees over 15, so the warm-day term of fitness (E2) has a
 * response to find. Revision 6 digests carry no temperature; revision 7 digests do.
 */
function warmRuns(weeks: number, seed: number): Activity[] {
  const rand = mulberry32(seed)
  const activities: Activity[] = []
  for (let week = 0; week < weeks; week++) {
    for (const [i, day] of [1, 4].entries()) {
      const startMs = FIRST_MONDAY_MS + (week * 7 + day) * DAY_MS + 7 * 3_600_000
      const dayOfYear = ((week * 7 + day) % 365) / 365
      const degrees = 17.5 - 12.5 * Math.cos(2 * Math.PI * dayOfYear) + 3 * (rand() - 0.5)
      const heat = Math.max(0, degrees - 15) / 10
      const run = steadyRun(`warm-${week}-${i}`, startMs, 1800, 3.4 * Math.exp(-0.04 * heat), rand)
      activities.push({ ...run, temperature: new Float32Array(run.n).fill(degrees) })
    }
  }
  return activities
}

/** The libraries of the study, built when asked (generating them takes a few seconds). */
export function studyLibraries(): StudyLibrary[] {
  return [
    { name: 'season-a', activities: season(90) },
    { name: 'season-b', activities: season(15) },
    { name: 'hilly', activities: terrainRuns('hilly', ['climb', 'rolling'], 30, 11) },
    { name: 'flat', activities: terrainRuns('flat', ['flat'], 30, 12) },
    { name: 'descent', activities: descentRuns(40, 13) },
    { name: 'long', activities: longRuns(28, 14) },
    { name: 'warm', activities: warmRuns(130, 15) },
  ]
}
