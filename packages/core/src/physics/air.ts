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
  // Recorded altitude often holds one value for many seconds, so an unchanged altitude reuses the
  // last density instead of another power. Missing samples stay NaN until the median is known.
  let missing = 0
  let lastAltitude = NaN
  let lastDensity = RHO_AIR
  for (let i = 0; i < n; i++) {
    const altitudeM = altitude[i]!
    if ((validAltitude?.[i] ?? 1) !== 1 || !isUsableAltitude(altitudeM)) {
      out[i] = NaN
      missing++
      continue
    }
    if (altitudeM !== lastAltitude) {
      lastAltitude = altitudeM
      lastDensity = airDensity(altitudeM)
    }
    out[i] = lastDensity
  }
  if (missing > 0) fillMissing(out, altitude, n - missing)
  return out
}

/**
 * Gives every missing (NaN) sample the density at the median of the usable altitudes, or sea level
 * when there are none. The median is taken only here, because most activities miss no sample.
 */
function fillMissing(density: Float64Array, altitude: Float64Array, usableCount: number): void {
  const usable = new Float64Array(usableCount)
  let k = 0
  for (let i = 0; i < density.length; i++) {
    if (!Number.isNaN(density[i]!)) usable[k++] = altitude[i]!
  }
  const fallback = usableCount > 0 ? airDensity(quantile(usable, 0.5)) : RHO_AIR
  for (let i = 0; i < density.length; i++) {
    if (Number.isNaN(density[i]!)) density[i] = fallback
  }
}
