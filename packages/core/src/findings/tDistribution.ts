/** log Gamma(x) for x > 0 (Lanczos approximation, g = 7), accurate to about 1e-14. */
function logGamma(x: number): number {
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
  const shifted = x - 1
  let sum = coefficients[0]!
  for (let i = 1; i < 9; i++) sum += coefficients[i]! / (shifted + i)
  const t = shifted + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(sum)
}

/** The continued fraction of the regularized incomplete beta function (Lentz's method). */
function betaFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  d = 1 / (Math.abs(d) < tiny ? tiny : d)
  let h = d
  for (let m = 1; m <= 300; m++) {
    const even = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
    d = 1 + even * d
    c = 1 + even / c
    d = 1 / (Math.abs(d) < tiny ? tiny : d)
    h *= d * (Math.abs(c) < tiny ? tiny : c)
    const odd = (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1))
    d = 1 + odd * d
    c = 1 + odd / c
    d = 1 / (Math.abs(d) < tiny ? tiny : d)
    const step = d * (Math.abs(c) < tiny ? tiny : c)
    h *= step
    if (Math.abs(step - 1) < 1e-14) break
  }
  return h
}

/** The regularized incomplete beta function I_x(a, b), for x in [0, 1]. */
function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  )
  return x < (a + 1) / (a + b + 2)
    ? (front * betaFraction(a, b, x)) / a
    : 1 - (front * betaFraction(b, a, 1 - x)) / b
}

/** Student's t cumulative distribution at `degrees` of freedom (any positive real, as Welch's test gives). */
export function studentTCdf(t: number, degrees: number): number {
  if (!(degrees > 0) || Number.isNaN(t)) return Number.NaN
  const tail = 0.5 * regularizedBeta(degrees / (degrees + t * t), degrees / 2, 0.5)
  return t >= 0 ? 1 - tail : tail
}
