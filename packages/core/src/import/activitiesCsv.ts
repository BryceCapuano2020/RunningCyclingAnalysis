import { DEFAULT_EXTRACT_LIMITS } from '../fit/archive'
import type { ExtractLimits } from '../fit/archive'
import { countActivityFiles } from '../fit/count'
import { readZipEntry } from '../fit/zipEntry'
import type { EntryFilter, RangedSource } from '../fit/zipDirectory'
import {
  ACTIVITY,
  directoryOf,
  isIgnored,
  readRange,
  walkDirectory,
  ZIP,
} from '../fit/zipDirectory'
import { readCsvRows } from './csv'

/**
 * The most a Strava activity list may hold once inflated. A list of tens of thousands of activities
 * is a few megabytes, so this is generous. It bounds the text a list inflates to, but not the cells
 * a parser builds from that text: a row of commas is a cell per byte, and MAX_CSV_CELLS_PER_ROW
 * bounds those.
 */
export const MAX_ACTIVITY_LIST_BYTES = 32 * 1024 * 1024

/**
 * The most cells one row of a Strava activity list may hold. A Strava export has about 80 to 90
 * columns, so 64 would refuse real exports; this leaves room for more. A row past the cap makes the
 * list malformed, so every file is read.
 */
export const MAX_CSV_CELLS_PER_ROW = 256

const LIST_NAME = 'activities.csv'
/**
 * The list at the root of the zip, or in a folder at its root, whether the folders are separated by "/"
 * or by the "\\" some tools write. The zip's own central directory is searched.
 */
const LIST_PATH = new RegExp(`(^|[\\\\/])${LIST_NAME.replace(/\./g, '\\.')}$`, 'i')

/**
 * A names key: lowercase, with forward slashes, no ".gz", and the path resolved: no empty or "." segment,
 * and a ".." segment removes the one before it. Null for a path that climbs above the root of the zip.
 */
export function entryKey(path: string): string | null {
  const segments: string[] = []
  for (const segment of path.replace(/\\/g, '/').replace(/\.gz$/i, '').toLowerCase().split('/')) {
    if (segment === '..') {
      if (segments.pop() === undefined) return null
    } else if (segment !== '' && segment !== '.') {
      segments.push(segment)
    }
  }
  return segments.join('/')
}

/** The key of a list row's file, or null when the row names no file: it climbs above the zip or ends as a folder does. */
function fileKey(path: string): string | null {
  const last = path.replace(/\\/g, '/').replace(/\.gz$/i, '').split('/').at(-1)
  if (last === undefined || last === '' || last === '.' || last === '..') return null
  const key = entryKey(path)
  return key === '' ? null : key
}

/** What a Strava export's activity list says about one activity file. A blank column is left out. */
export interface ListedActivity {
  name?: string
  /** The Activity Type column as written, such as "Trail Run" or "Weight Training". */
  type?: string
}

/** The activity files a list names, keyed by entryKey of each file's path in the zip. */
export interface ListedFiles {
  files: Map<string, ListedActivity>
  /** Whether the list was read to its end. A list stopped at the row cap does not name every file. */
  complete: boolean
}

/**
 * The activity files a Strava export's activity list names, keyed by entryKey of each file's path in
 * the zip: the folder the list sits in, then the Filename column. The headers are matched whatever
 * their case. The list is read a row at a time, keeping only the three columns it needs, and at most
 * `maxRows` rows. The first row for a file that appears twice is kept. A row with no file is skipped,
 * but a row with no name is kept, because its type still says what the file is. Only the Filename column
 * is needed. Null when the list is malformed: a quoted field left open at the end, or a row past
 * MAX_CSV_CELLS_PER_ROW cells. A row past `maxRows` is still parsed to its end before the row cap
 * stops the read, so a row past the cap that is also too wide makes the whole list malformed, not
 * one cut at the cap. The import then reads every file without the list's names. That is accepted.
 */
export function parseActivityList(
  text: string,
  folder = '',
  maxRows = DEFAULT_EXTRACT_LIMITS.maxFitFiles,
): ListedFiles | null {
  const files = new Map<string, ListedActivity>()
  let fileColumn = -1
  let nameColumn = -1
  let typeColumn = -1
  let header = true
  let rows = 0
  let complete = true
  const wellFormed = readCsvRows(text, MAX_CSV_CELLS_PER_ROW, (cells) => {
    if (header) {
      header = false
      const columns = cells.map((cell) => cell.trim().toLowerCase())
      fileColumn = columns.indexOf('filename')
      nameColumn = columns.indexOf('activity name')
      typeColumn = columns.indexOf('activity type')
      return fileColumn >= 0
    }
    if (rows >= maxRows) {
      complete = false
      return false
    }
    rows++
    const key = fileKey(folder + cellAt(cells, fileColumn))
    if (key !== null && !files.has(key)) {
      files.set(key, listedActivity(cellAt(cells, nameColumn), cellAt(cells, typeColumn)))
    }
    return true
  })
  return wellFormed ? { files, complete } : null
}

/** The trimmed text of a row's cell, or an empty string when the row or the column has none. */
function cellAt(cells: string[], column: number): string {
  return (cells[column] ?? '').trim()
}

