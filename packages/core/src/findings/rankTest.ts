import { twoSidedP } from './stats'

export interface RankTestResult {
  /** The Mann-Whitney U of the first sample: pairs where it is larger, ties counting half. */
  u: number
  /** Signed: positive when the first sample tends to be larger. Continuity-corrected. */
  z: number
  /** Two-sided, from the normal approximation with the tie correction. */
  p: number
  /** The chance that a value of the first sample is larger than one of the second, ties half: U over nA nB. */
  probability: number
}

/** Average ranks (1 up) of the values, ties sharing theirs, with the sizes of the tie groups. */
function ranked(values: readonly number[]): { ranks: number[]; ties: number[] } {
  const order = values.map((_, i) => i).sort((i, j) => values[i]! - values[j]!)
  const ranks = new Array<number>(values.length)
  const ties: number[] = []
  for (let start = 0; start < order.length;) {
    let end = start
    while (end + 1 < order.length && values[order[end + 1]!] === values[order[start]!]) end++
    const rank = (start + end) / 2 + 1
    for (let k = start; k <= end; k++) ranks[order[k]!] = rank
    if (end > start) ties.push(end - start + 1)
    start = end + 1
  }
  return { ranks, ties }
}

/**
 * The Mann-Whitney test of two samples by the normal approximation with a continuity correction and
 * the correction for ties, two-sided: the test of "is one sample larger than the other" that does not
 * mind a few wild values. Matches SciPy's mannwhitneyu(method='asymptotic') and R's wilcox.test with
 * exact = FALSE. Values that are not numbers are left out. An empty sample, or every value equal, gives p = 1.
 */
export function rankTest(first: readonly number[], second: readonly number[]): RankTestResult {
  const a = first.filter(Number.isFinite)
  const b = second.filter(Number.isFinite)
  const nA = a.length
  const nB = b.length
  if (nA === 0 || nB === 0) return { u: 0, z: 0, p: 1, probability: 0.5 }
  const { ranks, ties } = ranked([...a, ...b])
  const rankSum = ranks.slice(0, nA).reduce((sum, r) => sum + r, 0)
  const u = rankSum - (nA * (nA + 1)) / 2
  const n = nA + nB
  const tieTerm = ties.reduce((sum, t) => sum + (t ** 3 - t) / (n * (n - 1)), 0)
  const variance = ((nA * nB) / 12) * (n + 1 - tieTerm)
  const probability = u / (nA * nB)
  if (!(variance > 0)) return { u, z: 0, p: 1, probability }
  const offset = u - (nA * nB) / 2
  const z = Math.abs(offset) < 0.5 ? 0 : (offset - 0.5 * Math.sign(offset)) / Math.sqrt(variance)
  return { u, z, p: twoSidedP(z), probability }
}

/** A time that may be cut off: `censored` means the event had not happened by `value`, which is only a lower bound. */
export interface Censored {
  value: number
  censored: boolean
}

export interface CensoredRankResult {
  /** Events seen in the first sample, and events expected in it if both samples had the same timing. */
  observed: number
  expected: number
  /** Signed: positive when the first sample's events come later than the second's (fewer than expected). */
  z: number
  /** Two-sided. */
  p: number
}

/**
 * A rank comparison of two samples of times that may be cut off (such as the minute fade begins, when a
 * session ends first): the log-rank test, which counts at each event time the events in the first sample
 * against the share of those still waiting that are in it. A cut-off time is not an event, and an event
 * at a time ties before a cut-off at it. Matches R's survdiff.
 */
export function censoredRankTest(
  a: readonly Censored[],
  b: readonly Censored[],
): CensoredRankResult {
  const times = [...new Set([...a, ...b].filter((s) => !s.censored).map((s) => s.value))].sort(
    (x, y) => x - y,
  )
  let observed = 0
  let expected = 0
  let variance = 0
  for (const time of times) {
    const atRiskA = a.filter((s) => s.value >= time).length
    const atRisk = atRiskA + b.filter((s) => s.value >= time).length
    const eventsA = a.filter((s) => !s.censored && s.value === time).length
    const events = eventsA + b.filter((s) => !s.censored && s.value === time).length
    observed += eventsA
    expected += (events * atRiskA) / atRisk
    if (atRisk > 1) {
      const share = atRiskA / atRisk
      variance += (events * share * (1 - share) * (atRisk - events)) / (atRisk - 1)
    }
  }
  if (!(variance > 0)) return { observed, expected, z: 0, p: 1 }
  const z = (expected - observed) / Math.sqrt(variance)
  return { observed, expected, z, p: twoSidedP(z) }
}
