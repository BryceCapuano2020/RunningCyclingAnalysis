import type { DigestCurvePoint } from '../digest/partTypes'
import { interpolatedCeiling } from './speedCeiling'

/**
 * The published top of what riders hold, W/kg, at four durations: the lower edge of the "World Class
 * (international pro)" row of the men's power profile in Hunter Allen and Andrew Coggan, Training and
 * Racing with a Power Meter, 2nd ed.: 22.8 W/kg for 5 s, 10.6 for 1 min, 6.8 for 5 min and 5.6 for 60
 * min. The men's row is used for every athlete: the women's row is 11 to 22% lower, so it would
 * flag riders the men's row lets through, and the sex is not known where power is priced.
 */
export const WORLD_CLASS_POWER_WKG: readonly { durationS: number; wkg: number }[] = [
  { durationS: 5, wkg: 22.8 },
  { durationS: 60, wkg: 10.6 },
  { durationS: 300, wkg: 6.8 },
  { durationS: 3600, wkg: 5.6 },
]

/**
 * How far past the world-class edge a sustained power is still believable. The row marks where
 * professionals start, not their best, so a quarter of that again is allowed before a file is called
 * implausible; the faults this catches (a plateau of 700 W or more, a motor's output) are far beyond.
 */
export const POWER_CEILING_MARGIN = 1.25

/** Ceiling points in the shape the speed tables use, so the same log-log interpolation applies. */
const CEILING_TABLE = WORLD_CLASS_POWER_WKG.map((entry) => ({
  durationS: entry.durationS,
  speedMs: entry.wkg * POWER_CEILING_MARGIN,
}))

/**
 * The most W/kg a rider holds for durationS: the world-class edge, widened by the margin. Between the
 * profile's durations it is a line in log duration and log W/kg; beyond its ends it holds the end value.
 */
export function ridePowerCeilingWkg(durationS: number): number {
  return interpolatedCeiling(CEILING_TABLE, durationS)
}

// A ride's flag depends on its curve and the body mass of its day; both are fixed for a digest, so
// the answer is kept for the one mass it was last asked at.
const flags = new WeakMap<object, { bodyKg: number; implausible: boolean }>()

/**
 * Whether a ride's measured power is implausible for the rider's mass: any best of the activity above the
 * ceiling for its duration. Points priced from slope and speed (virtual power) are not power-meter
 * readings and are not judged here. One such best sets the whole activity aside, because a
 * miscalibrated meter, a wrong weight or a motor shows at every duration, and a glitch plateau at
 * the durations it covers.
 */
export function implausiblePower(
  digest: { curve: readonly DigestCurvePoint[] },
  bodyKg: number,
): boolean {
  const held = flags.get(digest)
  if (held !== undefined && held.bodyKg === bodyKg) return held.implausible
  const implausible = digest.curve.some(
    (point) =>
      point.terms === null &&
      Number.isFinite(point.value) &&
      point.value / bodyKg > ridePowerCeilingWkg(point.durationS),
  )
  flags.set(digest, { bodyKg, implausible })
  return implausible
}
