import type { GarminList } from './import/garminList'
import type { ListedActivity } from './import/activitiesCsv'

/**
 * A file as an index of files already read knows it: the SHA-256 of its bytes, their count, and what the export's own
 * list said of it. The parse reads that list (the activity's name, its race tag and its type), so the same bytes can
 * digest differently under a different list: the three are the key, and a file is skipped only on equality of all.
 */
export interface FileId {
  hash: string
  size: number
  meta: string
}

/**
 * A local, advisory index of files whose workouts are held, consulted after a file is hashed and before it is parsed.
 * The importer checks its answer against the library (every workout still held, none waiting to be saved), so a wrong
 * entry costs a parse and never a missing activity.
 */
export interface HeldFiles {
  /** The workout keys the file is known to hold, when it may be skipped; null to parse it. */
  skip(file: FileId): Promise<readonly string[] | null>
  /** After a file was read: the workout keys of its activities, so the index can learn it. */
  note(file: FileId, keys: readonly string[]): void
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

/**
 * What the export's list contributes to how a file is read. A file listed by an activities.csv carries its row's name,
 * type and race tag; a file in a Garmin export is named by start time from the whole list, so the list's signature
 * stands for it; a loose file has none.
 */
export function fileMeta(listed: ListedActivity | undefined, garmin: GarminList | null): string {
  if (garmin !== null) return `garmin:${garmin.signature}`
  if (listed === undefined) return ''
  return `csv:${listed.type ?? ''}|${listed.race === true ? 1 : 0}|${listed.name ?? ''}`
}
