import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'
import type { z } from 'zod'
import type { AppEnv } from './env.ts'
import { apiError, HttpError } from './errors.ts'

/**
 * Reads a request body into memory, failing with 413 as soon as it exceeds maxBytes.
 * With a Content-Length the body is read into one buffer of that size, so a 50 MB upload
 * costs 50 MB rather than twice that. Without one, chunks are collected and joined.
 */
/** The Content-Length as a number, or undefined when absent. Anything but digits is a client error. */
export function declaredLength(request: Request): number | undefined {
  const declared = request.headers.get('content-length')
  if (declared === null) return undefined
  if (!/^\d+$/.test(declared)) throw new HttpError(400, 'bad_request', 'Malformed Content-Length')
  return Number(declared)
}

/** Bounds byte count, idle time, and total upload duration, always releasing the stream reader. */
export async function readBody(
  request: Request,
  maxBytes: number,
  options: { idleTimeoutMs?: number; maxDurationMs?: number } = {},
): Promise<Uint8Array> {
  const expected = declaredLength(request)
  if (expected !== undefined && expected > maxBytes) throw tooLarge(maxBytes)
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const idleTimeoutMs = options.idleTimeoutMs ?? 15_000
  const deadline = Date.now() + (options.maxDurationMs ?? 120_000)
  let complete = false
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
  try {
    if (expected !== undefined) {
      const body = new Uint8Array(expected)
      let offset = 0
      for (;;) {
        const { done, value } = await next()
        if (done) {
          complete = true
          break
        }
        if (offset + value.byteLength > expected) {
          throw new HttpError(400, 'length_mismatch', 'Body is longer than its Content-Length')
        }
        body.set(value, offset)
        offset += value.byteLength
      }
      if (offset !== expected)
        throw new HttpError(400, 'length_mismatch', 'Body is shorter than its Content-Length')
      return body
    }
    const chunks: Uint8Array[] = []
    let total = 0
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
    if (!complete) {
      // Cancellation may itself stall: release our reader without awaiting untrusted source code.
      void reader.cancel().catch(() => undefined)
    }
    reader.releaseLock()
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

export function validationMessage(error: z.core.$ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join('.') || 'body'}: ${issue.message}`)
    .join('; ')
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
