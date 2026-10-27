import { MARATHON_M, RIEGEL_EXPONENT } from '../constants'
import { METRES_PER_MILE } from '../units'
import type { Performance } from './riegel'

/** The shortest race Vickers & Vertosick's runners predicted from: 5 km. */
const MIN_RACE_M = 5_000

/**
 * Vickers & Vertosick (2016, BMC Sports Sci Med Rehabil 8:26, Additional file 1), model 1: the marathon
 * speed, m/s, from the speed Riegel's law at 1.07 gives and the miles run in a typical week, fitted on
 * 2,303 recreational marathoners. It corrects Riegel, which ran about 10 min fast at the median.
 */
function modelOneSpeed(riegelSpeed: number, weeklyMiles: number): number {
  return 0.16018617 + 0.83076202 * riegelSpeed + 0.06423826 * (weeklyMiles / 10)
}

/**
 * The marathon, s, from the race of 5 km or more that implies the fastest, and the runner's typical weekly
 * distance, m. Null without such a race.
 */
export function marathonTime(bests: readonly Performance[], weeklyM: number): number | null {
  const races = bests.filter((b) => b.distanceM >= MIN_RACE_M)
  if (races.length === 0) return null
  const weeklyMiles = Math.max(0, weeklyM) / METRES_PER_MILE
  const times = races.map((race) => {
    const riegel = race.seconds * (MARATHON_M / race.distanceM) ** RIEGEL_EXPONENT
    return MARATHON_M / modelOneSpeed(MARATHON_M / riegel, weeklyMiles)
  })
  return Math.min(...times)
}
