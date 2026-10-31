import type { Ranged } from '@rca/core/fitness'
import type { Sport } from '@rca/core/types'
import type { SportGrade } from './grades'

/**
 * The example's numbers, which are the sample athlete's own: the sample's analysis gives them, and
 * LandingExample.test.tsx checks that it still does. They are those of the sample on the fixed reference
 * clock (SAMPLE_CLOCK). The season is anchored to a Sunday and keyed to the days before it, so the app's own
 * sample, loaded on any day, gives the same figures (sampleSections.test.ts checks that over two weeks of
 * clocks): running 64% Local, cycling 71% Regional with a range of 61% to 83%, a lean of 7 points to cycling
 * (3 toward running to 19 toward cycling), and a run that is slipping at the same heart rate. The generator
 * draws the sample, so these move with it; build-time generation of this file is G4's.
 */
export const LANDING_EXAMPLE: {
  gap: { centre: number; low: number; high: number; lean: Sport }
  grades: Record<Sport, SportGrade>
  /**
   * The run's fitness status: its change in output with its 90% range, and the same as the sentence says it in
   * pace (the percentage and its range), since the example has no dates or units to say the levels in.
   */
  fitness: { referenceHr: number; change: Ranged; shown: { size: string; range: string } }
} = {
  gap: { centre: -7, low: -19, high: 3, lean: 'ride' },
  fitness: {
    referenceHr: 140,
    change: { value: -0.0898, low: -0.1234, high: -0.055 },
    shown: { size: '9.9%', range: '6 to 14%' },
  },
  grades: {
    run: { centre: { grade: 0.6430111582722373, level: 'Local' }, range: null },
    ride: {
      centre: { grade: 0.7174593304790404, level: 'Regional' },
      range: {
        low: { grade: 0.6123153136406498, level: 'Local' },
        high: { grade: 0.8328553568162148, level: 'National' },
      },
    },
  },
}
