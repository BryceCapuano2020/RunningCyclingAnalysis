/**
 * The three rep-max equations the e1RM point is the median of (docs/design/e1rm.md, section 1). Each
 * takes a load `w` and reps to failure `R` (fractional allowed) and returns the one-rep load.
 */
import { LOMBARDI_EXPONENT } from './constants'

export const epley = (w: number, reps: number): number => w * (1 + reps / 30)
export const brzycki = (w: number, reps: number): number => (36 * w) / (37 - reps)
export const lombardi = (w: number, reps: number): number => w * Math.pow(reps, LOMBARDI_EXPONENT)

const median3 = (a: number, b: number, c: number): number =>
  Math.max(Math.min(a, b), Math.min(Math.max(a, b), c))

/** The median of the three equations; the load itself at one rep or fewer. */
export function medianEquation(w: number, reps: number): number {
  return reps <= 1 ? w : median3(epley(w, reps), brzycki(w, reps), lombardi(w, reps))
}

/**
 * The mean of the three equations' log-slopes at `reps`: turns an error in reps into one in load. Smooth
 * in `reps`, unlike the slope of the median, which jumps where the median changes equation.
 */
export function logSlope(reps: number): number {
  return (1 / (30 + reps) + 1 / (37 - reps) + LOMBARDI_EXPONENT / reps) / 3
}

/** Half the spread of the three equations at `reps`, as a share of the median (log-ish units). */
export function equationsSpread(reps: number): number {
  if (reps <= 1) return 0
  const e = [epley(1, reps), brzycki(1, reps), lombardi(1, reps)]
  return (Math.max(...e) - Math.min(...e)) / 2 / medianEquation(1, reps)
}
