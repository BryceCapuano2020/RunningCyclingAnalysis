import { RIEGEL_EXPONENT } from '../constants'
import { ANCHOR_PROXIMITY_LOG_SD, RIEGEL_MAX_RATIO } from './reach'

/** A performance a prediction is carried from: a distance, m, and the time it took, s. */
export interface Performance {
  distanceM: number
  seconds: number
}

/** How many times apart two distances are: at least 1, whichever is longer. */
export function distanceRatio(aM: number, bM: number): number {
  return Math.max(aM / bM, bM / aM)
}

/** One best carried to targetM by Riegel's law. */
export function carried(best: Performance, targetM: number): number {
  return best.seconds * (targetM / best.distanceM) ** RIEGEL_EXPONENT
}

/** A race time, s, and the distance, m, of the best it was carried from. */
export interface CarriedTime {
  seconds: number
  fromM: number
}

/** How much an anchor counts for, from 1 at the race's own distance, falling as the log of the ratio grows. */
function proximity(ratio: number): number {
  return Math.exp(-(Math.log(ratio) ** 2) / (2 * ANCHOR_PROXIMITY_LOG_SD ** 2))
}

/**
 * The time for a race from the times its anchors carry to it: their mean in log time, weighted by how near each anchor's
 * distance is to the race's, so a best at the race's distance leads and a far one only nudges. `fromM` is the nearest
 * anchor's distance (the earlier on a tie). Null when there are none.
 */
export function proximityMean(times: readonly CarriedTime[], targetM: number): CarriedTime | null {
  let weights = 0
  let logs = 0
  let nearest: CarriedTime | null = null
  let nearestWeight = 0
  for (const time of times) {
    const weight = proximity(distanceRatio(time.fromM, targetM))
    weights += weight
    logs += weight * Math.log(time.seconds)
    if (weight > nearestWeight) {
      nearest = time
      nearestWeight = weight
    }
  }
  return nearest === null ? null : { seconds: Math.exp(logs / weights), fromM: nearest.fromM }
}

/**
 * The time for targetM: the bests within `maxRatio` of its distance, carried to it and averaged with the nearest
 * counting most (`proximityMean`). Null when no best is that near.
 */
export function riegelTime(
  bests: readonly Performance[],
  targetM: number,
  maxRatio: number = RIEGEL_MAX_RATIO,
): CarriedTime | null {
  return proximityMean(
    bests
      .filter((b) => distanceRatio(b.distanceM, targetM) <= maxRatio)
      .map((b) => ({ seconds: carried(b, targetM), fromM: b.distanceM })),
    targetM,
  )
}
