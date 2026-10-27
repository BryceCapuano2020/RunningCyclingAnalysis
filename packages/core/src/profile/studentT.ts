const MAX_ITERATIONS = 200
const EPSILON = 1e-14
const TINY = 1e-300
const LANCZOS = [
  76.18009172947146, -86.5053203294168, 24.01409824083091, -1.231739572450155,
  0.1208650973866179e-2, -0.5395239384953e-5,
] as const

/** ln Gamma(x) for x > 0 (Lanczos, as in Numerical Recipes). */
function logGamma(x: number): number {
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5)
  let series = 1.00000000019001
  LANCZOS.forEach((c, j) => {
    series += c / (x + 1 + j)
  })
  return -tmp + Math.log((2.506628274631 * series) / x)
}

/** The continued fraction of the regularised incomplete beta function (modified Lentz). */
function betaFraction(a: number, b: number, x: number): number {
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  d = 1 / (Math.abs(d) < TINY ? TINY : d)
  let h = d
  for (let m = 1; m <= MAX_ITERATIONS; m++) {
    const even = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
    d = 1 + even * d
    c = 1 + even / c
    d = 1 / (Math.abs(d) < TINY ? TINY : d)
    h *= d * (Math.abs(c) < TINY ? TINY : c)
    const odd = (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1))
    d = 1 + odd * d
    c = 1 + odd / c
    d = 1 / (Math.abs(d) < TINY ? TINY : d)
    const step = d * (Math.abs(c) < TINY ? TINY : c)
    h *= step
    if (Math.abs(step - 1) < EPSILON) break
  }
  return h
}

/** The regularised incomplete beta function I_x(a, b), for 0 <= x <= 1. */
function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  )
  return x < (a + 1) / (a + b + 2)
    ? (front * betaFraction(a, b, x)) / a
    : 1 - (front * betaFraction(b, a, 1 - x)) / b
}

/** P(T > t) for Student's t with df degrees of freedom, at t >= 0. */
function upperTail(t: number, df: number): number {
  return 0.5 * incompleteBeta(df / 2, 0.5, df / (df + t * t))
}

/** The largest t the search tries: far past any quantile this module is asked for. */
const T_CEILING = 1e8

/**
 * The p quantile of Student's t with df degrees of freedom, for 0.5 <= p < 1: the t that a draw falls
 * below with probability p. Found by bisection on the incomplete beta function, so it is exact to
 * rounding for every df, including the 1 and 2 where series approximations fail.
 */
export function studentTQuantile(p: number, df: number): number {
  const tail = 1 - p
  let low = 0
  let high = T_CEILING
  for (let i = 0; i < MAX_ITERATIONS && high - low > EPSILON * high; i++) {
    const mid = (low + high) / 2
    if (upperTail(mid, df) > tail) low = mid
    else high = mid
  }
  return (low + high) / 2
}
