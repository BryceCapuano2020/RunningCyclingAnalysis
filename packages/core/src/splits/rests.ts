import { MIN_RUN_SPEED_MS } from '../metabolic'

/** The rests of one run: which seconds are rests, and the metres each of them is credited with. */
export interface Rests {
  /** 1 for every second that is a rest. */
  rest: Uint8Array
  /**
   * Metres the run gained during each rest second, the stretch's gain shared evenly over its seconds,
   * and 0 for any second that is not a rest. A rest gains less than standing speed, so these are a
   * walk's few metres, or a held distance's none.
   */
  gain: Float64Array
}

/**
 * The rests of a run: stretches the device was not timing, across which the run advanced less than
 * standing speed. A pause or a gap the runner stood through, such as the recovery between reps, is a
 * rest. A gap across which the distance stepped by a run's worth, as a GPX file's tunnel does, is
 * not: the runner was moving through it, so its seconds stay in the clock. `moving` is 1 for every
 * second the device was timing. A reader of a time over the rest-free seconds takes each rest's gain
 * out of the distance too, so a walk through a rest is credited to neither.
 *
 * A stretch of samples i..end-1 covers the seconds [i, end), and the distance gained across it is
 * the rise from sample i to sample `end`, the first second the device timed again. When the device
 * resumes, that rise holds one second of running: the step from `end` to `end + 1` stands for it. Left
 * in, a pause of a few seconds would read as a jog. So that second is run, not rested: its metres come
 * off the rise and its second, the stretch's last, leaves the rest, which is what lets a reader divide
 * the distance less the rests' gain by the seconds less the rests. Where nothing was gained (a held
 * distance), the step after the resume sample is under standing speed (the runner was still standing),
 * or there is no step after it to read, nothing is taken off. The last
 * sample has no closing sample after it, so a stretch that reaches it is measured to it.
 */
export function restsOf(distance: Float64Array, moving: Uint8Array): Rests {
  const n = moving.length
  const rest = new Uint8Array(n)
  const gain = new Float64Array(n)
  let i = 0
  while (i < n) {
    if (moving[i] === 1) {
      i++
      continue
    }
    let end = i
    while (end < n && moving[end] !== 1) end++
    const measuredTo = Math.min(end, n - 1)
    let rise = distance[measuredTo]! - distance[i]!
    let seconds = measuredTo - i
    let restEnd = end
    if (end < n - 1) {
      const resumed = distance[end + 1]! - distance[end]!
      if (resumed >= MIN_RUN_SPEED_MS && rise > 0) {
        rise -= Math.min(resumed, rise)
        seconds -= 1
        restEnd = end - 1
      }
    }
    // A stretch with no measurable seconds gained nothing; one with a missing distance is not a rest.
    if (seconds <= 0 || rise / seconds < MIN_RUN_SPEED_MS) {
      rest.fill(1, i, restEnd)
      if (seconds > 0) gain.fill(Math.max(0, rise) / (restEnd - i), i, restEnd)
    }
    i = end
  }
  return { rest, gain }
}

/** The seconds that are rests, as restsOf marks them. */
export function restSeconds(distance: Float64Array, moving: Uint8Array): Uint8Array {
  return restsOf(distance, moving).rest
}
