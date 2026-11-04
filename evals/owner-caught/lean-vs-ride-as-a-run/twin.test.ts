import { expect, it } from 'vitest'
import { flatSpeedOfWkg } from '@rca/core/display'
import { gradeAtSpeed } from '@rca/core/grade'
import { leanOfLead, wholePercent } from '@rca/core/standing'
import type { Lean } from '@rca/core/standing'
import { formatPaceValue } from '@rca/core/units'
import { standingOf } from '../../../apps/web/src/ui/standing'
import { PROFILE, SETTINGS, flat, library, resultOf, seconds, sessionOf } from '../support'

const UNITS = 'metric'
const HOUR_S = 3600
/** The run's own scale is 1; the ride's goes from far under it to far over it, in 0.01 steps where the lean turns level. */
const NEAR_LEVEL = Array.from({ length: 13 }, (_, i) => 0.84 + i * 0.01)
const RIDE_SCALES = [0.45, 0.65, ...NEAR_LEVEL, 1.15, 1.5]
/**
 * Two points of grade is level (`LEVEL_BAND`). At these grades that is a few percent of pace, so a level lean has the ride as a
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

it('leans by the grades of the two pace cards, for athletes either way and near level', () => {
  const seen = new Set<string>()
  for (const ride of RIDE_SCALES) {
    const session = sessionOf(
      library({ years: 1, everyDays: 14, scale: { run: flat(1), ride: flat(ride) } }),
    )
    const result = resultOf(session, 'all')
    const standing = standingOf(result, PROFILE, { massKg: SETTINGS.massKg, units: UNITS })
    const { run: runGrade, ride: rideGrade } = standing.grades
    if (runGrade.kind !== 'graded' || rideGrade.kind !== 'graded') throw new Error('both graded')
    const runSpeed = flatSpeedOfWkg(result.runThreshold!.value)
    const asRunSpeed = standing.rideAsRun!.p50
    // The lead is the run card's whole percent less the ride-as-a-run card's: the grades of the two paces set side by side.
    const percent = (speed: number, age: number) =>
      wholePercent(gradeAtSpeed(speed, HOUR_S, { age, sex: PROFILE.sex })!.grade)
    const lead = percent(runSpeed, runGrade.age) - percent(asRunSpeed, rideGrade.age)
    const label = `ride at ${ride}: lead ${standing.lead!.centre}, the cards' grades give ${lead}`
    expect(standing.lead!.centre, label).toBe(lead)
    const lean = leanOfLead({ centre: lead, low: lead, high: lead })
    expect(standing.lead!.lean, label).toBe(lean)
    // And the paces a reader sets side by side, as printed, point the same way.
    const printed = (speed: number) => seconds(formatPaceValue(speed, UNITS))
    READS[lean](printed(asRunSpeed), printed(runSpeed), label)
    seen.add(lean)
  }
  // The sweep has to reach all three, or it checks less than it says.
  expect([...seen].sort()).toEqual(['even', 'ride', 'run'])
})
