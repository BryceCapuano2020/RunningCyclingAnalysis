import type { Curve, ActivityDigest, AthleteSettings } from '../types'
import { plainCurve } from './bestCurve'
import { orderedFor } from './consumers'
import { massesOf } from './masses'
import { trustedPower } from './powerCheck'
import { measuredRideBest, runBestOf } from './rideCurves'

/**
 * A run's best curve and a ride's measured-power best curve over some digests: the two curves a duration profile reads,
 * worked out as `combine` works them out (a ride whose power is set aside is out), without the rest of an analysis.
 */
export function libraryCurves(
  digests: ActivityDigest[],
  settings: AthleteSettings,
): { runCurve: Curve; rideMeasuredCurve: Curve } {
  const ordered = orderedFor('combine', digests)
  return {
    runCurve: plainCurve(runBestOf(ordered)),
    rideMeasuredCurve: plainCurve(measuredRideBest(trustedPower(ordered, massesOf(settings)))),
  }
}
