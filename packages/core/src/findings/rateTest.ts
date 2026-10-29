export interface RateRatioResult {
  /** (k1 / t1) / (k2 / t2): Infinity when only the first has events, NaN with no events or no time. */
  ratio: number
  /** Two-sided, exact. */
  p: number
}

/** log(n!) for 0 to `max`, built up once. */
function logFactorials(max: number): number[] {
  const table = [0]
  for (let i = 1; i <= max; i++) table.push(table[i - 1]! + Math.log(i))
  return table
}

function ratioOf(k1: number, t1: number, k2: number, t2: number): number {
  if (!(t1 > 0 && t2 > 0) || k1 + k2 === 0) return Number.NaN
  return k2 === 0 ? Number.POSITIVE_INFINITY : k1 / t1 / (k2 / t2)
}

/**
 * The exact test that two Poisson counts, k1 over exposure t1 and k2 over t2, come from one rate. Given
 * the total, k1 is binomial with chance t1 / (t1 + t2) if the rates are equal; the two-sided p adds the
 * outcomes no more likely than the one seen, as R's poisson.test does. The exposure is whatever the
 * counts are per: weeks, hard days, kilometres. Events that come in clusters (hard days follow one
 * another) vary more than a Poisson count does, so the p is too small for them: the caller reads it as
 * an upper bound on the evidence, and holds the detector to the null harness's rate, not to the p.
 */
export function poissonRateRatio(k1: number, t1: number, k2: number, t2: number): RateRatioResult {
  const total = k1 + k2
  const ratio = ratioOf(k1, t1, k2, t2)
  if (total === 0 || !(t1 > 0 && t2 > 0)) return { ratio, p: 1 }
  const chance = t1 / (t1 + t2)
  const logFactorial = logFactorials(total)
  const logProbability = (k: number) =>
    logFactorial[total]! -
    logFactorial[k]! -
    logFactorial[total - k]! +
    k * Math.log(chance) +
    (total - k) * Math.log(1 - chance)
  const seen = logProbability(k1)
  let p = 0
  for (let k = 0; k <= total; k++) {
    const log = logProbability(k)
    // Outcomes as likely as the one seen, to the relative 1e-7 R allows for rounding.
    if (log <= seen + 1e-7) p += Math.exp(log)
  }
  return { ratio, p: Math.min(1, p) }
}
