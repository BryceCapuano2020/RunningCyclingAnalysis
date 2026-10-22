import { HttpError } from './errors.ts'
import { fromBase64UrlUtf8, toBase64Url } from './util.ts'

/** A keyset position in the activity list: the last record of the previous page. */
export interface Cursor {
  createdAt: number
  id: string
}

/** Opaque to clients: base64url of "createdAt:id". */
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
  return { createdAt: Number(createdAt), id }
}
