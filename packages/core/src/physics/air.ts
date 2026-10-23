import { RHO_AIR } from '../constants'
import { quantile } from '../math'
import type { Activity } from '../types'

const MIN_ALTITUDE_M = -500
const MAX_ALTITUDE_M = 9000
/** ISA troposphere: density falls with (1 - L h / T0)^(g M / (R L) - 1), at 15 C. */
const LAPSE_TERM_PER_M = 2.25577e-5
const EXPONENT = 4.25588

/** False for NaN, non-finite and out-of-range altitudes. Those are treated as missing. */
function isUsableAltitude(altitudeM: number): boolean {
  return altitudeM >= MIN_ALTITUDE_M && altitudeM <= MAX_ALTITUDE_M
}

/**
 * Air density, kg/m^3, at altitude h metres above sea level (ISA troposphere, 15 C). Altitudes
 * outside [-500, 9000] m and non-finite altitudes are missing, so they give sea level.
 */
export function airDensity(altitudeM: number): number {
  if (!isUsableAltitude(altitudeM)) return RHO_AIR
  return RHO_AIR * (1 - LAPSE_TERM_PER_M * altitudeM) ** EXPONENT
}

/**
 * Per-sample air density, kg/m^3, for an activity. Outdoor activities with altitude follow their
 * altitude stream. A sample is missing when its altitude is unusable (see airDensity) or when
 * `validAltitude` marks it 0. Missing samples take the median of the usable altitudes, or sea
 * level when there are none, and the median ignores them too. Indoor and altitude-free activities
 * use sea level throughout.
 */
export function airDensityStream(
  activity: Pick<Activity, 'n' | 'altitude' | 'hasAltitude' | 'indoor'>,
  validAltitude?: Uint8Array,
): Float64Array {
  const { n, altitude } = activity
  const out = new Float64Array(n)
  if (!activity.hasAltitude || activity.indoor) return out.fill(RHO_AIR)
  const usable = (i: number): boolean =>
    (validAltitude?.[i] ?? 1) === 1 && isUsableAltitude(altitude[i]!)
  const valid: number[] = []
  for (let i = 0; i < n; i++) {
    if (usable(i)) valid.push(altitude[i]!)
  }
  const fallback = valid.length > 0 ? airDensity(quantile(valid, 0.5)) : RHO_AIR
  for (let i = 0; i < n; i++) {
    out[i] = usable(i) ? airDensity(altitude[i]!) : fallback
  }
  return out
}
