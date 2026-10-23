import { DURATIONS_S } from '@rca/core/constants'
import type {
  Comparison,
  ComparisonPoint,
  Curve,
  CurvePoint,
  HrCrossCheck,
  HrPoint,
  LinearFit,
  VirtualPowerAccuracy,
} from '@rca/core/types'
import { comparisonPoint, interval } from '../components/fixtures'

/** One best effort on a curve, set by the activity with the given id, or by none (null). */
export function curvePoint(
  durationS: number,
  value: number,
  activityId: string | null,
): CurvePoint {
  return { durationS, value, activityId, startIndex: activityId === null ? -1 : 0 }
}

/** A curve with values at the given durations and NaN everywhere else. */
export function curveOf(values: Record<number, number>): Curve {
  return DURATIONS_S.map((durationS) => {
    const value = values[durationS]
    return value === undefined
      ? curvePoint(durationS, NaN, null)
      : curvePoint(durationS, value, 'activity-1')
  })
}

export const runCurveFixture = curveOf({ 60: 17, 300: 15.6, 1200: 14.2, 3600: 12.8 })
export const rideMetabolicCurveFixture = curveOf({ 60: 18.5, 300: 16.4, 1200: 14 })
export const rideCurveFixture = curveOf({ 60: 1400, 300: 1230, 1200: 1050 })

export const priorFixture: ComparisonPoint[] = [
  comparisonPoint({ durationS: 60, ratio: interval(0.92, 1.0, 1.1) }),
  comparisonPoint({ durationS: 300, ratio: interval(1.02, 1.08, 1.14) }),
  comparisonPoint({ durationS: 1200, ratio: interval(0.98, 1.03, 1.09) }),
]

export const calibratedFixture: ComparisonPoint[] = [
  comparisonPoint({ durationS: 60, ratio: interval(0.95, 1.02, 1.09) }),
  comparisonPoint({ durationS: 300, ratio: interval(1.0, 1.05, 1.1) }),
  comparisonPoint({ durationS: 1200, ratio: interval(0.99, 1.01, 1.04) }),
]

export function comparisonFixture(calibrated: boolean): Comparison {
  return {
    prior: priorFixture,
    calibrated: calibrated ? calibratedFixture : null,
  }
}

function fit(slope: number, intercept: number, r2: number, n: number): LinearFit {
  return { slope, intercept, slopeSe: 0.5, r2, n }
}

const runPoints: HrPoint[] = [
  { metabolicPower: 13.5, heartRate: 150, activityId: 'run-1' },
  { metabolicPower: 14.5, heartRate: 160, activityId: 'run-1' },
  { metabolicPower: 15.5, heartRate: 170, activityId: 'run-1' },
]

const ridePoints: HrPoint[] = [
  { metabolicPower: 14, heartRate: 140, activityId: 'ride-1' },
  { metabolicPower: 15, heartRate: 152, activityId: 'ride-1' },
]

export const hrFixture: HrCrossCheck = {
  run: { points: runPoints, fit: fit(10, 15, 0.95, 3) },
  ride: { points: ridePoints, fit: fit(12, -28, 0.9, 2) },
  kappa: 1.2,
  lnKappaSe: 0.1,
}

export const hrRunOnlyFixture: HrCrossCheck = {
  run: { points: runPoints, fit: fit(10, 15, 0.95, 3) },
  ride: null,
  kappa: null,
  lnKappaSe: null,
}

export const accuracyFixture: VirtualPowerAccuracy = {
  nSegments: 2,
  mape: 0.05,
  bias: 0,
  segments: [
    { activityId: 'ride-1', start: 100, end: 340, measuredW: 250, estimatedW: 262 },
    { activityId: 'ride-2', start: 500, end: 620, measuredW: 300, estimatedW: 285 },
  ],
}

export const emptyAccuracyFixture: VirtualPowerAccuracy = {
  nSegments: 0,
  mape: 0,
  bias: 0,
  segments: [],
}
