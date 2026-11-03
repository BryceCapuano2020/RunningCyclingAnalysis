import { CP_FIT_MAX_S, CP_FIT_MIN_S, DURATIONS_S } from '../constants'
import { ENVELOPE_TIE_TOLERANCE } from '../curves/monotoneEnvelope'
import type { Curve } from '../types'

const DURATIONS = DURATIONS_S.length
/** A duration with no value, in the arrays below, so that a maximum over them ignores it. */
export const NONE = Number.NEGATIVE_INFINITY

/**
 * The pointwise maximum over a window of entries that moves forward, one entry in and one out at a time: two stacks,
 * as a queue with an aggregate. Each entry is pushed and popped once and a query costs one duration's worth, so a
 * library's weeks cost its size, not its size times the weeks' window.
 */
export class WindowMax {
  /** Suffix maxima of the entries [lo, mid): entry i's row holds the maximum over i to mid - 1. */
  private readonly front: Float64Array
  private readonly back = new Float64Array(DURATIONS).fill(NONE)
  private lo = 0
  private mid = 0
  private hi = 0

  private readonly rows: readonly Float64Array[]

  constructor(rows: readonly Float64Array[]) {
    this.rows = rows
    this.front = new Float64Array(rows.length * DURATIONS)
  }

  /** Brings entries up to `end` into the window. */
  pushTo(end: number): void {
    for (; this.hi < end; this.hi++) {
      const row = this.rows[this.hi]!
      for (let d = 0; d < DURATIONS; d++) if (row[d]! > this.back[d]!) this.back[d] = row[d]!
    }
  }

  /** Lets entries before `start` go. */
  popTo(start: number): void {
    for (; this.lo < start; this.lo++) {
      if (this.lo < this.mid) continue
      // The front is spent: the back becomes it, with the maxima from each entry to the newest.
      for (let i = this.hi - 1; i >= this.lo; i--) {
        const row = this.rows[i]!
        for (let d = 0; d < DURATIONS; d++) {
          const later = i + 1 < this.hi ? this.front[(i + 1) * DURATIONS + d]! : NONE
          this.front[i * DURATIONS + d] = Math.max(row[d]!, later)
        }
      }
      this.mid = this.hi
      this.back.fill(NONE)
    }
  }

  /** The maximum at duration `d` over the window. */
  at(d: number): number {
    const front = this.lo < this.mid ? this.front[this.lo * DURATIONS + d]! : NONE
    return Math.max(front, this.back[d]!)
  }
}

/**
 * The curve of a window as `bestOfEach` makes it, in values only: the best of the points that count at every
 * duration, held non-increasing by the monotone envelope, then the points that stand at their own duration alone
 * placed where they beat what is there, without rising above the nearest shorter duration with a value.
 */
export function windowCurve(best: WindowMax, standing: readonly Float64Array[]): Float64Array {
  const values = new Float64Array(DURATIONS)
  let ceiling = NONE
  let seen = false
  for (let d = DURATIONS - 1; d >= 0; d--) {
    let value = best.at(d)
    if (seen && value < ceiling - Math.abs(ceiling) * ENVELOPE_TIE_TOLERANCE) value = ceiling
    values[d] = value
    if (value > NONE && (!seen || value > ceiling)) {
      ceiling = value
      seen = true
    }
  }
  if (standing.length === 0) return values
  let shorter = Number.POSITIVE_INFINITY
  for (let d = 0; d < DURATIONS; d++) {
    let placed = values[d]!
    for (const alone of standing) {
      const value = alone[d]!
      if (value <= shorter && value > placed) placed = value
    }
    values[d] = placed
    if (placed > NONE) shorter = placed
  }
  return values
}

/** The curve in the shape the fit reads, from the durations it uses. */
export function fitCurve(values: Float64Array): Curve {
  const points: Curve = []
  DURATIONS_S.forEach((durationS, d) => {
    if (durationS < CP_FIT_MIN_S || durationS > CP_FIT_MAX_S) return
    const value = values[d]!
    points.push({
      durationS,
      value: value === NONE ? Number.NaN : value,
      activityId: null,
      startIndex: -1,
      windowS: null,
    })
  })
  return points
}
