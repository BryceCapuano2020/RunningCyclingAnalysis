import type { Sport } from '@rca/core/types'
import type { SportGrade } from './grades'

/**
 * The example's numbers, which are the sample athlete's own: the sample's analysis gives them, and
 * LandingExample.test.tsx checks that it still does. They are those of the sample on the fixed reference
 * clock (SAMPLE_CLOCK). The season is anchored to a Sunday and keyed to the days before it, so the app's own
 * sample, loaded on any day, gives the same figures (sampleSections.test.ts checks that over two weeks of
 * clocks): running 67% Local, cycling 56% Recreational with a range of 51% to 61%, a lean of 11 points
 * (6 to 16). The threshold is the sample's exact speed, 3.8977 m/s, which is 4:17 /km and 6:53 /mi, and 222 W.
 * Rounded speeds can read a second off in miles, so the exact one is kept.
 */
export const LANDING_EXAMPLE: {
  gap: { centre: number; low: number; high: number; lean: 'run' }
  runSpeedMs: number
  rideWatts: number
  grades: Record<Sport, SportGrade>
} = {
  gap: { centre: 11, low: 6, high: 16, lean: 'run' },
  runSpeedMs: 3.8976892471965545,
  rideWatts: 222,
  grades: {
    run: { centre: { grade: 0.6742100769874514, level: 'Local' }, range: null },
    ride: {
      centre: { grade: 0.5660838709954887, level: 'Recreational' },
      range: {
        low: { grade: 0.5191299766083788, level: 'Recreational' },
        high: { grade: 0.6174453930732874, level: 'Local' },
      },
    },
  },
}
