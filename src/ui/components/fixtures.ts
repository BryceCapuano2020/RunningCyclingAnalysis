import type { ActivitySummary, AnalysisResult, Equivalence } from '../../core/pipeline'
import type { RejectedFile } from '../../core/session'
import type { Comparison, ComparisonPoint, Interval } from '../../core/types'

export function interval(p05: number, p50: number, p95: number): Interval {
  return { p05, p50, p95 }
}

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
  return {
    id: 'activity-1',
    name: 'Morning run',
    sport: 'run',
    startMs: Date.UTC(2026, 0, 5, 7, 30),
    durationS: 3600,
    distanceM: 10000,
    elevationGainM: 120,
    hasHeartRate: true,
    powerSource: 'none',
    flags: [],
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
  return { fileName: 'broken.fit', reason: 'Could not read the file header', ...overrides }
}

/** A complete result with a run and a ride, a 1200 s comparison, and all tiles available. */
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
    hr: { run: null, ride: null, kappa: null, lnKappaSe: null },
    comparison,
    equivalents: [],
    bikeModel: { cda: 0.32, crr: 0.005 },
    virtualAccuracy: { nSegments: 3, mape: 0.06, bias: 0.01, segments: [] },
    ...overrides,
  }
}