function listedActivity(name: string, type: string): ListedActivity {
  return { ...(name === '' ? {} : { name }), ...(type === '' ? {} : { type }) }
}

/** What the list says about a file of the zip, by the path the zip gives it. */
export function listedFor(
  files: ReadonlyMap<string, ListedActivity> | undefined,
  fileName: string,
): ListedActivity | undefined {
  const key = entryKey(fileName)
  return key === null ? undefined : files?.get(key)
}

/** What reading a Strava export's activity list gives. */
export interface ActivityList extends ListedFiles {
  /** The bytes the list inflated to. They count against the export's decompressed-bytes budget. */
  decompressedBytes: number
}

/**
 * The activity list of a Strava export zip, read without reading the activity files, so what it says
 * about each file is known before any file is parsed. Only the top-level zip's list is read: the one
 * nearest its root, never one inside a zip nested in it. Null when the source is not a zip or is
 * larger than limits.maxSourceBytes, when it has no readable list, or when the list inflates past
 * MAX_ACTIVITY_LIST_BYTES or past the export's decompressed-bytes budget. A malformed list names no
 * files, but its inflated bytes are still reported, so they still count against the budget. Never throws.
 */
export async function readActivityList(
  source: RangedSource,
  limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS,
): Promise<ActivityList | null> {
  if (!ZIP.test(source.name) || source.size > limits.maxSourceBytes) return null
  const listLimits = {
    ...limits,
    maxEntryBytes: Math.min(limits.maxEntryBytes, MAX_ACTIVITY_LIST_BYTES),
  }
  const list = await readZipEntry(source, (name) => LIST_PATH.test(name), listLimits)
  if (list === null || list.bytes.length > limits.maxTotalDecompressedBytes) return null
  const folder = list.name.slice(0, -LIST_NAME.length)
  const listed = parseActivityList(new TextDecoder().decode(list.bytes), folder)
  return {
    ...(listed ?? { files: new Map(), complete: false }),
    decompressedBytes: list.bytes.length,
  }
}

/**
 * The filter that leaves out of a zip's activity files those that its list does not name and that sit
 * in no folder it names a file in, such as the saved routes of a Strava export. A folder counts when a
 * file the list names sits in it or in a folder above it, so a file the list does not name is still
 * read when it is beside a named one or below one, as a partial or edited list leaves it. A named file
 * at the root of the zip covers every folder. Undefined, so that every activity file stays, when the
 * list cannot be trusted to say what is an activity: there is none, or it is malformed, names no file
 * or was stopped at the row cap; or the zip holds more than one activities.csv; or the list names none
 * of the zip's activity files, as when they sit in another folder than it expects or are spelled
 * another way.
 */
export async function listedOnly(
  source: RangedSource,
  limits: ExtractLimits,
  list: ActivityList | null,
): Promise<EntryFilter | undefined> {
  if (list === null || !list.complete || list.files.size === 0) return undefined
  const { files } = list
  if (!(await namesTheZip(source, limits, files))) return undefined
  // The folders come from every row, whether or not the zip holds the file the row names.
  const folders = new Set([...files.keys()].map(folderOf))
  return (entry) => isCovered(entryKey(entry), folders)
}

/**
 * Whether the list can be trusted for this zip: it holds one activities.csv, and the list names at
 * least one of the activity files it holds. False when the directory cannot be read.
 */
async function namesTheZip(
  source: RangedSource,
  limits: ExtractLimits,
  files: ReadonlyMap<string, ListedActivity>,
): Promise<boolean> {
  try {
    const directory = await directoryOf(source, limits)
    if (directory === null) return false
    let lists = 0
    let named = 0
    const complete = await walkDirectory(
      (start, end) => readRange(source, start, end),
      directory.offset,
      directory.size,
      limits.maxArchiveEntries,
      (name) => {
        if (isIgnored(name)) return
        if (LIST_PATH.test(name)) lists++
        else if (ACTIVITY.test(name) && listedFor(files, name) !== undefined) named++
      },
    )
    return complete && lists === 1 && named > 0
  } catch {
    return false
  }
}

/** The folder of a key, with its closing slash; empty at the root. */
function folderOf(key: string): string {
  return key.slice(0, key.lastIndexOf('/') + 1)
}

/**
 * Whether a key sits in one of the folders, or in a folder below one. The root, '', is above every
 * folder. A path with no key, which climbs above the zip, is kept, since the list cannot place it.
 */
function isCovered(key: string | null, folders: ReadonlySet<string>): boolean {
  if (key === null || folders.has('')) return true
  let folder = ''
  for (const segment of key.split('/').slice(0, -1)) {
    folder += `${segment}/`
    if (folders.has(folder)) return true
  }
  return false
}

/**
 * How many activity files the sources deliver to an import, as countActivityFiles counts them but
 * leaving out the files each zip's own list does not name. Null when the total is not known.
 */
export async function countImportFiles(
  sources: readonly RangedSource[],
  limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS,
): Promise<number | null> {
  let total = 0
  for (const source of sources) {
    const list = await readActivityList(source, limits)
    const count = await countActivityFiles([source], limits, await listedOnly(source, limits, list))
    if (count === null) return null
    total += count
  }
  return total
}
