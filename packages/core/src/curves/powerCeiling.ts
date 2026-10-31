import type { DigestCurvePoint } from '../digest/partTypes'
import { interpolatedCeiling } from './speedCeiling'

/**
 * The top of what riders hold, W/kg, at four durations, from a widely published power-profile table (the
 * "World Class (international pro)" row for men, from the Allen and Coggan power profile): 22.8 W/kg for 5 s,
 * 10.6 for 1 min, 6.8 for 5 min and 5.6 for 60 min. Copies of the table differ, and the primary source was not
 * checked; a higher copy (25.2, 11.5, 7.6 and 6.6) is still under the ceiling these give once the margin is
 * applied. The men's row is used for every athlete: copies of the women's row run 11 to 22% lower, so
 * it would flag riders the men's row lets through, and the sex is not known where power is priced.
 */
export const WORLD_CLASS_POWER_WKG: readonly { durationS: number; wkg: number }[] = [
  { durationS: 5, wkg: 22.8 },
  { durationS: 60, wkg: 10.6 },
  { durationS: 300, wkg: 6.8 },
  { durationS: 3600, wkg: 5.6 },
]

/**
 * A node of our own, not of the table: the 15 s power of an elite sprinter, about 21 W/kg. Interpolating the
 * table's 5 s and 1 min values alone would put the 15 s ceiling under it and flag a professional sprinter's
 * best, so the ceiling is held to this value there. It is under the 5 s value, so the curve never rises with length.
 */
export const SPRINT_15S_WKG = 21

/**
 * How far past the world-class edge a sustained power is still believable. The row marks where
 * professionals start, not their best, so a quarter of that again is allowed before a file is called
 * implausible; the faults this catches (a plateau of 700 W or more, a motor's output) are far beyond.
 */
export const POWER_CEILING_MARGIN = 1.25

/** Ceiling points in the shape the speed tables use, so the same log-log interpolation applies. */
const CEILING_TABLE = [
  ...WORLD_CLASS_POWER_WKG.slice(0, 1),
  { durationS: 15, wkg: SPRINT_15S_WKG },
  ...WORLD_CLASS_POWER_WKG.slice(1),
].map((entry) => ({ durationS: entry.durationS, speedMs: entry.wkg * POWER_CEILING_MARGIN }))

/**
 * The most W/kg a rider holds for durationS: the world-class edge, widened by the margin. Between the
 * profile's durations it is a line in log duration and log W/kg; beyond its ends it holds the end value.
 */
export function ridePowerCeilingWkg(durationS: number): number {
  return interpolatedCeiling(CEILING_TABLE, durationS)
}

/**
 * Whether one measured point is over the ceiling for its length at this body mass. A point priced from slope and speed
 * (virtual power, `terms` set) is not a power-meter reading and is not judged here; neither is one with no value.
 */
export function pointOverCeiling(
  point: Pick<DigestCurvePoint, 'durationS' | 'value' | 'terms'>,
  bodyKg: number,
): boolean {
  return (
    point.terms === null &&
    Number.isFinite(point.value) &&
    point.value / bodyKg > ridePowerCeilingWkg(point.durationS)
  )
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
  const implausible = digest.curve.some((point) => pointOverCeiling(point, bodyKg))
  flags.set(digest, { bodyKg, implausible })
  return implausible
}
