import { RIEGEL_EXPONENT, RIEGEL_MAX_RATIO } from '../constants'

/** A performance a prediction is carried from: a distance, m, and the time it took, s. */
export interface Performance {
  distanceM: number
  seconds: number
}

/** Whether a best is near enough a race to carry it there: within RIEGEL_MAX_RATIO either way. */
function nearEnough(best: Performance, targetM: number): boolean {
  return Math.max(targetM / best.distanceM, best.distanceM / targetM) <= RIEGEL_MAX_RATIO
}

/** One best carried to targetM by Riegel's law. */
export function carried(best: Performance, targetM: number): number {
  return best.seconds * (targetM / best.distanceM) ** RIEGEL_EXPONENT
}

/**
 * The time, s, for targetM: the fastest any near-enough best implies. A best is a lower bound on what the
 * runner can do, since it may not have been all-out, so the best that implies the most is taken. Null when
 * no best is within RIEGEL_MAX_RATIO of the target.
 */
export function riegelTime(bests: readonly Performance[], targetM: number): number | null {
  const times = bests.filter((b) => nearEnough(b, targetM)).map((b) => carried(b, targetM))
  return times.length === 0 ? null : Math.min(...times)
}
