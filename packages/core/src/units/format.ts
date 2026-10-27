import { METRES_PER_FOOT, METRES_PER_KM, METRES_PER_MILE, kgToLb } from './convert'

export type UnitSystem = 'imperial' | 'metric'

const DASH = '—'
const KMH_PER_MS = 3.6
const SECONDS_PER_HOUR = 3600
const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g
const WHOLE_PART = /^-?\d+/

/**
 * A number's text with comma thousands in its whole part, such as "10,234.5" or "-1,204". This is the
 * one grouping rule for every number the app writes, whatever the browser's locale. Decimals stay.
 */
export function groupThousands(text: string): string {
  return text.replace(WHOLE_PART, (digits) => digits.replace(THOUSANDS, ','))
}

/** Whole number of the magnitude of x, grouped, with a minus sign only when a digit is shown. */
function whole(x: number): string {
  const magnitude = Math.round(Math.abs(x))
  const digits = groupThousands(String(magnitude))
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
    parts.push(`${groupThousands(String(hours))} h`)
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

/**
 * A total time for a list row or a hero figure: under an hour, as formatDuration writes it; from an
 * hour on, hours and minutes, such as "6 h 33 min", with the seconds left out.
 */
export function formatTotalTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < SECONDS_PER_HOUR) {
    return formatDuration(seconds)
  }
  const hours = groupThousands(String(Math.floor(seconds / SECONDS_PER_HOUR)))
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / 60)
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`
}

/** A time as m:ss, or h:mm:ss from an hour on, for record times. */
export function formatRecordTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return DASH
  }
  const total = Math.round(Math.max(0, seconds))
  const hours = Math.floor(total / SECONDS_PER_HOUR)
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / 60)
  const secs = twoDigits(total % 60)
  return hours > 0 ? `${hours}:${twoDigits(minutes)}:${secs}` : `${minutes}:${secs}`
}

export const PACE_UNIT: Record<UnitSystem, string> = { imperial: '/mi', metric: '/km' }

/** The unit of a metabolic energy rate, which is not watts per kilogram of measured power: formatWkg writes that. */
export const ENERGY_RATE_UNIT = 'metabolic W/kg'

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
    ? `${groupThousands(((speedMs * SECONDS_PER_HOUR) / METRES_PER_MILE).toFixed(1))} mph`
    : `${groupThousands((speedMs * KMH_PER_MS).toFixed(1))} km/h`
}

/** The unit words of a distance, and the metres in one of them, for each system. */
const DISTANCE_UNIT: Record<UnitSystem, { unit: string; metres: number }> = {
  imperial: { unit: 'mi', metres: METRES_PER_MILE },
  metric: { unit: 'km', metres: METRES_PER_KM },
}

export function formatDistance(metres: number, system: UnitSystem): string {
  if (!Number.isFinite(metres)) {
    return DASH
  }
  const { unit, metres: metresPerUnit } = DISTANCE_UNIT[system]
  const amount = metres / metresPerUnit
  // One decimal, so a tiny distance would read 0.0; it is under a tenth of a unit instead.
  const figure = groupThousands(amount.toFixed(1))
  return amount > 0 && amount < 0.1 ? `<0.1 ${unit}` : `${figure} ${unit}`
}

/**
 * A partial distance, shorter than one unit, to two decimals. It rounds down, so it never reads as a
 * whole unit: "0.97 mi", not "1.0 mi". Under a hundredth it reads "<0.01 mi".
 */
export function formatPartialDistance(metres: number, system: UnitSystem): string {
  if (!Number.isFinite(metres)) {
    return DASH
  }
  const { unit, metres: metresPerUnit } = DISTANCE_UNIT[system]
  const hundredths = Math.floor((metres * 100) / metresPerUnit)
  const figure = groupThousands((hundredths / 100).toFixed(2))
  return hundredths === 0 ? `<0.01 ${unit}` : `${figure} ${unit}`
}

export function formatElevation(metres: number, system: UnitSystem): string {
  if (!Number.isFinite(metres)) {
    return DASH
  }
  return system === 'imperial' ? `${whole(metres / METRES_PER_FOOT)} ft` : `${whole(metres)} m`
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
  return `${groupThousands(wPerKg.toFixed(1))} W/kg`
}

/** A metabolic energy rate to one decimal, without the unit: for a column whose heading already names it. */
export function formatEnergyRateValue(wPerKg: number): string {
  return Number.isFinite(wPerKg) ? groupThousands(wPerKg.toFixed(1)) : DASH
}

/** A metabolic energy rate to one decimal, with ENERGY_RATE_UNIT: for a tooltip, a note or an end label. */
export function formatEnergyRate(wPerKg: number): string {
  const value = formatEnergyRateValue(wPerKg)
  return value === DASH ? DASH : `${value} ${ENERGY_RATE_UNIT}`
}

export function formatPercent(fraction: number, signed = false): string {
  if (!Number.isFinite(fraction)) {
    return DASH
  }
  const percent = whole(fraction * 100)
  const plus = signed && percent !== '0' && !percent.startsWith('-') ? '+' : ''
  return `${plus}${percent}%`
}

/** The local time of day in twelve-hour form, such as "6:42 am", on the clock of the viewing device. */
export function formatTimeOfDay(ms: number): string {
  const date = new Date(ms)
  const hour = date.getHours()
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(date.getMinutes()).padStart(2, '0')} ${hour < 12 ? 'am' : 'pm'}`
}
