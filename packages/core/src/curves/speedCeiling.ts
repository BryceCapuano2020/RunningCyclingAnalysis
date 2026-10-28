/** A speed, m/s, that no effort of the given duration, s, can average over. Sorted by duration. */
export interface CeilingEntry {
  durationS: number
  speedMs: number
}

/**
 * The ceiling at durationS from a table. Between two entries it is a straight line in log duration
 * and log speed; beyond the ends of the table it holds the end value.
 */
export function interpolatedCeiling(table: readonly CeilingEntry[], durationS: number): number {
  const first = table[0]!
  const last = table.at(-1)!
  if (durationS <= first.durationS) return first.speedMs
  if (durationS >= last.durationS) return last.speedMs
  const hiIndex = table.findIndex((entry) => entry.durationS >= durationS)
  const lo = table[hiIndex - 1]!
  const hi = table[hiIndex]!
  if (hi.durationS === durationS) return hi.speedMs
  const share =
    (Math.log(durationS) - Math.log(lo.durationS)) /
    (Math.log(hi.durationS) - Math.log(lo.durationS))
  return Math.exp(Math.log(lo.speedMs) + share * (Math.log(hi.speedMs) - Math.log(lo.speedMs)))
}
