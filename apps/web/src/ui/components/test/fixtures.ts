import { FLAT_RUN_COST, HEADLINE_DURATION_S, RESTING_W_PER_KG } from '@rca/core/constants'
import type { ActivitySummary, AnalysisResult, Equivalence } from '@rca/core/pipeline'
import type { RejectedFile } from '@rca/core/session'
import { countFlags } from '@rca/core/digest'
import { ageGradeForEffort } from '@rca/core/grade'
import { flatSpeedOfWkg } from '@rca/core/display'
import { HOUR_S } from '@rca/core/threshold'
import { NO_EFFORT_GATE } from '@rca/core/effort'
import type { ThresholdEstimate } from '@rca/core/threshold'
import type { ZoneEstimates } from '@rca/core/zones'
import type { Comparison, ComparisonPoint, Interval } from '@rca/core/types'
import type { AgeProfile } from '../../grades'

export function interval(p05: number, p50: number, p95: number): Interval {
  return { p05, p50, p95 }
}

/** The gross W/kg that a run's best-effort curve holds for running speedMs on the flat. */
export function flatWkg(speedMs: number): number {
  return RESTING_W_PER_KG + FLAT_RUN_COST * speedMs
}

/** A 5 km run in 20 minutes: 67.6% for a man of 40 on the activity's date, Local. */
export const FIVE_K_IN_20_MIN_WKG = flatWkg(5000 / 1200)

/** A man born in 1986: 40 on any activity dated in 2026, the year the fixtures use. */
export const MAN_BORN_1986: AgeProfile = { birthYear: 1986, sex: 'male' }

export function comparisonPoint(overrides: Partial<ComparisonPoint> = {}): ComparisonPoint {
  return {
    durationS: 1200,
    ratio: interval(1.05, 1.12, 1.2),
    runMetabolic: interval(3.2, 3.4, 3.6),
    rideMetabolic: interval(2.8, 3.0, 3.2),
    ...overrides,
  }
}

export function makeActivity(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  const flags = overrides.flags ?? []
  return {
    id: 'activity-1',
    name: 'Morning run',
    sport: 'run',
    startMs: Date.UTC(2026, 0, 5, 7, 30),
    durationS: 3600,
    distanceM: 10000,
    elevationGainM: 120,
    hasHeartRate: true,
    indoor: false,
    powerSource: 'none',
    flags,
    flagCounts: countFlags(flags),
    maxHeartRate: null,
    ...overrides,
  }
}

export function makeEquivalence(overrides: Partial<Equivalence> = {}): Equivalence {
  return {
    durationS: 1200,
    ridePowerW: 250,
    runSpeed: interval(3.8, 4.0, 4.2),
    ...overrides,
  }
}

export function makeRejectedFile(overrides: Partial<RejectedFile> = {}): RejectedFile {
  return {
    fileName: 'broken.fit',
    reason: 'Could not read the file header',
    code: 'corrupt',
    ...overrides,
  }
}

/** A threshold estimate of `value` (gross metabolic W/kg) from three activities, with its range 5% either side and no heart rate. */
function makeEstimate(
  value: number,
  strongestId: string,
  overrides: Partial<ThresholdEstimate>,
): ThresholdEstimate {
  return {
    value,
    low: value * 0.95,
    high: value * 1.05,
    efforts: {
      value,
      relativeError: 0.025,
      rides: 3,
      strongest: { activityId: strongestId, durationS: 1200, estimated: false },
    },
    heartRate: { refused: 'no-heart-rate' },
    ...overrides,
  }
}

/** A ride threshold estimate of `value` from three rides. */
export function makeRideThreshold(
  value: number,
  overrides: Partial<ThresholdEstimate> = {},
): ThresholdEstimate {
  return makeEstimate(value, 'ride-1', overrides)
}

/** A run threshold estimate of `value` from three runs. */
export function makeRunThreshold(
  value: number,
  overrides: Partial<ThresholdEstimate> = {},
): ThresholdEstimate {
  return makeEstimate(value, 'run-1', overrides)
}

/** The fits a default result carries, and the estimates that stand for them. */
const DEFAULT_RIDE_CP = { cp: 3.0, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 6 }
const DEFAULT_RUN_CP = { cp: 4.0, wPrime: 20, cpSe: 0.05, r2: 0.99, nPoints: 6 }

/**
 * The speed that grades as an hour what a 20 min effort at speedMs grades as, for the man of 40 the fixtures use: how a fixture's
 * best 20 min stands for a threshold, so a test that sets a graded run or ride through its 20 min bests keeps that grade. Found
 * here by bisection over the age tables, not by the app's own inverse, so the fixtures stay independent of the code under test.
 */
function hourSpeedOf(speedMs: number): number {
  const grade = ageGradeForEffort(speedMs, HEADLINE_DURATION_S, 40, 'male')
  if (grade === null) return speedMs
  let [slow, fast] = [0.5, 12]
  for (let step = 0; step < 40; step++) {
    const middle = (slow + fast) / 2
    if ((ageGradeForEffort(middle, HOUR_S, 40, 'male') ?? 0) < grade) slow = middle
    else fast = middle
  }
  return (slow + fast) / 2
}

/**
 * The ride threshold as a running speed, for a fixture: the 20 min equivalence's when the result has one (so a test that
 * sets a ride through its equivalents grades that ride), else the flat speed of the threshold's own W/kg, with the range of its
 * low and high widened a tenth either way as the equivalence widens it.
 */
