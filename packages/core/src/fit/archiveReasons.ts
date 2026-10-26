import type { RejectCode, Rejection } from '../import/result'
import { GIB, MIB } from '../constants'

/**
 * The reasons an archive, or one of its entries, is not read. Each is a rejection with its code, so
 * the app words it; a byte limit travels as the detail, so the app can say how large is too large.
 */

export const DECOMPRESS_FAILED = 'Could not decompress this file'
export const INCOMPLETE = 'File is incomplete or corrupt'
export const READ_FAILED = 'Could not read this file'
export const ARCHIVE_FAILED = 'Could not read archive'
export const TOO_DEEP = 'Nested archives are too deep'
export const DAMAGED_DIRECTORY = 'Archive is damaged; some activities may be missing'
export const UNSUPPORTED_FORMAT = 'Unsupported file format'
export const UNSUPPORTED_COMPRESSION = 'Unsupported compression method'

function rejection(code: RejectCode, reason: string, detail?: number): Rejection {
  return detail === undefined ? { reason, code } : { reason, code, detail: String(detail) }
}

/** A file whose content cannot be read. A count, when given, is the number of entries affected. */
export const corrupt = (reason: string, count?: number) => rejection('corrupt', reason, count)
export const unreadable = (reason: string) => rejection('unreadable', reason)
export const notActivity = (reason: string) => rejection('not-activity', reason)

function limitText(bytes: number): string {
  if (bytes % GIB === 0) return `${bytes / GIB} GB`
  if (bytes % MIB === 0) return `${bytes / MIB} MB`
  return `${bytes} bytes`
}

/** The reason reported when a total size limit is reached, e.g. "Archive expands to more than 2 GB". */
export function expandsReason(limit: number): string {
  return `Archive expands to more than ${limitText(limit)}`
}

/** Byte limits: the limit in bytes is the detail. */
const tooLarge = (reason: string, limit: number) => rejection('too-large', reason, limit)
export const expandsTooLarge = (limit: number) => tooLarge(expandsReason(limit), limit)
export const sourceTooLarge = (limit: number) =>
  tooLarge(`Source exceeds the ${limit}-byte limit`, limit)
export const decompressedTooLarge = (limit: number) =>
  tooLarge(`Decompressed file exceeds the ${limit}-byte limit`, limit)
export const fileTooLarge = (limit: number) =>
  tooLarge(`File exceeds the ${limit}-byte limit`, limit)
export const entryTooLarge = (limit: number) =>
  tooLarge(`Archive entry exceeds the ${limit}-byte limit`, limit)
export const bufferedTooLarge = (limit: number) =>
  tooLarge(`Buffered data exceeds the ${limit}-byte limit`, limit)

/** Count limits have no byte size to show, so they carry no detail. */
export const entryCountTooLarge = (limit: number) =>
  rejection('too-large', `Archive exceeds the ${limit}-entry limit`)
export const activityCountTooLarge = (limit: number) =>
  rejection('too-large', `Archive exceeds the ${limit}-activity-file limit`)
