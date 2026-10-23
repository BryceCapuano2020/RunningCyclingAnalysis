import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'
import type { z } from 'zod'
import type { AppEnv } from './env.ts'
import { apiError, HttpError } from './errors.ts'

/** The Content-Length as a number, or undefined when absent. Anything but digits is a client error. */
export function declaredLength(request: Request): number | undefined {
  const declared = request.headers.get('content-length')
  if (declared === null) return undefined
  if (!/^\d+$/.test(declared)) throw new HttpError(400, 'bad_request', 'Malformed Content-Length')
  return Number(declared)
}

interface ReadOptions {
  idleTimeoutMs?: number
  maxDurationMs?: number
}

/**
 * Pulls the next chunk of a body, bounded by the idle timeout and the total duration. The reader
 * is released by the caller, which also cancels it when the body did not finish.
 */
function chunkReader(stream: ReadableStream<Uint8Array>, options: ReadOptions) {
  const reader = stream.getReader()
  const idleTimeoutMs = options.idleTimeoutMs ?? 15_000
  const deadline = Date.now() + (options.maxDurationMs ?? 120_000)
  const next = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const remaining = Math.min(idleTimeoutMs, deadline - Date.now())
    if (remaining <= 0) throw new HttpError(408, 'body_timeout', 'Request body took too long')
    try {
      return await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new HttpError(408, 'body_timeout', 'Request body took too long')),
            remaining,
          )
        }),
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
  const release = (complete: boolean) => {
    if (!complete) {
      // Cancellation may itself stall: release our reader without awaiting untrusted source code.
      void reader.cancel().catch(() => undefined)
    }
    reader.releaseLock()
  }
  return { next, release }
}

/**
 * Reads a body whose length the client declared into one buffer of exactly that size, so a
 * 50 MB upload costs 50 MB. A body longer or shorter than declared is refused with 400.
 */
export async function readExactBody(
  request: Request,
  length: number,
  maxBytes: number,
  options: ReadOptions = {},
): Promise<Uint8Array> {
  if (length > maxBytes) throw tooLarge(maxBytes)
  if (!request.body) {
    if (length === 0) return new Uint8Array(0)
    throw shortBody()
  }
  const { next, release } = chunkReader(request.body, options)
  const body = new Uint8Array(length)
  let offset = 0
  let complete = false
  try {
    for (;;) {
      const { done, value } = await next()
      if (done) {
        complete = true
        break
      }
      if (offset + value.byteLength > length) {
        throw new HttpError(400, 'length_mismatch', 'Body is longer than its Content-Length')
      }
      body.set(value, offset)
      offset += value.byteLength
    }
    if (offset !== length) throw shortBody()
    return body
  } finally {
    release(complete)
  }
}

/**
 * Reads a request body into memory, failing with 413 as soon as it exceeds maxBytes. With a
 * Content-Length the body is read into one buffer of that size. Without one, chunks are collected
 * and joined, which peaks at about twice the body size; only small bodies (the digest) use that.
 */
export async function readBody(
  request: Request,
  maxBytes: number,
  options: ReadOptions = {},
): Promise<Uint8Array> {
  const expected = declaredLength(request)
  if (expected !== undefined) return readExactBody(request, expected, maxBytes, options)
  if (!request.body) return new Uint8Array(0)
  const { next, release } = chunkReader(request.body, options)
  const chunks: Uint8Array[] = []
  let total = 0
  let complete = false
  try {
    for (;;) {
      const { done, value } = await next()
      if (done) {
        complete = true
        break
      }
      total += value.byteLength
      if (total > maxBytes) throw tooLarge(maxBytes)
      // Own the retained bytes even if a producer reuses its input buffer.
      chunks.push(value.slice())
    }
    const body = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }
    return body
  } finally {
    release(complete)
  }
}

/** Caps a route's body before it is parsed: rejects on Content-Length, or while streaming. */
export function limitBody(maxBytes: number) {
  const limit = bodyLimit({
    maxSize: maxBytes,
    onError: (c) =>
      c.json(apiError('payload_too_large', `Body is larger than ${maxBytes} bytes`), 413),
  })
  return createMiddleware<AppEnv>(async (c, next) => {
    declaredLength(c.req.raw)
    return limit(c, next)
  })
}

function tooLarge(maxBytes: number): HttpError {
  return new HttpError(413, 'payload_too_large', `Body is larger than ${maxBytes} bytes`)
}

function shortBody(): HttpError {
  return new HttpError(400, 'length_mismatch', 'Body is shorter than its Content-Length')
}

/** Issues named in a validation message. A bounded array can fail once per element. */
const MAX_REPORTED_ISSUES = 5
/** Well under the 4,096-character bound on ApiError.message, so clients can always parse it. */
const MAX_VALIDATION_MESSAGE_CHARS = 1000

export function validationMessage(error: z.core.$ZodError): string {
  const shown = error.issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map((issue) => `${issue.path.map(String).join('.') || 'body'}: ${issue.message}`)
  const hidden = error.issues.length - shown.length
  if (hidden > 0) shown.push(`and ${hidden} more`)
  return shown.join('; ').slice(0, MAX_VALIDATION_MESSAGE_CHARS)
}

export function invalidRequest(error: z.core.$ZodError) {
  return apiError('invalid_request', validationMessage(error))
}

/** Attachment header with an ASCII fallback and the RFC 5987 UTF-8 name. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_')
  const utf8 = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
}
