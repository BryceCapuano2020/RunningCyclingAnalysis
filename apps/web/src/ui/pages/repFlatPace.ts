import { PRIORS } from '@rca/core/constants'
import {
  metabolicToFlatSpeed,
  runMetabolicPower,
  smoothGrade,
  travelledDistance,
} from '@rca/core/metabolic'
import type { ActivityTrace } from '@rca/core/workbench'
import { readableTrace } from './workbenchData'

/** The share of a stretch's moving seconds with a speed that must also have a grade, to read a flat pace. */
const MIN_GRADE_COVERAGE = 0.8

const kept = new WeakMap<ActivityTrace, Float64Array | null>()

/**
 * The run's metabolic power at each second, from its speed and the grade its altitude gives over the
 * distance that speed implies, as the best efforts are read (a steep descent saves what `descentCost` says,
 * as in the digest); null without a speed or an altitude stream.
 */
function metabolicPower(trace: ActivityTrace): Float64Array | null {
  const cached = kept.get(trace)
  if (cached !== undefined) return cached
  const { speed, altitude } = readableTrace(trace).streams
  let power: Float64Array | null = null
  if (speed !== undefined && altitude !== undefined) {
    const metres = Float64Array.from(speed)
    const grade = smoothGrade(
      Float64Array.from(altitude),
      travelledDistance(metres, trace.distance),
    )
    power = runMetabolicPower(metres, grade, PRIORS.runEconomyScale.mean, { steepDescent: true })
  }
  kept.set(trace, power)
  return power
}

/**
 * The flat speed, m/s, that costs the same as the run did over [startS, endS): the mean metabolic power
 * of its moving seconds, read back as a level pace, so a hill does not pass for a fade. Null when the
 * trace has no altitude, or too few of the stretch's seconds have a grade.
 */
export function flatSpeedOf(trace: ActivityTrace, startS: number, endS: number): number | null {
  const power = metabolicPower(trace)
  const speed = readableTrace(trace).streams.speed
  if (power === null || speed === undefined) return null
  let moving = 0
  let graded = 0
  let sum = 0
  for (let i = startS; i < endS; i++) {
    if (trace.paused[i] === 1 || trace.unrecorded[i] === 1 || !Number.isFinite(speed[i])) continue
    moving++
    if (Number.isFinite(power[i])) {
      graded++
      sum += power[i]!
    }
  }
  if (moving === 0 || graded < MIN_GRADE_COVERAGE * moving) return null
  return metabolicToFlatSpeed(sum / graded, PRIORS.runEconomyScale.mean)
}
