/** The element at index floor(n / 2) of the sorted values: no interpolation, so a median of slopes is a slope that exists. */
export function median(values: readonly number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!
}

export function mean(values: readonly number[]): number {
  return values.reduce((total, x) => total + x, 0) / values.length
}

export function standardDeviation(values: readonly number[]): number {
  const centre = mean(values)
  return Math.sqrt(values.reduce((total, x) => total + (x - centre) ** 2, 0) / values.length)
}

export interface Weighted {
  value: number
  weight: number
}

/** The first value, in order, at which the weights add up to half of their total; NaN where no weight is positive. */
export function weightedMedian(points: readonly Weighted[]): number {
  const live = points.filter((p) => p.weight > 0).sort((a, b) => a.value - b.value)
  const total = live.reduce((sum, p) => sum + p.weight, 0)
  let seen = 0
  for (const p of live) if ((seen += p.weight) >= total / 2) return p.value
  return NaN
}
