import { DEFAULT_EXTRACT_LIMITS } from '../fit/archive'
import type { ExtractLimits } from '../fit/archive'
import { readZipEntry } from '../fit/zipEntry'
import type { RangedSource } from '../fit/zipDirectory'
import { ZIP } from '../fit/zipDirectory'
import { readCsvRows } from './csv'
import { MAX_CSV_CELLS_PER_ROW } from './limits'

/**
 * The athlete's own weight from a Strava export's profile.csv, offered as the default in setup. The file also holds a name, an
 * email address and where the athlete lives; none of that is read. Only the Weight column of the first row is, as kilograms,
 * and only when it is a body weight the app would accept (the contract's 30 to 200 kg): anything else, such as a blank, a
 * zero or a figure in other units that falls outside the range, offers nothing.
 */
const LIST_NAME = 'profile.csv'
const PROFILE_PATH = new RegExp(`(^|[\\\\/])${LIST_NAME.replace(/\./g, '\\.')}$`, 'i')
/** A profile is a line of text: a file larger than this is not one. */
const MAX_PROFILE_BYTES = 64 * 1024
/** The weights the app accepts for a body, kg: the contract's limits. */
export const PROFILE_WEIGHT_KG = { min: 30, max: 200 } as const

/** The Weight column of the first data row of a profile.csv's text, in kg, or null when it holds no usable weight. */
export function parseProfileWeightKg(text: string): number | null {
  let column = -1
  let header = true
  let kg: number | null = null
  readCsvRows(text, MAX_CSV_CELLS_PER_ROW, (cells) => {
    if (header) {
      header = false
      column = cells.findIndex((cell) => cell.trim().toLowerCase() === 'weight')
      return column >= 0
    }
    const cell = (cells[column] ?? '').trim()
    const value = /^\d+(\.\d+)?$/.test(cell) ? Number(cell) : Number.NaN
    if (value >= PROFILE_WEIGHT_KG.min && value <= PROFILE_WEIGHT_KG.max) kg = value
    // The first data row is the athlete's; later rows are not read.
    return false
  })
  return kg
}

/**
 * The weight in kg a Strava export zip's profile.csv gives, read without reading the activity files. Null when the source is not a
 * zip, has no profile.csv, its profile has no usable weight, or it cannot be read. Never throws.
 */
export async function readProfileWeightKg(
  source: RangedSource,
  limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS,
): Promise<number | null> {
  if (!ZIP.test(source.name) || source.size > limits.maxSourceBytes) return null
  const entry = await readZipEntry(source, (name) => PROFILE_PATH.test(name), {
    ...limits,
    maxEntryBytes: Math.min(limits.maxEntryBytes, MAX_PROFILE_BYTES),
  })
  return entry === null ? null : parseProfileWeightKg(new TextDecoder().decode(entry.bytes))
}
