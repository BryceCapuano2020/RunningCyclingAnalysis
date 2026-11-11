import { NO_LOOKBACK } from '@rca/core/lookback'
import type { HindsightFitness, LookBack } from '@rca/core/lookback'

/** Synthetic: four years of running, with a quiet stretch in the middle. */
const T = (year: number, month: number) => Date.UTC(year, month - 1, 1)

export const RUN_YEARS: HindsightFitness = {
  kind: 'ok',
  fromMs: T(2020, 1),
  toMs: T(2024, 8),
  runs: 420,
  levels: [
    { fromMs: T(2020, 1), toMs: T(2021, 5), value: 3.4, low: 3.3, high: 3.5, runs: 120 },
    { fromMs: T(2021, 5), toMs: T(2022, 1), value: 3.15, low: 3.05, high: 3.25, runs: 64 },
    { fromMs: T(2022, 1), toMs: T(2023, 6), value: 3.4, low: 3.3, high: 3.5, runs: 140 },
    { fromMs: T(2023, 6), toMs: T(2024, 8), value: 3.2, low: 3.1, high: 3.3, runs: 96 },
  ],
  quiet: [{ fromMs: T(2022, 1), toMs: T(2023, 6), within: 0.03, runs: 140 }],
  thin: [],
  breaks: [],
  omittedSpans: 0,
}

/** A look-back with those years for the run and nothing for the ride. */
export const YEARS_LOOKBACK: LookBack = {
  ...NO_LOOKBACK,
  asOfMs: T(2024, 11),
  horizonMs: T(2024, 8),
  sports: {
    run: { sport: 'run', referenceHr: 148, fitness: RUN_YEARS, milestones: [] },
    ride: NO_LOOKBACK.sports.ride,
  },
}
