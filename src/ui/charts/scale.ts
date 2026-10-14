/** Maps a data value to a position in pixels. */
export type Scale = (value: number) => number

const EPSILON = 1e-9
const SQRT10 = Math.sqrt(10)
const SQRT50 = Math.sqrt(50)

/** Rounds away floating-point noise and turns -0 into 0. */
function roundTo(value: number): number {
  return Number(value.toPrecision(12)) + 0
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain
  const [r0, r1] = range
  if (d1 === d0) {
    const mid = (r0 + r1) / 2
    return () => mid
  }
  const slope = (r1 - r0) / (d1 - d0)
  return (value) => r0 + (value - d0) * slope
}

/** Linear in natural logs. Values at or below zero map to NaN. */
export function logScale(domain: [number, number], range: [number, number]): Scale {
  const linear = linearScale([Math.log(domain[0]), Math.log(domain[1])], range)
  return (value) => (value > 0 ? linear(Math.log(value)) : NaN)
}

/** A step of 1, 2 or 5 times a power of ten, chosen by the nearest of those in log space. */
function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / magnitude
  const unit = norm < Math.SQRT2 ? 1 : norm < SQRT10 ? 2 : norm < SQRT50 ? 5 : 10
  return unit * magnitude
}

/** Round tick values that cover [min, max], about `count` intervals apart. */
export function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || count < 1) return []
  const lo = Math.min(min, max)
  const hi = Math.max(min, max)
  if (lo === hi) return [lo]
  const step = niceStep((hi - lo) / count)
  const first = Math.ceil(lo / step - EPSILON)
  const last = Math.floor(hi / step + EPSILON)
  const ticks: number[] = []
  for (let k = first; k <= last; k++) ticks.push(roundTo(k * step))
  return ticks
}

/**
 * Range of the finite values, widened by `pad` times its span on each side. Returns [0, 1]
 * when there are no finite values.
 */
export function extent(values: readonly number[], pad = 0): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const value of values) {
    if (!Number.isFinite(value)) continue
    if (value < lo) lo = value
    if (value > hi) hi = value
  }
  if (lo > hi) return [0, 1]
  const span = hi - lo || 1
  return [lo - pad * span, hi + pad * span]
}

/**
 * A domain that starts and ends on tick values, so the axis never stops short of the data.
 * The ticks are every multiple of one step inside that domain.
 */
export function niceDomain(
  values: readonly number[],
  count: number,
  pad = 0.05,
): { domain: [number, number]; ticks: number[] } {
  const [lo, paddedHi] = extent(values, pad)
  const hi = paddedHi > lo ? paddedHi : lo + 1
  const step = niceStep((hi - lo) / count)
  const first = Math.floor(lo / step)
  const last = Math.ceil(hi / step)
  const ticks: number[] = []
  for (let k = first; k <= last; k++) ticks.push(roundTo(k * step))
  return { domain: [ticks[0] ?? lo, ticks[ticks.length - 1] ?? hi], ticks }
}

/**
 * Decimal places needed to label these ticks so that neighbours differ: enough to show the
 * smallest step exactly, capped at three.
 */
export function tickDecimals(ticks: number[]): number {
  let step = Infinity
  for (let i = 1; i < ticks.length; i++) {
    const gap = Math.abs((ticks[i] ?? 0) - (ticks[i - 1] ?? 0))
    if (gap > 0 && gap < step) step = gap
  }
  if (!Number.isFinite(step)) return 0
  let decimals = 0
  while (
    decimals < 3 &&
    Math.abs(Math.round(step * 10 ** decimals) - step * 10 ** decimals) > 1e-9
  ) {
    decimals++
  }
  return decimals
}
