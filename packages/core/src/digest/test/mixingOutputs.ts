import { FITNESS } from '../../fitness'
import type { SessionState } from '../../sessionState'
import { SAME_HEART_RATE } from '../../constants'
import type { Curve, Sport } from '../../types'

/**
 * What the mixing study (D12 section 1.8) compares between a mixed library and the same library on revision 7 alone:
 * one number or small list per consumer the revision can move, read from the state the session gives.
 */
export interface MixingOutputs {
  /** The best value at each duration of the period, run (flat speed as W/kg) and ride (W), NaN where none. */
  bests: Record<Sport, number[]>
  /** The weekly best 20 minutes over the period, by week, run and ride. */
  trend: Record<Sport, number[]>
  /** The reference maximum heart rates the zone edges are cut from, bpm. */
  referenceHr: Record<Sport, number | null>
  /** The thresholds the pace and power zones are cut from. */
  threshold: Record<Sport, number | null>
  /** The run/ride lean at 20 minutes, calibrated when it is. */
  lean: number | null
  /** The fitness each sport says: its state, the output at the reference heart rate now and the earlier level it is compared with. */
  fitness: Record<Sport, { state: string; now: number | null; before: number | null }>
  /** The change test's verdict for every sport and duration of the period against the one before. */
  verdicts: string[]
  /** Who holds each record: `activityId:record`. */
  holders: string[]
}

const SPORTS: Sport[] = ['run', 'ride']

const values = (curve: Curve): number[] => curve.map((point) => point.value)

export function outputsOf(state: SessionState): MixingOutputs {
  const result = state.result
  const comparison = result?.comparison
  const points = comparison?.calibrated ?? comparison?.prior ?? []
  const lean = points.find((point) => point.durationS === 1200)?.ratio.p50 ?? null
  const zones = state.zoneEstimates
  const fitness = state.fitness
  const holders: string[] = []
  for (const [id, records] of state.records) {
    for (const record of records) {
      holders.push(
        `${id}:${record.kind === 'duration' ? `d${record.durationS}` : `m${record.distanceM}`}`,
      )
    }
  }
  const thresholdOf = (sport: Sport): number | null => {
    const steps = zones?.thresholds[sport] ?? []
    return steps[steps.length - 1]?.fit?.cp ?? null
  }
  return {
    bests: {
      run: result ? values(result.runCurve) : [],
      ride: result ? values(result.rideCurve) : [],
    },
    trend: {
      run: state.trend.flatMap((point) => (point.runWkg === null ? [] : [point.runWkg])),
      ride: state.trend.flatMap((point) => (point.rideWkg === null ? [] : [point.rideWkg])),
    },
    referenceHr: {
      run: zones?.runMaxHeartRate ?? null,
      ride: zones?.rideMaxHeartRate ?? null,
    },
    threshold: { run: thresholdOf('run'), ride: thresholdOf('ride') },
    lean,
    fitness: {
      run: { state: fitness.run.state, now: fitness.run.now, before: fitness.run.before },
      ride: { state: fitness.ride.state, now: fitness.ride.now, before: fitness.ride.before },
    },
    verdicts: SPORTS.flatMap((sport) =>
      (state.change?.[sport] ?? []).map((call) => `${sport}${call.durationS}:${call.verdict}`),
    ),
    holders: holders.sort(),
  }
}

/** The bounds of section 1.8, each a third of the floor in force, read from the constants they are floors of. */
export const BOUNDS = {
  /** A third of the 1% a best-effort value must move to be a clear change. */
  best: 0.01 / 3,
  /** A third of the step the reference heart rate is rounded to, bpm. */
  zoneBpm: SAME_HEART_RATE.referenceStepBpm / 3,
  /** A third of the monitor's delta, in log units. */
  fitness: FITNESS.monitor.delta / 3,
} as const
