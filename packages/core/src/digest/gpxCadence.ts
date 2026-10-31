import { quantile } from '../math'
import type { Activity } from '../types'
import { SPORT_TRACE } from '../workbench/sportTrace'

/**
 * A GPX run's `<cad>` is whatever the source wrote: strides a minute (one foot) from Garmin and Strava exports,
 * steps a minute from some phone apps, so the parsed Activity says `unknown`. The digest resolves it for one
 * decision at a time and never writes it back (D12 section 2.3).
 */
export const GPX_CADENCE = {
  /** The median is taken over moving seconds at this speed or faster, where a runner's cadence is steady. */
  minSpeedMs: 1.2,
  minSamples: 60,
  /** A median from here to `maxStrides` is strides a minute, and steps are twice it. */
  minStrides: 65,
  /** Below a fast hiker's steps (about 100 to 125), so a hike read as strides cannot pass as a run. */
  maxStrides: 98,
  /** A median at or over this is steps a minute. Between the bands the unit is not told. */
  minSteps: 135,
} as const

/** The median positive cadence over the moving seconds at `minSpeedMs` or faster, or null with too few. */
function medianCadence(
  activity: Activity,
  cadence: Float32Array,
  moving: Uint8Array,
): number | null {
  const values: number[] = []
  for (let i = 0; i < cadence.length; i++) {
    if (moving[i] === 1 && cadence[i]! > 0 && activity.speed[i]! >= GPX_CADENCE.minSpeedMs) {
      values.push(cadence[i]!)
    }
  }
  return values.length >= GPX_CADENCE.minSamples ? quantile(values, 0.5) : null
}

/**
 * The factor that takes a GPX run's cadence to steps a minute: 2 when its median reads as strides, 1 when it
 * reads as steps, null when it is neither (under the strides band, in the gap between the bands, too few
 * samples) and so is never guessed.
 */
function stepsFactor(median: number | null): 1 | 2 | null {
  if (median === null) return null
  if (median >= GPX_CADENCE.minStrides && median <= GPX_CADENCE.maxStrides) return 2
  return median >= GPX_CADENCE.minSteps ? 1 : null
}

/**
 * The cadence of a GPX run in steps a minute, or null when its unit cannot be told. Only an activity whose
 * cadence unit is `unknown` is resolved.
 */
export function resolveGpxRunCadence(activity: Activity, moving: Uint8Array): Float32Array | null {
  const { cadence } = activity
  // Only a sport whose GPX cadence is unlabelled (a run's) has strides to tell from steps.
  if (cadence === undefined || activity.cadenceUnit !== 'unknown') return null
  if (SPORT_TRACE[activity.sport].gpxCadenceUnit !== 'unknown') return null
  const factor = stepsFactor(medianCadence(activity, cadence, moving))
  return factor === null ? null : cadence.map((value) => value * factor)
}

/**
 * The cadence in the unit the sport is counted in (steps a minute for a run, revolutions for a ride), or null
 * when the activity has none or its unit cannot be told. FIT and TCX files are already there.
 */
export function cadenceInSportUnit(activity: Activity, moving: Uint8Array): Float32Array | null {
  const { cadence, cadenceUnit } = activity
  if (cadence === undefined) return null
  if (cadenceUnit === 'unknown') return resolveGpxRunCadence(activity, moving)
  return cadenceUnit === undefined || cadenceUnit === SPORT_TRACE[activity.sport].cadenceUnit
    ? cadence
    : null
}
