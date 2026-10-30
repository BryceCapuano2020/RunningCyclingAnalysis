import type { Ranged } from '@rca/core/fitness'
import type { Sport } from '@rca/core/types'
import type { SportGrade } from './grades'

/**
 * The example's numbers, which are the sample athlete's own: the sample's analysis gives them, and
 * LandingExample.test.tsx checks that it still does. They are those of the sample on the fixed reference
 * clock (SAMPLE_CLOCK). The season is anchored to a Sunday and keyed to the days before it, so the app's own
 * sample, loaded on any day, gives the same figures (sampleSections.test.ts checks that over two weeks of
 * clocks): running 67% Local, cycling 59% Recreational with a range of 54% to 65%, a lean of 8 points
 * (2 to 13), and a run that is slipping at the same heart rate.
 */
export const LANDING_EXAMPLE: {
  gap: { centre: number; low: number; high: number; lean: 'run' }
  grades: Record<Sport, SportGrade>
  /**
   * The run's fitness status: its change in output with its 90% range, and the same as the sentence says it in
   * pace (the percentage and its range), since the example has no dates or units to say the levels in.
   */
  fitness: { referenceHr: number; change: Ranged; shown: { size: string; range: string } }
} = {
  gap: { centre: 8, low: 2, high: 13, lean: 'run' },
  fitness: {
    referenceHr: 130,
    change: { value: -0.0618, low: -0.0947, high: -0.0276 },
    shown: { size: '6.6%', range: '3 to 10%' },
  },
  grades: {
    run: { centre: { grade: 0.6742100769874514, level: 'Local' }, range: null },
    ride: {
      centre: { grade: 0.5948039444687337, level: 'Recreational' },
      range: {
        low: { grade: 0.5433457556567782, level: 'Recreational' },
        high: { grade: 0.6539037158747107, level: 'Local' },
      },
    },
  },
}
