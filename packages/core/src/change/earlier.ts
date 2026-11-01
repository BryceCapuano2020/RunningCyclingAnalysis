import { sameAnalysisSettings } from '../athlete/references'
import { DURATIONS_S, HEADLINE_DURATION_S } from '../constants'
import { sportCurves } from '../digest/combine'
import { rideGateKey } from '../digest/estimatedRide'
import type { EstimatedRideGate } from '../digest/estimatedRide'
import { EVERY_EFFORT } from '../digest/readingRule'
import type { KeyedReadingRule, ReadingRule } from '../digest/readingRule'
import { memoByDigests } from '../digestMemo'
import { windowStart } from '../period'
import type { ActivityDigest, AthleteSettings, BikeModel, Sport } from '../types'
import { SPORTS } from '../types'
import { CHANGE } from './constants'
import { canTest, changeEvidence } from './evidence'
import { readingsOf } from './readings'
import type { Readings } from './readings'
import type { ChangeEvidence, EarlierComparison } from './types'
import { callAt, verdictAt } from './types'

/** Where the headline length sits in each sport's readings. */
const HEAD = DURATIONS_S.indexOf(HEADLINE_DURATION_S)

export interface EarlierInput {
  /** The period's first and last millisecond and its length in calendar days. */
  period: { startMs: number; endMs: number; days: number }
  settings: AthleteSettings
  bikeModel: BikeModel
  gate: EstimatedRideGate | null | undefined
  /** The effort rule the change test reads through, as the period before's test does. */
  rule: KeyedReadingRule
  /**
   * The change test against the period before, when it was made. A page that already has every sport tested needs no
   * window, and this answers that without pricing one.
   */
  immediate: ChangeEvidence | null
}

/** One period's best-20-minute readings, through the rule and through every effort (the test falls back to the second). */
interface Pair {
  every: Readings
  gated: Readings | null
}

function pairOf(digests: ActivityDigest[], input: EarlierInput): Pair {
  const { settings, bikeModel, gate, rule } = input
  const read = (through: ReadingRule): Readings =>
    readingsOf(digests, settings, bikeModel, gate, through, HEADLINE_DURATION_S)
  return {
    every: read(EVERY_EFFORT),
    gated: rule.rule === EVERY_EFFORT ? null : read(rule.rule),
  }
}

/** Whether the test can be made at the headline length for a sport: through the rule when it can, else through every effort. */
function testable(sport: Sport, now: Pair, before: Pair): boolean {
  const at = (readings: Readings) => readings[sport][HEAD]!
  if (
    now.gated !== null &&
    before.gated !== null &&
    canTest(sport, at(now.gated), at(before.gated))
  ) {
    return true
  }
  return canTest(sport, at(now.every), at(before.every))
}

/** The index of the first digest that starts at `ms` or later, in digests sorted by start. */
function firstFrom(sorted: readonly ActivityDigest[], ms: number): number {
  let [low, high] = [0, sorted.length]
  while (low < high) {
    const middle = (low + high) >> 1
    if (sorted[middle]!.startMs < ms) low = middle + 1
    else high = middle
  }
  return low
}

/**
 * The sports whose best 20 minutes the period could be tested on if the other side held enough: those with the
 * efforts for one side of the test.
 */
function needed(now: Pair): Sport[] {
  return SPORTS.filter((sport) => now.every[sport][HEAD]!.values.length >= CHANGE.minPerSide)
}

function compute(library: ActivityDigest[], input: EarlierInput): EarlierComparison | null {
  const { period, immediate } = input
  const { startMs, endMs, days } = period
  if (immediate !== null) {
    // The common case: every sport the period has efforts for is tested against the period before.
    const known = SPORTS.filter(
      (sport) => (callAt(immediate, sport, HEADLINE_DURATION_S)?.now ?? 0) >= CHANGE.minPerSide,
    )
    if (known.every((sport) => verdictAt(immediate, sport, HEADLINE_DURATION_S) !== 'untested')) {
      return null
    }
  }
  const selected = library.filter((d) => d.startMs >= startMs && d.startMs <= endMs)
  const now = pairOf(selected, input)
  const sports = needed(now)
  if (sports.length === 0) return null
  const sorted = library.slice().sort((a, b) => a.startMs - b.startMs)
  const oldest = sorted[0]!.startMs
  // How many of the sports each window tests; the period before is the one to beat, and the first window to test them all is the one.
  let best: { digests: ActivityDigest[]; from: number; to: number; tested: number } | null = null
  let beat = 0
  for (let back = 1; ; back++) {
    const [from, to] = [windowStart(startMs, days, back), windowStart(startMs, days, back - 1)]
    if (to <= oldest) break
    const digests = sorted.slice(firstFrom(sorted, from), firstFrom(sorted, to))
    // A window with fewer activities than one side of the test needs holds no sport it can test.
    if (digests.length < CHANGE.minPerSide) continue
    const before = pairOf(digests, input)
    const tested = sports.filter((sport) => testable(sport, now, before)).length
    if (back === 1) {
      beat = tested
      if (beat === sports.length) return null
      continue
    }
    if (tested > beat) {
      best = { digests, from, to, tested }
      beat = tested
      if (tested === sports.length) break
    }
  }
  if (best === null) return null
  const { settings, bikeModel, gate, rule } = input
  return {
    startMs: best.from,
    endMs: best.to - 1,
    previous: sportCurves(best.digests, settings, bikeModel, gate),
    change: changeEvidence(selected, best.digests, settings, bikeModel, gate, rule.rule),
  }
}

const remembered = memoByDigests<EarlierInput, EarlierComparison | null>(
  compute,
  (a, b) =>
    a.period.startMs === b.period.startMs &&
    a.period.endMs === b.period.endMs &&
    a.period.days === b.period.days &&
    sameAnalysisSettings(a.settings, b.settings) &&
    rideGateKey(a.gate) === rideGateKey(b.gate) &&
    a.rule.key === b.rule.key,
)

/**
 * The window the What changed strip compares with when the period before holds too little: the latest window of the
 * same length, further back, in which the change test can be made for every sport the period has efforts for (the
 * `CHANGE` minimums of each side and together, unchanged). Failing that, the latest that tests more sports than the
 * period before does. Null when the period before already tests as many as any window, and for all time, which has no
 * window before it. A function of the digests and of what `input` reads of them, remembered for the same digests.
 */
export function earlierComparison(
  library: ActivityDigest[],
  input: EarlierInput,
): EarlierComparison | null {
  return library.length === 0 ? null : remembered(library, input)
}
