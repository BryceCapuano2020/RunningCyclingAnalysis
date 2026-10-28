import { WALKING_PACE } from '../constants'
import { quantile } from '../math'
import type { Activity, Sport } from '../types'

/** Which sports can have their walks told apart: a ride at walking speed is a ride. */
const CAN_WALK: Record<Sport, boolean> = { run: true, ride: false }

/** The share of the moving seconds spent at or over `speedMs`. */
function shareAtOrOver(speed: Float64Array, moving: Uint8Array, speedMs: number): number {
  let fast = 0
  let kept = 0
  for (let i = 0; i < speed.length; i++) {
    if (moving[i] !== 1) continue
    kept++
    if (speed[i]! >= speedMs) fast++
  }
  return kept === 0 ? 0 : fast / kept
}

/** The median cadence over the moving samples that have one, steps/min; null when the file has too little. */
function medianCadence(activity: Activity, moving: Uint8Array, movingS: number): number | null {
  const { cadence, cadenceUnit } = activity
  // GPX cadence of unknown unit, or revolutions, is not read as steps.
  if (cadence === undefined || (cadenceUnit !== undefined && cadenceUnit !== 'steps/min'))
    return null
  const values: number[] = []
  for (let i = 0; i < cadence.length; i++) {
    if (moving[i] === 1 && cadence[i]! > 0) values.push(cadence[i]!)
  }
  return values.length >= movingS / 2 ? quantile(values, 0.5) : null
}

/**
 * Whether a run is at walking pace (see WALKING_PACE): a hike recorded as a run. The moving speed is the
 * distance over the seconds recording. A slow run is kept when its cadence is a runner's, or, without a
 * cadence, when a tenth of it was spent at a jog; a steep run slow by the clock still has those.
 */
export function atWalkingPace(activity: Activity, moving: Uint8Array, movingS: number): boolean {
  const w = WALKING_PACE
  if (!CAN_WALK[activity.sport] || movingS < w.minMovingS) return false
  const distanceM = activity.n > 0 ? activity.distance[activity.n - 1]! : 0
  if (!(distanceM > 0 && distanceM / movingS < w.maxMovingSpeedMs)) return false
  const cadence = medianCadence(activity, moving, movingS)
  if (cadence !== null) return cadence < w.runCadenceStepsPerMin
  return shareAtOrOver(activity.speed, moving, w.runningSpeedMs) < w.runningShare
}