function rideSpeedOf(
  threshold: ThresholdEstimate | null,
  equivalents: readonly Equivalence[],
): Interval | null {
  if (threshold === null) return null
  const at = equivalents.find((e) => e.durationS === HEADLINE_DURATION_S)
  if (at !== undefined) {
    const { p05, p50, p95 } = at.runSpeed
    return { p05: hourSpeedOf(p05), p50: hourSpeedOf(p50), p95: hourSpeedOf(p95) }
  }
  const flat = (wkg: number) => Math.max(0, (wkg - RESTING_W_PER_KG) / FLAT_RUN_COST)
  return {
    p05: flat(threshold.low) * 0.9,
    p50: flat(threshold.value),
    p95: flat(threshold.high) * 1.1,
  }
}

/**
 * A complete result with a run and a ride and a 1200 s comparison, so every card has data. A fit given or left out
 * carries a matching threshold estimate, since the cards read the estimate: give `rideThreshold` or `runThreshold` to set it
 * on its own. A run given a best 20 min (and no fit) reads it as its threshold, and a ride's threshold as a running speed follows its 20 min
 * equivalence, so a test that builds a graded run or ride through its bests still gets that grade; give `runThreshold` or
 * `rideThresholdRunSpeed` to set them on their own.
 */
export function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  const comparison: Comparison = { prior: [comparisonPoint()], calibrated: null }
  const rideCp = overrides.rideCp === undefined ? DEFAULT_RIDE_CP : overrides.rideCp
  const runCp = overrides.runCp === undefined ? DEFAULT_RUN_CP : overrides.runCp
  // A fit given sets the threshold as it always did; only a result left to its defaults reads its best 20 min as the threshold.
  const best20 =
    overrides.runCp === undefined
      ? overrides.runCurve?.find((point) => point.durationS === HEADLINE_DURATION_S)
      : undefined
  const rideThreshold =
    overrides.rideThreshold !== undefined
      ? overrides.rideThreshold
      : rideCp === null
        ? null
        : makeRideThreshold(rideCp.cp)
  return {
    // Three of each, so the headline's rule of enough activities in the period is met.
    activities: [
      makeActivity({ id: 'run-1', sport: 'run' }),
      makeActivity({ id: 'run-2', name: 'Second run', sport: 'run' }),
      makeActivity({ id: 'run-3', name: 'Third run', sport: 'run' }),
      makeActivity({ id: 'ride-1', name: 'Hill ride', sport: 'ride', powerSource: 'virtual' }),
      makeActivity({ id: 'ride-2', name: 'Second ride', sport: 'ride', powerSource: 'virtual' }),
      makeActivity({ id: 'ride-3', name: 'Third ride', sport: 'ride', powerSource: 'virtual' }),
    ],
    runCurve: [],
    rideCurve: [],
    rideMetabolicCurve: [],
    rideMeasuredCurve: [],
    runCp: DEFAULT_RUN_CP,
    rideCp: DEFAULT_RIDE_CP,
    runThreshold:
      runCp === null
        ? null
        : makeRunThreshold(
            best20 === undefined ? runCp.cp : flatWkg(hourSpeedOf(flatSpeedOfWkg(best20.value))),
          ),
    rideThreshold,
    rideThresholdRunSpeed: rideSpeedOf(rideThreshold, overrides.equivalents ?? []),
    runCpRefusal: null,
    rideCpRefusal: null,
    runCpUneven: null,
    rideCpUneven: null,
    hr: { run: null, ride: null, kappa: null, lnKappaSe: null },
    comparison,
    equivalents: [],
    maxHeartRate: null,
    runMaxHeartRate: null,
    rideMaxHeartRate: null,
    runObservedMaxHeartRate: null,
    rideObservedMaxHeartRate: null,
    heartRateSetAside: [],
    runVo2max: null,
    effort: [],
    effortGate: { run: NO_EFFORT_GATE, ride: NO_EFFORT_GATE },
    bikeModel: { cda: 0.32, crr: 0.005 },
    bikeModelSource: 'default',
    virtualAccuracy: { nSegments: 3, mape: 0.06, bias: 0.01, segments: [] },
    ...overrides,
  }
}

/** The end of the window the fixtures' thresholds were taken over: a Sunday's last moment on the week axis (26 Oct 2025). */
export const FIXTURE_WINDOW_END_MS = Date.UTC(2025, 9, 26, 23, 59, 59, 999)

/**
 * Zone estimates in which an analysis's own thresholds hold on every date, so a test of what the zones show need not
 * build the library's thresholds by week. Each is the threshold of the 26 weeks to `FIXTURE_WINDOW_END_MS`.
 */
export function estimatesFrom(
  result: Pick<
    AnalysisResult,
    | 'runCp'
    | 'rideCp'
    | 'runMaxHeartRate'
    | 'rideMaxHeartRate'
    | 'runObservedMaxHeartRate'
    | 'rideObservedMaxHeartRate'
  >,
): ZoneEstimates {
  const always = (fit: AnalysisResult['runCp']) =>
    fit === null
      ? []
      : [{ fromMs: 0, fit, asOfMs: null, lastFit: 0, windowEndMs: FIXTURE_WINDOW_END_MS }]
  return {
    runMaxHeartRate: result.runMaxHeartRate,
    rideMaxHeartRate: result.rideMaxHeartRate,
    runObservedMaxHeartRate: result.runObservedMaxHeartRate,
    rideObservedMaxHeartRate: result.rideObservedMaxHeartRate,
    observedMaxSource: { run: null, ride: null },
    thresholds: { run: always(result.runCp), ride: always(result.rideCp) },
  }
}
