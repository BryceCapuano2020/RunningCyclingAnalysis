import type { Sport } from '../types'
import { FITNESS } from './params'

/**
 * Fitness at the same effort, per sport: the state of the athlete's output at one heart rate against their
 * own earlier level. Types only, so the page can import them without loading the analysis.
 */

/**
 * What the athlete sees. `holding-below` is a plateau under the old level; `improving` is a clear rise
 * with no slip before it (a status line only, never a finding); `not-enough-evidence` has a `shortfall`.
 */
export type FitnessState =
  | 'slipping'
  | 'holding'
  | 'holding-below'
  | 'recovering'
  | 'back'
  | 'improving'
  | 'not-enough-evidence'

/** The states a library can be in once it has enough evidence. */
export type SpokenState = Exclude<FitnessState, 'not-enough-evidence'>

/** A change as a fraction (0.05 is 5% more, negative is less) with the ends of its 90% range. */
export interface Ranged {
  value: number
  low: number
  high: number
}

/** Why a status cannot say more, with the counts behind it, so the page can show what is missing. */
export type Shortfall =
  /** The runs 8 to 44 weeks ago that the earlier level is read from: `have` of the `need` over `needWeeks` distinct weeks. */
  | { kind: 'history'; have: number; need: number; weeks: number; needWeeks: number }
  /** Fewer than `need` steady runs in the last `weeks` weeks. */
  | { kind: 'recent'; have: number; need: number; weeks: number }
  /** No steady run for `weeksSince` weeks. */
  | { kind: 'break'; weeksSince: number }
  /** The level is known only to within `within` (a fraction), too loosely to call it level. */
  | { kind: 'imprecise'; within: number }
  /** This sport is not compared at the same heart rate yet. */
  | { kind: 'unavailable' }

/** The runs behind a figure: the stretch they span and their ids, for the evidence panel. */
export interface FitnessSpan {
  fromMs: number
  toMs: number
  runs: number
  /** Distinct calendar weeks the runs fall in. */
  weeks: number
  ids: string[]
}

/** How the values were read from the activities, for the method line. */
export interface FitnessMethod {
  /** `steady-pace` admits runs whose pace holds from kilometre to kilometre; `strict` also needs a steady heart rate. */
  tier: 'steady-pace' | 'strict' | 'power'
  /** Share of the grade credit that shows at the same heart rate (0 to 1 reads as the model's credit kept), and bpm slope per cent. */
  gradePassThrough: number | null
  speedPerBpm: number
  /** Kilometres (or blocks) the fit stood on. */
  fitted: number
}

export interface FitnessEvidence {
  /** The runs behind the level now. */
  recent: FitnessSpan
  /** The runs behind the earlier level it is compared with (counts and span, not ids); null when there is none. */
  baseline: Omit<FitnessSpan, 'ids'> | null
  method: FitnessMethod
}

/** The week a state began, and the strength of the test that began it. */
export interface FitnessEntry {
  /** End of the week it was first shown, Sunday 23:59:59.999 UTC. */
  atMs: number
  /** The test statistic that crossed, signed like the change. */
  z: number
}

export interface FitnessStatus {
  sport: Sport
  state: FitnessState
  /** The heart rate the output is read at, bpm; null without a steady run. */
  referenceHr: number | null
  /** Output at the reference heart rate: m/s for a run, W for a ride. Null without a state to give. */
  now: number | null
  /** The earlier level it is compared with, in the same unit. */
  before: number | null
  /** now against before. */
  change: Ranged | null
  /** What a recovering athlete has regained since the low. */
  gain: Ranged | null
  /** Holding: how far from level the runs allow it to be (|change| plus the half-width of its range). */
  within: number | null
  /** The month the change began (the start of the estimated onset week), and the month of the low. */
  onsetMs: number | null
  lowMs: number | null
  evidence: FitnessEvidence | null
  shortfall: Shortfall | null
  /** When the state began and with what test; null for holding that was never interrupted and for no state. */
  entered: FitnessEntry | null
  /** Steady runs (or rides) in the whole library, whatever the state. */
  steady: number
  /** The newest activity the status rests on. */
  asOfMs: number
}

export type FitnessBySport = Record<Sport, FitnessStatus>

/** Nothing to say: no library. */
export function noFitness(sport: Sport): FitnessStatus {
  return {
    sport,
    state: 'not-enough-evidence',
    referenceHr: null,
    now: null,
    before: null,
    change: null,
    gain: null,
    within: null,
    onsetMs: null,
    lowMs: null,
    evidence: null,
    shortfall: {
      kind: 'history',
      have: 0,
      need: FITNESS.monitor.minRefRuns,
      weeks: 0,
      needWeeks: FITNESS.monitor.minRefWeeks,
    },
    entered: null,
    steady: 0,
    asOfMs: 0,
  }
}

export const NO_FITNESS: FitnessBySport = { run: noFitness('run'), ride: noFitness('ride') }
