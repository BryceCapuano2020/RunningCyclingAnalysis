/**
 * The metres each sample adds to the climb, over the samples whose grade is valid. A 2 m
 * hysteresis stops barometer noise from adding up as climbing. The climb of any span is the sum
 * of its samples, so a run's splits can share one pass without changing its total.
 */
export function elevationIncrements(altitude: Float64Array, validGrade: Uint8Array): Float64Array {
  const out = new Float64Array(altitude.length)
  let anchor = NaN
  for (let i = 0; i < altitude.length; i++) {
    if (validGrade[i] !== 1) {
      anchor = NaN
      continue
    }
    const a = altitude[i]!
    if (Number.isNaN(a)) continue
    if (Number.isNaN(anchor)) anchor = a
    if (a - anchor >= 2) {
      out[i] = a - anchor
      anchor = a
    } else if (anchor - a >= 2) {
      anchor = a
    }
  }
  return out
}

/** Metres climbed over the whole run, from its per-sample increments. */
export function elevationGain(altitude: Float64Array, validGrade: Uint8Array): number {
  let gain = 0
  for (const step of elevationIncrements(altitude, validGrade)) gain += step
  return gain
}
