import { FLAT_RUN_COST, RESTING_W_PER_KG } from '@rca/core/constants'
import type { ActivitySummary, AnalysisResult, Equivalence } from '@rca/core/pipeline'
import type { RejectedFile } from '@rca/core/session'
import { countFlags } from '@rca/core/digest'
import type { Comparison, ComparisonPoint, Interval } from '@rca/core/types'
import type { AgeProfile } from '../grades'

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

/** A complete result with a run and a ride and a 1200 s comparison, so every card has data. */
export function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  const comparison: Comparison = { prior: [comparisonPoint()], calibrated: null }
  return {
    activities: [
      makeActivity({ id: 'run-1', sport: 'run' }),
      makeActivity({ id: 'ride-1', name: 'Hill ride', sport: 'ride', powerSource: 'virtual' }),
    ],
    runCurve: [],
    rideCurve: [],
    rideMetabolicCurve: [],
    runCp: { cp: 4.0, wPrime: 20, cpSe: 0.05, r2: 0.99, nPoints: 6 },
    rideCp: { cp: 3.0, wPrime: 15, cpSe: 0.04, r2: 0.98, nPoints: 6 },
    runCpRefusal: null,
    rideCpRefusal: null,
    hr: { run: null, ride: null, kappa: null, lnKappaSe: null },
    comparison,
    equivalents: [],
    maxHeartRate: null,
    runMaxHeartRate: null,
    rideMaxHeartRate: null,
    runObservedMaxHeartRate: null,
    rideObservedMaxHeartRate: null,
    heartRateSetAside: [],
    effort: [],
    bikeModel: { cda: 0.32, crr: 0.005 },
    bikeModelSource: 'default',
    virtualAccuracy: { nSegments: 3, mape: 0.06, bias: 0.01, segments: [] },
    ...overrides,
  }
}
