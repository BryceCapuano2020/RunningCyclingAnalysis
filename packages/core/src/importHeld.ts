import type { GarminList } from './import/garminList'
import type { ListedActivity } from './import/activitiesCsv'
import type { Sport } from './types'

/**
 * A file as an index of files already read knows it: the SHA-256 of its bytes and their count. What the export's own list
 * said of it (the activity's name, its race tag and its type) is kept apart as a `meta` signature, because the parse
 * reads that list and the same bytes can digest differently under a different one.
 */
export interface FileId {
  hash: string
  size: number
}

/** What the index knew of a file: the workouts it held, and the signature of what its list said of them. */
export interface HeldEntry {
  keys: readonly string[]
  meta: string
}

/**
 * A local, advisory index of files whose workouts are held, consulted after a file is hashed and before it is parsed.
 * The importer checks its answer against the library (every workout still held, none waiting to be saved, the list
 * metadata equal), so a wrong entry costs a parse and never a missing activity.
 */
export interface HeldFiles {
  /** What the file is known to hold, when it may be skipped; null to parse it. */
  skip(file: FileId): Promise<HeldEntry | null>
  /** After a file was read: the workout keys of its activities and their list signature, so the index can learn it. */
  note(file: FileId, keys: readonly string[], meta: string): void
}

/** FNV-1a over the text, 64 bits as hex: a signature for telling two lists apart, not a defence against anyone. */
export function signatureOf(text: string): string {
  let a = 0x811c9dc5
  let b = 0xcbf29ce4
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193) >>> 0
    b = Math.imul(b ^ c, 0x0100019d) >>> 0
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`
}

const sportOfKey = (key: string): Sport => (key.startsWith('ride') ? 'ride' : 'run')
const startOfKey = (key: string): number => Number(key.slice(key.lastIndexOf('-') + 1)) * 1000

/**
 * A signature of what the export's list says of the workouts a file holds, never the words themselves (the index is kept
 * in the browser and holds no names). A file listed by an activities.csv carries its row's name, type and race tag; a file in a
 * Garmin export is named by start time from the list, so the names the list gives its workouts stand for it, which makes
 * the signature per entry (a new export that adds other entries does not change it); a loose file has none.
 */
export function metaOf(
  listed: ListedActivity | undefined,
  garmin: GarminList | null,
  keys: readonly string[],
): string {
  if (garmin !== null) {
    const names = keys.map((key) => garmin.nameAt(startOfKey(key), sportOfKey(key)) ?? '')
    return signatureOf(`garmin:${names.join('\n')}`)
  }
  if (listed === undefined) return ''
  return signatureOf(
    `csv:${listed.type ?? ''}|${listed.race === true ? 1 : 0}|${listed.name ?? ''}`,
  )
}
