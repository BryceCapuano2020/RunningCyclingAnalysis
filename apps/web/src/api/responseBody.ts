import { ApiErrorSchema, MAX_PAGE_BODY_BYTES } from '@rca/contract'
import { ApiRequestError } from './apiError'
import { noteRequestActivity } from './requestActivity'

const PAGE_BODY_LIMIT = MAX_PAGE_BODY_BYTES
const ERROR_BODY_LIMIT = 64 * 1024
export const INVALID_RESPONSE_MESSAGE = 'Unexpected response from the server'
const responseTimeouts = new WeakMap<Response, ReturnType<typeof setTimeout>>()

export function clearResponseTimeout(response: Response): void {
  const timeout = responseTimeouts.get(response)
  if (timeout !== undefined) {
    clearTimeout(timeout)
    responseTimeouts.delete(response)
  }
}

/** Remembers the timer that bounds a response's body, so reading or dropping the body can stop it. */
export function noteResponseTimeout(
  response: Response,
  timeout: ReturnType<typeof setTimeout>,
): void {
  responseTimeouts.set(response, timeout)
}

export async function errorFrom(response: Response): Promise<ApiRequestError> {
  const body = await readResponseJson(response, ERROR_BODY_LIMIT).catch(() => undefined)
  const retryAfterMs = retryAfterOf(response)
  const parsed = ApiErrorSchema.safeParse(body)
  if (parsed.success) {
    return new ApiRequestError(
      response.status,
      parsed.data.error.code,
      parsed.data.error.message,
      retryAfterMs,
    )
  }
  const fallback = response.statusText || `Request failed with status ${response.status}`
  return new ApiRequestError(response.status, 'http_error', fallback, retryAfterMs)
}

/** The response's Retry-After in milliseconds, when it is a whole number of seconds. */
function retryAfterOf(response: Response): number | undefined {
  const seconds = response.headers.get('retry-after')
  return seconds !== null && /^\d+$/.test(seconds) ? Number(seconds) * 1000 : undefined
}

/** Parses a response body with a contract schema. JSON has no NaN, so the schemas restore it. */
async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    clearResponseTimeout(response)
    throw new ApiRequestError(502, 'invalid_response', INVALID_RESPONSE_MESSAGE)
  }
  if (!response.body) {
    try {
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength > maxBytes) {
        throw new ApiRequestError(502, 'invalid_response', INVALID_RESPONSE_MESSAGE)
      }
      return bytes
    } finally {
      clearResponseTimeout(response)
    }
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      noteRequestActivity()
      if (size > maxBytes) {
        await reader.cancel()
        throw new ApiRequestError(502, 'invalid_response', INVALID_RESPONSE_MESSAGE)
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  } finally {
    reader.releaseLock()
    clearResponseTimeout(response)
  }
}

async function readResponseJson(response: Response, maxBytes: number): Promise<unknown> {
  const bytes = await readResponseBytes(response, maxBytes)
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return undefined
  }
}

export async function readJson<T>(
  response: Response,
  schema: { parse(value: unknown): T },
  maxBytes = PAGE_BODY_LIMIT,
): Promise<T> {
  const body = await readResponseJson(response, maxBytes)
  try {
    return schema.parse(body)
  } catch {
    throw new ApiRequestError(response.status, 'invalid_response', INVALID_RESPONSE_MESSAGE)
  }
}
