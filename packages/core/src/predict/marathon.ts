import { MARATHON_M, RIEGEL_EXPONENT } from '../constants'
import { METRES_PER_MILE } from '../units'
import { MARATHON_MAX_RATIO } from './reach'
import { distanceRatio, proximityMean, type CarriedTime, type Performance } from './riegel'

/**
 * Vickers & Vertosick (2016, BMC Sports Sci Med Rehabil 8:26, Additional file 1), model 1: the marathon
 * speed, m/s, from the speed Riegel's law at 1.07 gives and the miles run in a typical week, fitted on
 * 2,303 recreational marathoners. It corrects Riegel, which ran about 10 min fast at the median.
 */
function modelOneSpeed(riegelSpeed: number, weeklyMiles: number): number {
  return 0.16018617 + 0.83076202 * riegelSpeed + 0.06423826 * (weeklyMiles / 10)
}

/**
 * The marathon, s, from the bests within MARATHON_MAX_RATIO of its distance (a 10 km or longer), each through the model
 * and weighted by how near it is (`proximityMean`), and the runner's typical weekly distance, m. Null without such a best.
 */
export function marathonTime(bests: readonly Performance[], weeklyM: number): CarriedTime | null {
  const weeklyMiles = Math.max(0, weeklyM) / METRES_PER_MILE
  return proximityMean(
    bests
      .filter((b) => distanceRatio(b.distanceM, MARATHON_M) <= MARATHON_MAX_RATIO)
      .map((race) => {
        const riegel = race.seconds * (MARATHON_M / race.distanceM) ** RIEGEL_EXPONENT
        const seconds = MARATHON_M / modelOneSpeed(MARATHON_M / riegel, weeklyMiles)
        return { seconds, fromM: race.distanceM }
      }),
    MARATHON_M,
  )
}
