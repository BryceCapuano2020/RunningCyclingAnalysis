import { DEFAULT_BIKE_MODEL, DURATIONS_S, PRIORS } from '../../constants'
import { meanMaximal, monotoneEnvelope } from '../../curves'
import { MIN_RUN_SPEED_MS, runMetabolicPower, smoothGrade } from '../../metabolic'
import { airDensityStream } from '../../physics/air'
import { assessQuality } from '../../quality'
import type { Activity, Curve } from '../../types'
import { climbMask, estimatePower } from '../../virtualPower'
import { and } from '../masks'
import { powerAt, SELECTION_MASS_KG, sampleTerms, termsOver } from '../terms'

/**
 * Reference curves with the grade taken over the activity's recorded distance, as digests were
 * before revision 6. Where the recorded distance agrees with the speed stream, a digest's curves
 * should match these closely.
 */

interface RecordedGrade {
  grade: Float64Array
  valid: Uint8Array
}

/** The grade over recorded distance (unknown as zero) and the samples a curve may use. */
function recordedGrade(a: Activity): RecordedGrade {
  const raw = smoothGrade(a.altitude, a.distance)
  const quality = assessQuality(a)
  const known = Uint8Array.from(raw, (g, i) => {
    const stationary = a.speed[i]! < MIN_RUN_SPEED_MS
    return Number.isNaN(g) && a.paused[i] !== 1 && !stationary ? 0 : 1
  })
  return {
    grade: raw.map((g) => (Number.isNaN(g) ? 0 : g)),
    valid: and(quality.validMotion, and(quality.validGrade, known)),
  }
}

/** A run's best metabolic W/kg at every duration, with the grade over recorded distance. */
export function recordedRunCurve(a: Activity): Curve {
  const { grade, valid } = recordedGrade(a)
  const metabolic = runMetabolicPower(a.speed, grade, PRIORS.runEconomyScale.mean)
  return monotoneEnvelope(meanMaximal(metabolic, valid, DURATIONS_S, a.id))
}

/**
 * A ride's best virtual climb power at every duration, W, at the selection mass with the default
 * bike model, with the grade over recorded distance. NaN where no climb window is long enough.
 */
export function recordedVirtualCurve(a: Activity): number[] {
  const { grade, valid } = recordedGrade(a)
  const density = airDensityStream(a)
  const climbs = and(valid, climbMask(grade, a.speed))
  const estimate = estimatePower(a.speed, grade, SELECTION_MASS_KG, DEFAULT_BIKE_MODEL, density)
  const terms = sampleTerms(a.speed, grade, density)
  const windows = meanMaximal(estimate, climbs, DURATIONS_S, a.id).map((p) =>
    Object.assign(p, { windowS: p.durationS }),
  )
  return monotoneEnvelope(windows).map((p) => {
    if (p.startIndex < 0) return NaN
    const window = termsOver(terms, p.startIndex, p.startIndex + p.windowS)
    return powerAt(window, SELECTION_MASS_KG, DEFAULT_BIKE_MODEL)
  })
}
