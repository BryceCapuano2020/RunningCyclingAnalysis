import type { Sport } from '@rca/core/types'
import type { SportGrade } from './grades'

/**
 * The example's numbers, which are the sample athlete's own: the sample's analysis gives them, and
 * LandingExample.test.tsx checks that it still does. The grades are exact, as the analysis gives them,
 * so the example shows the sample's own levels and ranges: running 64% Local, cycling 58% Recreational
 * with a range of 53% to 64%. The threshold is 4:29 /km (3.72 m/s) and 225 W.
 */
export const LANDING_EXAMPLE: {
  gap: { centre: number; low: number; high: number; lean: 'run' }
  runSpeedMs: number
  rideWatts: number
  grades: Record<Sport, SportGrade>
} = {
  gap: { centre: 6, low: 1, high: 12, lean: 'run' },
  runSpeedMs: 3.72,
  rideWatts: 225,
  grades: {
    run: { centre: { grade: 0.6424076254311415, level: 'Local' }, range: null },
    ride: {
      centre: { grade: 0.5801377477223318, level: 'Recreational' },
      range: {
        low: { grade: 0.526907106396036, level: 'Recreational' },
        high: { grade: 0.6393282532214419, level: 'Local' },
      },
    },
  },
}
