import type { Ranged } from '../fitness/types'

/**
 * The look-back is posted to the page with the state, so its figures are kept to the digits anyone can read: five
 * significant digits are 0.01% of a figure, finer than a pace to the second, a power to the watt or a time to the
 * second; four are enough for a level or a change, which the page writes as a whole percent.
 */
export const sig = (x: number, digits = 5): number =>
  Number.isFinite(x) ? Number(x.toPrecision(digits)) : x

export const sigRanged = <T extends Ranged | null>(r: T): T =>
  (r === null ? r : { value: sig(r.value, 4), low: sig(r.low, 4), high: sig(r.high, 4) }) as T
