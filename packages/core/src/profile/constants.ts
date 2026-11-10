import { EQUIVALENCE_MIN_S } from '../constants'
import type { Sport } from '../types'

/**
 * The shortest duration, s, each sport's best-effort curve reads. A run's flat pace over less than 3 minutes
 * mostly measures the slope reading, so a run starts at 3 minutes (the shortest equivalence); a ride reads from
 * 5 s. The charts show nothing shorter than 1 minute.
 */
export const CURVE_START_S: Record<Sport, number> = {
  run: EQUIVALENCE_MIN_S,
  ride: 5,
}
