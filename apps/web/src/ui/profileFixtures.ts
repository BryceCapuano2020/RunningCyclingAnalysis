import type { ActivitySummary } from '@rca/core/pipeline'
import type { Curve, Sport } from '@rca/core/types'
import { curvePoint } from './charts/fixtures'
import { makeActivity } from './components/fixtures'

/** The durations of a full curve, 5 s up to 60 min, which a profile reads. */
const DURATIONS_S = [
  5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600,
]
const SESSIONS = 4

/** Morton's three-parameter model, with the values of a 250 W rider: CP 250, W' 20 kJ, Pmax 1000. */
function morton(durationS: number): number {
  return 250 + 20_000 / (durationS + 20_000 / (1000 - 250))
}

/**
 * A curve that follows one model, set across four activities, `change` altering a value as the test
 * needs. A duration listed in `without` has no value.
 */
export function profileCurve(
  change: (durationS: number, value: number) => number = (_, value) => value,
  without: readonly number[] = [],
): Curve {
  return DURATIONS_S.map((durationS, i) =>
    without.includes(durationS)
      ? curvePoint(durationS, NaN, null)
      : curvePoint(durationS, change(durationS, morton(durationS)), `profile-${i % SESSIONS}`),
  )
}

/** The activities a profile curve is set in, of one sport, with the power source a ride's watts came from. */
export function profileActivities(
  sport: Sport,
  powerSource: ActivitySummary['powerSource'] = 'none',
): ActivitySummary[] {
  return Array.from({ length: SESSIONS }, (_, i) =>
    makeActivity({
      id: `profile-${i}`,
      name: `Session ${i}`,
      sport,
      powerSource,
    }),
  )
}
