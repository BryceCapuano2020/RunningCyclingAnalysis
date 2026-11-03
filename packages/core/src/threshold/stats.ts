import { mean, selectInPlace } from '../math'

/**
 * The element at index floor(n / 2) of the sorted values: no interpolation, so a median of slopes is a slope that exists.
 * Not core's `medianInPlace`, which averages the two middle values of an even count: the guards here (a ride's offset against
 * the pooled one, the spread) were tuned on this one, and swapping moved simulated answers by up to 30%.
 */
export function median(values: ArrayLike<number>): number {
  return medianElementInPlace(Float64Array.from(values))
}

/** `median` of an array the caller does not need again: partly ordered in place by selection, with no copy and no full sort. */
export function medianElementInPlace(values: Float64Array): number {
  return selectInPlace(values, Math.floor(values.length / 2))
}

export function standardDeviation(values: readonly number[]): number {
  const centre = mean(values)
  return Math.sqrt(values.reduce((total, x) => total + (x - centre) ** 2, 0) / values.length)
}

export interface Weighted {
  value: number
  weight: number
}
