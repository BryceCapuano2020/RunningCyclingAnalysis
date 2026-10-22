import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { contentDisposition, readBody, validationMessage } from './http.ts'
import { HttpError } from './errors.ts'

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

async function expectTooLarge(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ status: 413, code: 'payload_too_large' })
}

describe('readBody', () => {
  it('times out a stalled body, cancels without waiting, and releases its reader lock', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn(() => new Promise<void>(() => undefined))
    const stream = new ReadableStream<Uint8Array>({ cancel })
    try {
      const result = readBody({ headers: new Headers(), body: stream } as Request, 100, {
        idleTimeoutMs: 100,
        maxDurationMs: 500,
      }).catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(100)
      expect(await result).toMatchObject({ status: 408, code: 'body_timeout' })
      expect(cancel).toHaveBeenCalled()
      expect(stream.locked).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('releases the reader after a successful read', async () => {
    const stream = streamOf([new Uint8Array([1])])
    await readBody({ headers: new Headers(), body: stream } as Request, 10)
    expect(stream.locked).toBe(false)
  })

  it('concatenates streamed chunks in order', async () => {
    const request = new Request('http://t/x', {
      method: 'POST',
      body: streamOf([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])]),
      duplex: 'half',
    } as RequestInit)
    expect(Array.from(await readBody(request, 10))).toEqual([1, 2, 3, 4, 5])
  })

  it('returns an empty array when there is no body', async () => {
    const request = new Request('http://t/x', { method: 'POST' })
    expect(request.body).toBeNull()
    expect((await readBody(request, 10)).byteLength).toBe(0)
  })

  it('refuses a streamed body that exceeds the limit and cancels the stream', async () => {
    const request = new Request('http://t/x', {
      method: 'POST',
      body: streamOf([new Uint8Array(6), new Uint8Array(6)]),
      duplex: 'half',
    } as RequestInit)
    await expectTooLarge(readBody(request, 10))
  })

  it('refuses early on a declared Content-Length above the limit', async () => {
    const request = {
      headers: new Headers({ 'content-length': '11' }),
      body: streamOf([new Uint8Array(1)]),
    } as unknown as Request
    await expectTooLarge(readBody(request, 10))
  })

  it('reads a body with a Content-Length into one buffer of that size', async () => {
    const request = new Request('http://t/x', {
      method: 'POST',
      headers: { 'content-length': '5' },
      body: streamOf([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])]),
      duplex: 'half',
    } as RequestInit)
    expect(request.headers.get('content-length')).toBe('5')
    expect(Array.from(await readBody(request, 10))).toEqual([1, 2, 3, 4, 5])
  })

  it('rejects a body that is shorter or longer than its Content-Length with 400', async () => {
    const short = new Request('http://t/x', {
      method: 'POST',
      headers: { 'content-length': '9' },
      body: streamOf([new Uint8Array(4)]),
      duplex: 'half',
    } as RequestInit)
    await expect(readBody(short, 10)).rejects.toMatchObject({
      status: 400,
      code: 'length_mismatch',
    })
    const long = new Request('http://t/x', {
      method: 'POST',
      headers: { 'content-length': '3' },
      body: streamOf([new Uint8Array(2), new Uint8Array(2)]),
      duplex: 'half',
    } as RequestInit)
    await expect(readBody(long, 10)).rejects.toMatchObject({
      status: 400,
      code: 'length_mismatch',
    })
  })

  it('accepts a body exactly at the limit', async () => {
    const request = new Request('http://t/x', { method: 'POST', body: new Uint8Array(10) })
    expect((await readBody(request, 10)).byteLength).toBe(10)
  })
})

describe('contentDisposition', () => {
  it('uses plain names as both the fallback and the UTF-8 form', () => {
    expect(contentDisposition('ride.fit')).toBe(
      `attachment; filename="ride.fit"; filename*=UTF-8''ride.fit`,
    )
  })

  it('replaces non-ASCII, quotes and backslashes in the fallback and percent-encodes the rest', () => {
    expect(contentDisposition('Zoë "best" \\ (2).fit')).toBe(
      `attachment; filename="Zo_ _best_ _ (2).fit"; filename*=UTF-8''Zo%C3%AB%20%22best%22%20%5C%20%282%29.fit`,
    )
  })

  it('escapes apostrophes that RFC 5987 leaves unencoded', () => {
    expect(contentDisposition("Bryce's.fit")).toContain("filename*=UTF-8''Bryce%27s.fit")
  })
})

describe('validationMessage', () => {
  it('joins issue paths and messages', () => {
    const parsed = z.object({ massKg: z.number().min(30) }).safeParse({ massKg: 5 })
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(validationMessage(parsed.error)).toBe('massKg: Too small: expected number to be >=30')
  })

  it('names the body when the failure is at the top level', () => {
    const parsed = z.string().safeParse(5)
    expect(parsed.success).toBe(false)
    if (parsed.success) return
    expect(validationMessage(parsed.error)).toMatch(/^body: /)
  })
})
