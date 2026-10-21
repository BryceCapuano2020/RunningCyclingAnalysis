import { mean } from '../math'
import type { BikeModel, VirtualPowerAccuracy } from '../types'
import type { CalibrationRide } from './calibrate'
import { addStats, emptyStats, rideStats, solveBikeModel, subtractStats } from './calibrate'
import { climbMask, findSegments, splitSegment } from './climbs'
import { estimatePower } from './estimatePower'

type Segment = VirtualPowerAccuracy['segments'][number]

/** Climbs whose measured mean power is below this are too easy to score meaningfully. */
const MIN_MEASURED_W = 50

/** Climb segments of one ride where the measured power is known, with mean powers. */
function scoreRide(ride: CalibrationRide, totalMassKg: number, model: BikeModel): Segment[] {
  const n = ride.speed.length
  const climb = climbMask(ride.grade, ride.speed)
  const scorable = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    const usable =
      ride.valid[i] === 1 &&
      Number.isFinite(ride.speed[i]!) &&
      Number.isFinite(ride.grade[i]!) &&
      Number.isFinite(ride.power[i]!)
    scorable[i] = usable ? 1 : 0
  }
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = climb[i]! & scorable[i]!

  const estimated = estimatePower(ride.speed, ride.grade, totalMassKg, model)
  const out: Segment[] = []
  for (const climb of findSegments(mask)) {
    for (const { start, end } of splitSegment(climb)) {
      const measuredW = mean(ride.power.subarray(start, end))
      if (measuredW < MIN_MEASURED_W) continue
      out.push({
        activityId: ride.activityId,
        start,
        end,
        measuredW,
        estimatedW: mean(estimated.subarray(start, end)),
      })
    }
  }
  return out
}

/** Mean absolute relative error and mean signed relative error. NaN when there are no segments. */
function summarize(segments: Segment[]): VirtualPowerAccuracy {
  const relErr = segments.map((s) => (s.estimatedW - s.measuredW) / s.measuredW)
  return {
    nSegments: segments.length,
    mape: mean(relErr.map(Math.abs)),
    bias: mean(relErr),
    segments,
  }
}

/** Accuracy of a fixed model against measured power on climbs. */
export function scoreAccuracy(
  rides: CalibrationRide[],
  totalMassKg: number,
  model: BikeModel,
): VirtualPowerAccuracy {
  return summarize(rides.flatMap((ride) => scoreRide(ride, totalMassKg, model)))
}

/**
 * Scores each ride with a model calibrated on the other rides, then pools the
 * climb segments. With no other rides the default model is used.
 */
export function leaveOneOutAccuracy(
  rides: CalibrationRide[],
  totalMassKg: number,
): VirtualPowerAccuracy {
  const perRide = rides.map((ride) => rideStats(ride, totalMassKg))
  const total = perRide.reduce(addStats, emptyStats())
  return summarize(
    rides.flatMap((ride, i) => {
      const model = solveBikeModel(subtractStats(total, perRide[i]!))
      return scoreRide(ride, totalMassKg, model)
    }),
  )
}
