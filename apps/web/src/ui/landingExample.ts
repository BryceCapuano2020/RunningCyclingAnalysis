import type { Sport } from '@rca/core/types'
import type { SportGrade } from './grades'

/**
 * The example's numbers, which are the sample athlete's own: the sample's analysis gives them, and
 * LandingExample.test.tsx checks that it still does. The grades are exact, as the analysis gives them,
 * so the example shows the sample's own levels and ranges: running 64% Local, cycling 58% Recreational
 * with a range of 53% to 64%. The threshold is the sample's exact speed, 3.722 m/s, which is 4:29 /km
 * and 7:12 /mi, and 225 W. Rounded speeds read a second off in miles, so the exact one is kept.
 * The ride grades moved in the fourth decimal at model revision 6, when grade began to follow speed.
 */
export const LANDING_EXAMPLE: {
  gap: { centre: number; low: number; high: number; lean: 'run' }
  runSpeedMs: number
  rideWatts: number
  grades: Record<Sport, SportGrade>
} = {
  gap: { centre: 6, low: 1, high: 12, lean: 'run' },
  runSpeedMs: 3.722017385154334,
  rideWatts: 225,
  grades: {
    run: { centre: { grade: 0.6424076254311415, level: 'Local' }, range: null },
    ride: {
      centre: { grade: 0.5802402059278592, level: 'Recreational' },
      range: {
        low: { grade: 0.5271909478480602, level: 'Recreational' },
        high: { grade: 0.6395246550851634, level: 'Local' },
      },
    },
  },
}
