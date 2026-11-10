import { NO_LOOKBACK } from '@rca/core/lookback'
import type { HindsightEpisode, HindsightFitness, LookBack } from '@rca/core/lookback'

/** Synthetic: four years of running, a slip in 2021 that came back, a slide in 2023 that held, and a rise in 2024. */
const T = (year: number, month: number) => Date.UTC(year, month - 1, 1)

const episode = (over: Partial<HindsightEpisode>): HindsightEpisode => ({
  kind: 'slip-back',
  fromMs: T(2021, 5),
  toMs: T(2022, 1),
  change: { value: -0.08, low: -0.1, high: -0.06 },
  regained: { value: 0.08, low: 0.06, high: 0.1 },
  remaining: null,
  z: -6.5,
  steps: 1,
  runs: 64,
  ...over,
})

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
  episodes: [
    episode({}),
    episode({
      kind: 'slip-open',
      fromMs: T(2023, 6),
      toMs: null,
      change: { value: -0.06, low: -0.08, high: -0.04 },
      regained: null,
      runs: 96,
    }),
  ],
  omittedEpisodes: 0,
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
