import { describe, expect, it } from 'vitest'
import { HttpError } from './errors.ts'
import { decodeCursor, encodeCursor } from './cursor.ts'
import { toBase64Url } from './util.ts'

describe('activity cursors', () => {
  it('round-trips the createdAt and id of the last record', () => {
    const cursor = { createdAt: 1_700_000_000_123, id: 'a1b2-c3' }
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
  })

  it('is URL-safe and opaque', () => {
    expect(encodeCursor({ createdAt: 1, id: 'x' })).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it.each([
    ['characters outside base64url', 'ab+/=='],
    ['bytes that are not base64', '!!!'],
    ['no separator', toBase64Url(new TextEncoder().encode('12345'))],
    ['non-numeric time', toBase64Url(new TextEncoder().encode('abc:id'))],
    ['empty id', toBase64Url(new TextEncoder().encode('12:'))],
  ])('rejects a cursor with %s as invalid_request', (_label, value) => {
    expect(() => decodeCursor(value)).toThrow(HttpError)
    try {
      decodeCursor(value)
    } catch (error) {
      expect(error).toMatchObject({ status: 400, code: 'invalid_request' })
    }
  })
})
