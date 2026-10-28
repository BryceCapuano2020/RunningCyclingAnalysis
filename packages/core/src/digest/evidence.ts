import type { Activity, ActivityDigest, DerivedStreams, QualityReport } from '../types'
import { activityDistributions } from './distributions'
import { durabilityPoints } from './durability'
import { steadyDrift } from './drift'

/** The stream a digest's main curve is built from, with the mask of its valid samples. */
export interface OutputStream {
  values: Float64Array
  valid: Uint8Array
}

/**
 * The evidence for the zones, durability and drift views. `output` is the main curve's stream, or
 * null for a ride without a power meter: its watts are an estimate, so it has no durability or
 * drift, and its distributions leave power out.
 */
export function digestEvidence(
  activity: Activity,
  quality: QualityReport,
  moving: Uint8Array,
  output: OutputStream | null,
  powerSource: DerivedStreams['powerSource'],
): Pick<ActivityDigest, 'distributions' | 'durability' | 'drift'> {
  const distributions = activityDistributions(activity, quality, moving, powerSource === 'measured')
  if (output === null) return { distributions, durability: [], drift: null }
  return {
    distributions,
    durability: durabilityPoints(output.values, output.valid, moving, activity.id),
    drift: activity.hasHeartRate
      ? steadyDrift({
          sport: activity.sport,
          output: output.values,
          validOutput: output.valid,
          heartRate: activity.heartRate,
          validHeartRate: quality.validHeartRate,
          moving,
        })
      : null,
  }
}
