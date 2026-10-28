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

/**
 * The median cadence, steps/min, over the moving samples that have one and run at least `minSpeedMs` (all of
 * them at 0), or null when the file has no steps a minute or too few such samples to say.
 */
function medianCadence(activity: Activity, moving: Uint8Array, minSpeedMs: number): number | null {
  const { cadence, cadenceUnit, speed } = activity
  // GPX cadence of unknown unit, or revolutions, is not read as steps.
  if (cadence === undefined || (cadenceUnit !== undefined && cadenceUnit !== 'steps/min')) {
    return null
  }
  const values: number[] = []
  for (let i = 0; i < cadence.length; i++) {
    if (moving[i] === 1 && cadence[i]! > 0 && speed[i]! >= minSpeedMs) values.push(cadence[i]!)
  }
  return values.length >= WALKING_PACE.minCadenceSamples ? quantile(values, 0.5) : null
}

/** Whether a median cadence, when there is one, is a runner's. */
const runsAt = (cadence: number | null): boolean =>
  cadence !== null && cadence >= WALKING_PACE.runCadenceStepsPerMin

/**
 * Whether a run is at walking pace (see WALKING_PACE): a hike recorded as a run. The moving speed is the
 * distance over the seconds recording. A slow run is kept when either signal says it ran: a runner's cadence
 * over all its moving seconds or over just the faster ones, or a tenth of its moving time at a jog. A run/walk
 * session and a steep ultra, whose median cadence is a walker's, still have the faster seconds.
 */
export function atWalkingPace(activity: Activity, moving: Uint8Array, movingS: number): boolean {
  const w = WALKING_PACE
  if (!CAN_WALK[activity.sport] || movingS < w.minMovingS) return false
  const distanceM = activity.n > 0 ? activity.distance[activity.n - 1]! : 0
  if (!(distanceM > 0 && distanceM / movingS < w.maxMovingSpeedMs)) return false
  if (shareAtOrOver(activity.speed, moving, w.runningSpeedMs) >= w.runningShare) return false
  return !(
    runsAt(medianCadence(activity, moving, 0)) ||
    runsAt(medianCadence(activity, moving, w.maxMovingSpeedMs))
  )
}
