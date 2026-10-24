import { METRES_PER_FOOT, METRES_PER_MILE, kgToLb } from './convert'

export type UnitSystem = 'imperial' | 'metric'

const DASH = '—'
const METRES_PER_KM = 1000
const KMH_PER_MS = 3.6
const SECONDS_PER_HOUR = 3600
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g

/** Whole number of the magnitude of x, with a minus sign only when a digit is shown. */
function whole(x: number, grouped = false): string {
  const magnitude = Math.round(Math.abs(x))
  const digits = grouped ? String(magnitude).replace(THOUSANDS, ',') : String(magnitude)
  return x < 0 && magnitude > 0 ? `-${digits}` : digits
}

function twoDigits(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return DASH
  }
  const total = Math.round(Math.abs(seconds))
  const hours = Math.floor(total / SECONDS_PER_HOUR)
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / 60)
  const secs = total % 60
  const parts: string[] = []
  if (hours > 0) {
    parts.push(`${hours} h`)
  }
  if (minutes > 0) {
    parts.push(`${minutes} min`)
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs} s`)
  }
  const sign = seconds < 0 && total > 0 ? '-' : ''
  return sign + parts.join(' ')
}

export const PACE_UNIT: Record<UnitSystem, string> = { imperial: '/mi', metric: '/km' }

/** Seconds per mile or per kilometre at a speed in m/s. */
export function paceSeconds(speedMs: number, system: UnitSystem): number {
  return (system === 'imperial' ? METRES_PER_MILE : METRES_PER_KM) / speedMs
}

/** Minutes and seconds, such as 4:05, for a value in seconds. Seconds are rounded first. */
export function formatClock(seconds: number): string {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${twoDigits(total % 60)}`
}

/** Minutes and seconds per mile or per kilometre, from speed in m/s, without the unit. */
export function formatPaceValue(speedMs: number, system: UnitSystem): string {
  if (!(speedMs > 0 && Number.isFinite(speedMs))) {
    return DASH
  }
  return formatClock(paceSeconds(speedMs, system))
}

/** Minutes per mile or per kilometre, from speed in m/s. Seconds are rounded before splitting. */
export function formatPace(speedMs: number, system: UnitSystem): string {
  const value = formatPaceValue(speedMs, system)
  return value === DASH ? DASH : `${value} ${PACE_UNIT[system]}`
}

export function formatSpeed(speedMs: number, system: UnitSystem): string {
  if (!Number.isFinite(speedMs)) {
    return DASH
  }
  return system === 'imperial'
    ? `${((speedMs * SECONDS_PER_HOUR) / METRES_PER_MILE).toFixed(1)} mph`
    : `${(speedMs * KMH_PER_MS).toFixed(1)} km/h`
}

export function formatDistance(metres: number, system: UnitSystem): string {
  if (!Number.isFinite(metres)) {
    return DASH
  }
  return system === 'imperial'
    ? `${(metres / METRES_PER_MILE).toFixed(2)} mi`
    : `${(metres / METRES_PER_KM).toFixed(2)} km`
}

export function formatElevation(metres: number, system: UnitSystem): string {
  if (!Number.isFinite(metres)) {
    return DASH
  }
  return system === 'imperial'
    ? `${whole(metres / METRES_PER_FOOT, true)} ft`
    : `${whole(metres, true)} m`
}

export function formatMass(kg: number, system: UnitSystem): string {
  if (!Number.isFinite(kg)) {
    return DASH
  }
  return system === 'imperial' ? `${whole(kgToLb(kg))} lb` : `${whole(kg)} kg`
}

/** Watts as a whole number, without the unit. */
export function formatWatts(watts: number): string {
  if (!Number.isFinite(watts)) {
    return DASH
  }
  return whole(watts)
}

export function formatPower(watts: number): string {
  const number = formatWatts(watts)
  return number === DASH ? DASH : `${number} W`
}

export function formatWkg(wPerKg: number): string {
  if (!Number.isFinite(wPerKg)) {
    return DASH
  }
  return `${wPerKg.toFixed(1)} W/kg`
}

export function formatPercent(fraction: number, signed = false): string {
  if (!Number.isFinite(fraction)) {
    return DASH
  }
  const percent = whole(fraction * 100)
  const plus = signed && percent !== '0' && !percent.startsWith('-') ? '+' : ''
  return `${plus}${percent}%`
}
