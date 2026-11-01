import { historyOf } from '@rca/core/history'
import type { BalanceYear, YearBest } from '@rca/core/history'
import { balanceLibrary, REFERENCE, SETTINGS } from '@rca/core/history/test/balanceLibrary'
import type { YearSpec } from '@rca/core/history/test/balanceLibrary'
import type { AgeProfile } from './grades'
import type { GradingInputs } from './pages/history/types'

export { SETTINGS, TWELVE_YEARS } from '@rca/core/history/test/balanceLibrary'

/** An athlete born in 1985: 28 in the first year of the twelve. */
export const PROFILE: AgeProfile = { birthYear: 1985, sex: 'male' }

/** What the History page grades by when the athlete has given a birth year and sex. */
export const GRADING: GradingInputs = { profile: PROFILE, missingAge: null, weightKnown: true }

/** The Balance rows the History makes of a synthetic library of these years, judged against a reference heart rate of 190. */
export function balanceRows(years: readonly YearSpec[]): BalanceYear[] {
  return historyOf(balanceLibrary(years), {
    settings: SETTINGS,
    setAside: new Set(),
    nowMs: Date.UTC(2030, 0, 1),
    gate: null,
    effortReference: REFERENCE,
  }).balance
}

/** A best on a June day of the year at a running speed, m/s; a ride's carries the range that an estimate has. */
export function bestAt(year: number, speed: number, extra: Partial<YearBest> = {}): YearBest {
  return { startMs: Date.UTC(year, 5, 10, 12), speed, range: null, verdict: 'hard', ...extra }
}

/** A row of the library with the run and the ride at these speeds, or none. */
export function rowOf(year: number, run: number | null, ride: number | null): BalanceYear {
  return {
    year,
    sports: {
      run: run === null ? null : bestAt(year, run),
      ride: ride === null ? null : bestAt(year, ride, { range: [ride - 0.1, ride + 0.1] }),
    },
  }
}
