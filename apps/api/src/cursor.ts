import { MAX_RECORD_ID_CHARS } from '@rca/contract'
import { HttpError } from './errors.ts'
import { fromBase64UrlUtf8, toBase64Url } from './util.ts'

/** A keyset position in the activity list: the last record of the previous page. */
export interface Cursor {
  createdAt: number
  id: string
}

/**
 * Opaque to clients: base64url of "createdAt:id". Stateless: the server remembers nothing about a
 * cursor it issued, so any number of tabs can page the same list independently.
 */
export function encodeCursor(cursor: Cursor): string {
  return toBase64Url(new TextEncoder().encode(`${cursor.createdAt}:${cursor.id}`))
}

export function decodeCursor(value: string): Cursor {
  const invalid = () => new HttpError(400, 'invalid_request', 'Invalid cursor')
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalid()
  let text: string
  try {
    text = fromBase64UrlUtf8(value)
  } catch {
    throw invalid()
  }
  const match = /^(\d+):(.+)$/.exec(text)
  if (!match) throw invalid()
  const [, createdAt = '', id = ''] = match
  const position = Number(createdAt)
  if (!Number.isSafeInteger(position) || id.length > MAX_RECORD_ID_CHARS) throw invalid()
  return { createdAt: position, id }
}
