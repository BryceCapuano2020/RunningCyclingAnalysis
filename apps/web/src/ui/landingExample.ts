import type { Ranged } from '@rca/core/fitness'
import type { Sport } from '@rca/core/types'
import type { SportGrade } from './grades'

/**
 * The example's numbers, which are the sample athlete's own: the sample's analysis gives them, and
 * LandingExample.test.tsx checks that it still does. They are those of the sample on the fixed reference
 * clock (SAMPLE_CLOCK). The season is anchored to a Sunday and keyed to the days before it, so the app's own
 * sample, loaded on any day, gives the same figures (sampleSections.test.ts checks that over two weeks of
 * clocks): running 65% Local, cycling 80% National with a range of 70% to 93%, a lean of 15 points to cycling
 * (4 to 27, clear of zero), and a run that is slipping at the same heart rate. The generator
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
  gap: { centre: -15, low: -27, high: -4, lean: 'ride' },
  fitness: {
    referenceHr: 120,
    change: { value: -0.1047, low: -0.1404, high: -0.0675 },
    shown: { size: '12%', range: '7 to 16%' },
  },
  grades: {
    run: { centre: { grade: 0.6583518165965895, level: 'Local' }, range: null },
    ride: {
      centre: { grade: 0.8049601853246248, level: 'National' },
      range: {
        low: { grade: 0.6950130236853881, level: 'Local' },
        high: { grade: 0.9251730199210054, level: 'World' },
      },
    },
  },
}
