import { DEFAULT_EXTRACT_LIMITS } from '../fit/archive'
import type { ExtractLimits } from '../fit/archive'
import { readZipEntry } from '../fit/zipEntry'
import type { RangedSource } from '../fit/zipDirectory'
import { ZIP } from '../fit/zipDirectory'
import { readCsvRows } from './csv'

/**
 * The most a Strava activity list may hold once inflated. A list of tens of thousands of activities
 * is a few megabytes, so this is generous, and it bounds the memory a list can take.
 */
export const MAX_ACTIVITY_LIST_BYTES = 32 * 1024 * 1024

const LIST_NAME = 'activities.csv'
/** The list at the root of the zip, or in a folder at its root. The zip's own central directory is searched. */
const LIST_PATH = /(^|\/)activities\.csv$/i

/** A names key: lowercase, with forward slashes, no leading "./" or "/", and no ".gz". */
export function entryKey(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^(\.?\/)+/, '')
    .replace(/\.gz$/i, '')
    .toLowerCase()
}

/**
 * The names a Strava export's activity list gives, keyed by entryKey of each file's path in the zip:
 * the folder the list sits in, then the Filename column. The header is matched whatever its case. The
 * list is read a row at a time, keeping only the two columns it needs, and at most `maxRows` rows.
 * The first row for a file that appears twice is kept. Rows with no file or no name are skipped.
 * Null when the list is malformed, which is a quoted field left open at the end.
 */
export function namesFromActivityList(
  text: string,
  folder = '',
  maxRows = DEFAULT_EXTRACT_LIMITS.maxFitFiles,
): Map<string, string> | null {
  const names = new Map<string, string>()
  let fileColumn = -1
  let nameColumn = -1
  let header = true
  let rows = 0
  const wellFormed = readCsvRows(text, (cells) => {
    if (header) {
      header = false
      const columns = cells.map((cell) => cell.trim().toLowerCase())
      fileColumn = columns.indexOf('filename')
      nameColumn = columns.indexOf('activity name')
      return fileColumn >= 0 && nameColumn >= 0
    }
    if (rows >= maxRows) return false
    rows++
    const file = (cells[fileColumn] ?? '').trim()
    const name = (cells[nameColumn] ?? '').trim()
    if (file !== '' && name !== '') {
      const key = entryKey(folder + file)
      if (!names.has(key)) names.set(key, name)
    }
    return true
  })
  return wellFormed ? names : null
}

/** What reading a Strava export's activity list gives. */
export interface ActivityNames {
  /** The names, keyed by entryKey of each activity file's path. */
  names: Map<string, string>
  /** The bytes the list inflated to. They count against the export's decompressed-bytes budget. */
  decompressedBytes: number
}

/**
 * The activity names of a Strava export zip, read from its activities.csv without reading the
 * activity files, so the names are known before any file is parsed. Only the top-level zip's list is
 * read: the one nearest its root, never one inside a zip nested in it. Null when the source is not a
 * zip or is larger than limits.maxSourceBytes, when it has no readable list, or when the list inflates
 * past MAX_ACTIVITY_LIST_BYTES or past the export's decompressed-bytes budget. A malformed list gives
 * no names, but its inflated bytes are still reported, so they still count against the budget.
 * Never throws.
 */
export async function readActivityNames(
  source: RangedSource,
  limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS,
): Promise<ActivityNames | null> {
  if (!ZIP.test(source.name) || source.size > limits.maxSourceBytes) return null
  const listLimits = {
    ...limits,
    maxEntryBytes: Math.min(limits.maxEntryBytes, MAX_ACTIVITY_LIST_BYTES),
  }
  const list = await readZipEntry(source, (name) => LIST_PATH.test(name), listLimits)
  if (list === null || list.bytes.length > limits.maxTotalDecompressedBytes) return null
  const folder = list.name.slice(0, -LIST_NAME.length)
  const names = namesFromActivityList(new TextDecoder().decode(list.bytes), folder)
  return { names: names ?? new Map(), decompressedBytes: list.bytes.length }
}
