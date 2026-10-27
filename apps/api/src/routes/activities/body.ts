import type { ActivityPage } from '@rca/contract'
import type { ActivityEnvelope } from './shared.ts'

/**
 * One record as JSON, with its stored digest text spliced in unchanged, or undefined when that text
 * is not JSON. The text is parsed once here and the result thrown away: only text that JSON.parse
 * accepts is ever spliced, so a stored value cannot close the record early or add keys to it. The
 * envelope is serialised on its own, so its strings (file names) are escaped the usual way.
 */
export function spliceRecord(envelope: ActivityEnvelope, digestText: string): string | undefined {
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
