import { expect, it } from 'vitest'
import type { Lean } from '@rca/core/standing'
import { flatSpeedOfWkg } from '@rca/core/display'
import { formatPaceValue } from '@rca/core/units'
import { standingOf } from '../../../apps/web/src/ui/standing'
import { PROFILE, SETTINGS, flat, library, resultOf, seconds, sessionOf } from '../support'

const UNITS = 'metric'
/** The run's own scale; the ride's is swept from far under it to far over it. */
const RIDE_SCALES = [0.45, 0.65, 0.85, 0.88, 0.9, 0.92, 0.95, 1.15, 1.5]
/**
 * Two points of grade is level (`LEVEL_BAND`). At these grades that is about 4% of pace, so a level lean has the ride as a
 * run within 6% of the run threshold, and a printed pace is whole seconds.
 */
const LEVEL_PACE_SHARE = 0.06
const PRINT_ROUNDING_S = 1

/** What the two printed paces must show for each lean. A slower ride as a run is a ride that grades lower: a lean toward running. */
const READS: Record<Lean, (asRun: number, run: number, label: string) => void> = {
  run: (asRun, run, label) => expect(asRun, label).toBeGreaterThanOrEqual(run - PRINT_ROUNDING_S),
  ride: (asRun, run, label) => expect(asRun, label).toBeLessThanOrEqual(run + PRINT_ROUNDING_S),
  even: (asRun, run, label) =>
    expect(Math.abs(asRun - run) / run, label).toBeLessThanOrEqual(LEVEL_PACE_SHARE),
}

it('leans the way the ride as a run sits against the run threshold, for athletes either way and near level', () => {
  const seen = new Set<string>()
  for (const ride of RIDE_SCALES) {
    const session = sessionOf(
      library({ years: 2, everyDays: 14, scale: { run: flat(1), ride: flat(ride) } }),
    )
    const result = resultOf(session, 'all')
    const standing = standingOf(result, PROFILE, { massKg: SETTINGS.massKg, units: UNITS })
    const lean = standing.lead!.lean
    // The two pace cards a reader puts side by side, as they are printed.
    const run = seconds(formatPaceValue(flatSpeedOfWkg(result.runThreshold!.value), UNITS))
    const asRun = seconds(formatPaceValue(standing.rideAsRun!.p50, UNITS))
    const label = `ride at ${ride}: leans ${lean}, run threshold ${run} s, ride as a run ${asRun} s`
    READS[lean](asRun, run, label)
    seen.add(lean)
  }
  // The sweep has to reach all three, or it checks less than it says.
  expect([...seen].sort()).toEqual(['even', 'ride', 'run'])
})
