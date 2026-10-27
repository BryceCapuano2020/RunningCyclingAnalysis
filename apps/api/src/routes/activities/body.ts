import { MAX_FILE_NAME_CHARS, MAX_RECORD_ID_CHARS, type ActivityPage } from '@rca/contract'
import type { ActivityEnvelope } from './shared.ts'

/**
 * Whether the envelope is inside the limits of the contract's record schema. The page body cap
 * assumes it, and a client refuses a record outside it, so the server leaves such a row out
 * instead of sending a page that fails to load.
 */
function withinContract(envelope: ActivityEnvelope): boolean {
  return (
    envelope.id.length <= MAX_RECORD_ID_CHARS &&
    envelope.fileName.length <= MAX_FILE_NAME_CHARS &&
    Number.isSafeInteger(envelope.createdAt) &&
    (envelope.fileSize === null ||
      (Number.isSafeInteger(envelope.fileSize) && envelope.fileSize >= 0))
  )
}

/**
 * One record as JSON, with its stored digest text spliced in unchanged, or undefined when that text
 * is not JSON or the envelope is outside the contract's limits. The text is parsed once here and
 * the result thrown away: only text that JSON.parse accepts is ever spliced, so a stored value
 * cannot close the record early or add keys to it. The envelope is serialised on its own, so its
 * strings (file names) are escaped the usual way.
 */
export function spliceRecord(envelope: ActivityEnvelope, digestText: string): string | undefined {
  if (!withinContract(envelope)) return undefined
  try {
    JSON.parse(digestText)
  } catch {
    return undefined
  }
  const head = JSON.stringify(envelope)
  // The envelope is a non-empty object, so dropping its closing brace leaves room for one more key.
  return `${head.slice(0, -1)},"digest":${digestText}}`
}

/** An ActivityPage body from records already serialised by `spliceRecord`. */
export function pageBody(records: readonly string[], rest: Omit<ActivityPage, 'items'>): string {
  // `rest` always carries nextCursor, so it is a non-empty object and its opening brace can go.
  return `{"items":[${records.join(',')}],${JSON.stringify(rest).slice(1)}`
}
