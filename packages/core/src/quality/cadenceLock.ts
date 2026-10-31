import type { Range } from './runs'

/**
 * Cadence lock (revision 7): an optical heart-rate sensor that reproduces the stride or pedal rhythm reads a
 * number that agrees with the cadence second by second. A lock is a heart rate of no use, and a high one can
 * set the athlete's reference maximum. Values are starting points fixed by cadenceLock.sim.test.ts.
 */
export const CADENCE_LOCK = {
  /** Cadence below this is not a stride or a pedal stroke worth comparing. */
  minCadence: 60,
  /** Heart rate and cadence agree in a second when they differ by at most this, bpm against steps or rpm. */
  maxDifference: 3,
  /** A stretch survives this many seconds of disagreement in a row. */
  maxHoleS: 2,
  minStretchS: 30,
  /** Seconds at which both series changed, at least this many, for the share of equal signs to say anything. */
  minChanges: 10,
  /**
   * How many standard errors the share of equal signs must stand above chance (a half). Three is the design's
   * start; honest runs whose heart rate sits within a few beats of the cadence have hundreds of agreeing
   * stretches, and the selection itself leans them toward equal signs, so three flagged about one stretch in
   * 400 of them. Four flags about one in 7,000 and still finds a lock of 30 s (about 20 changes).
   */
  minZ: 4,
  /** A real heart rate varies; two flat numbers that happen to agree do not make a lock. */
  minSpread: 1,
  /** The flag reaches this far beyond the stretch, since the lock starts before it agrees to within the bound. */
  marginS: 5,
} as const

/** The standard deviation of the finite values of `values` over [start, end), or 0 with fewer than two. */
function spread(values: ArrayLike<number>, start: number, end: number): number {
  let n = 0
  let sum = 0
  let sumSquares = 0
  for (let i = start; i < end; i++) {
    const v = values[i]!
    if (!Number.isFinite(v)) continue
    n++
    sum += v
    sumSquares += v * v
  }
  if (n < 2) return 0
  const mean = sum / n
  return Math.sqrt(Math.max(0, sumSquares / n - mean * mean))
}

/**
 * Whether the heart rate moves with the cadence over [start, end): among the seconds at which both changed from
 * the one before, the share where they changed the same way stands well above a half, and neither series is flat.
 * A real heart rate is smooth and lags the legs; a locked one reproduces their jitter.
 */
function followsCadence(
  heartRate: ArrayLike<number>,
  cadence: ArrayLike<number>,
  start: number,
  end: number,
): boolean {
  const c = CADENCE_LOCK
  if (spread(heartRate, start, end) < c.minSpread || spread(cadence, start, end) < c.minSpread) {
    return false
  }
  let changes = 0
  let same = 0
  for (let i = start + 1; i < end; i++) {
    const dh = heartRate[i]! - heartRate[i - 1]!
    const dc = cadence[i]! - cadence[i - 1]!
    // A NaN change fails both comparisons below.
    if (!(dh !== 0 && dc !== 0)) continue
    changes++
    if (dh > 0 === dc > 0) same++
  }
  if (changes < c.minChanges) return false
  return same / changes - 0.5 >= (c.minZ * 0.5) / Math.sqrt(changes)
}

/**
 * The stretches of an activity where the heart rate follows the cadence: a maximal run of moving seconds with
 * a cadence of at least `minCadence` and a heart rate within `maxDifference` of it, holes of up to `maxHoleS`
 * seconds allowed, lasting `minStretchS` or more, over which the heart rate moves with the cadence. `cadence` is
 * in the sport's own unit (steps a minute for a run, revolutions for a ride). One pass; each stretch is read once.
 */
export function cadenceLockStretches(
  heartRate: ArrayLike<number>,
  cadence: ArrayLike<number>,
  moving: Uint8Array,
): Range[] {
  const c = CADENCE_LOCK
  const stretches: Range[] = []
  const settle = (start: number, end: number): void => {
    if (end - start >= c.minStretchS && followsCadence(heartRate, cadence, start, end)) {
      stretches.push({ start, end })
    }
  }
  let start = -1
  let last = -1
  for (let i = 0; i < moving.length; i++) {
    const cad = cadence[i]!
    const agrees =
      moving[i] === 1 && cad >= c.minCadence && Math.abs(heartRate[i]! - cad) <= c.maxDifference
    if (agrees) {
      if (start < 0) start = i
      last = i
    } else if (start >= 0 && i - last > c.maxHoleS) {
      settle(start, last + 1)
      start = -1
    }
  }
  if (start >= 0) settle(start, last + 1)
  return stretches
}
