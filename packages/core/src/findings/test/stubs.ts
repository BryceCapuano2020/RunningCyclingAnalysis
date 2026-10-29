import type { Sport } from '../../types'
import type { Candidate, Detector, FindingInput, Kind } from '../types'

const DAY_MS = 86_400_000

/** A history in which an effect of 6 is a long way from anything that happened: surprise 1. */
export const WILD_HISTORY = {
  effect: 6,
  noise: Array.from({ length: 26 }, (_, i) => (i % 2 === 0 ? 1 : -1)),
  past: Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 1 : -1)),
}

/**
 * A candidate that clears the bar (confidence 1, surprise 1) unless `over` says otherwise, dated to the
 * input it is made for: its window ends at the input's date, its baseline a month before that.
 */
export function stubCandidate(over: Partial<Candidate>, input: FindingInput): Candidate {
  const asOfMs = input.asOfMs
  return {
    subject: 'thing',
    sports: ['run'],
    direction: 'better',
    effect: 0.05,
    window: { fromMs: asOfMs - 28 * DAY_MS, toMs: asOfMs },
    baseline: { fromMs: asOfMs - 84 * DAY_MS, toMs: asOfMs - 56 * DAY_MS },
    headline: 'Your pace at 145 bpm is 18 s/km faster than 8 weeks ago.',
    numbers: [{ key: 'pace', value: 352, unit: 's/km' }],
    evidence: [{ type: 'week', endMs: asOfMs }],
    support: { sign: { kind: 'agree', share: 1 }, n: 10, nNeeded: 10, robust: true },
    surprise: WILD_HISTORY,
    method: { test: 'stub', n: 10, exclusions: [] },
    asOfMs,
    ...over,
  }
}

interface StubOptions {
  kind?: Kind
  sports?: readonly Sport[]
  minHistoryWeeks?: number
  /** What the detector says at an input; one clearing candidate always when not given. */
  says?: (input: FindingInput, sport: Sport) => Candidate[]
}

/** A detector that says what it is told to. */
export function stubDetector(id: string, options: StubOptions = {}): Detector {
  return {
    id,
    kind: options.kind ?? 'efficiency',
    sports: options.sports ?? ['run'],
    minHistoryWeeks: options.minHistoryWeeks ?? 0,
    run: options.says ?? ((input) => [stubCandidate({}, input)]),
  }
}
