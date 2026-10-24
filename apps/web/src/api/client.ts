import {
  ActivityPageSchema,
  ActivityRecordSchema,
  ACCOUNT_SCOPE_HEADER,
  ApiErrorSchema,
  CLIENT_HEADER,
  CLIENT_HEADER_VALUE,
  MAX_ACTIVITIES_PER_USER,
  MAX_PAGE_BODY_BYTES,
  MAX_PAGE_SIZE,
  MAX_FILE_BYTES,
  MeResponseSchema,
  ProfileSchema,
} from '@rca/contract'
import type { ActivityRecord, Me, Profile, ProfileInput } from '@rca/contract'
import type { ActivityDigest } from '@rca/core/types'

/** Where the browser starts Google sign-in. The API redirects back to the app when done. */
export const signInUrl = '/api/auth/google'

/** A failed request. Status 0 means the server could not be reached at all. */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

export interface CreatedActivity {
  record: ActivityRecord
  /** False when the same activity already existed and was returned as it is. */
  created: boolean
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
type Body = { json: unknown } | { bytes: Uint8Array }

/** Keep a stalled connection from pinning the worker queue indefinitely. */
const REQUEST_TIMEOUT_MS = 15_000
/** Originals may be tens of MiB; allow a bounded transfer without imposing a metadata deadline. */
const TRANSFER_TIMEOUT_MS = 120_000
const READ_RETRIES = 1
const CLIENT_PAGE_SIZE = MAX_PAGE_SIZE
const PAGE_BODY_LIMIT = MAX_PAGE_BODY_BYTES
const ERROR_BODY_LIMIT = 64 * 1024
const INVALID_RESPONSE_MESSAGE = 'Unexpected response from the server'
const responseTimeouts = new WeakMap<Response, ReturnType<typeof setTimeout>>()

function clearResponseTimeout(response: Response): void {
  const timeout = responseTimeouts.get(response)
  if (timeout !== undefined) {
    clearTimeout(timeout)
    responseTimeouts.delete(response)
  }
}

async function request(
  method: Method,
  path: string,
  body?: Body,
  userId?: string,
): Promise<Response> {
  const headers = new Headers()
  if (method !== 'GET') headers.set(CLIENT_HEADER, CLIENT_HEADER_VALUE)
  if (userId !== undefined) headers.set(ACCOUNT_SCOPE_HEADER, userId)
  let payload: BodyInit | undefined
  if (body !== undefined && 'json' in body) {
    headers.set('Content-Type', 'application/json')
    payload = JSON.stringify(body.json)
  } else if (body !== undefined) {
    headers.set('Content-Type', 'application/octet-stream')
    // A FIT file read from disk is always backed by a plain ArrayBuffer.
    payload = body.bytes as Uint8Array<ArrayBuffer>
  }
  let attempt = 0
  while (true) {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      path.endsWith('/file') ? TRANSFER_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
    )
    let response: Response
    try {
      response = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers,
        body: payload,
        signal: controller.signal,
      })
    } catch {
      clearTimeout(timeout)
      if (method === 'GET' && attempt < READ_RETRIES) {
        attempt++
        continue
      }
      throw new ApiRequestError(0, 'network_error', 'Could not reach the server')
    }
    responseTimeouts.set(response, timeout)
    if (response.ok) {
      if (response.body === null) clearResponseTimeout(response)
      return response
    }
    if (
      method === 'GET' &&
      response.status >= 500 &&
      response.headers.get('retry-after') === null &&
      attempt < READ_RETRIES
    ) {
      void response.body?.cancel().catch(() => undefined)
      clearResponseTimeout(response)
      attempt++
      continue
    }
    throw await errorFrom(response)
  }
}

async function errorFrom(response: Response): Promise<ApiRequestError> {
  const body = await readResponseJson(response, ERROR_BODY_LIMIT).catch(() => undefined)
  const parsed = ApiErrorSchema.safeParse(body)
  if (parsed.success) {
    return new ApiRequestError(response.status, parsed.data.error.code, parsed.data.error.message)
  }
  const fallback = response.statusText || `Request failed with status ${response.status}`
  return new ApiRequestError(response.status, 'http_error', fallback)
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

async function readJson<T>(
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

/** The signed-in user and profile, or null when nobody is signed in. */
export async function getMe(): Promise<Me | null> {
  return readJson(await request('GET', '/api/me'), MeResponseSchema)
}

export async function updateProfile(input: ProfileInput, userId?: string): Promise<Profile> {
  return readJson(await request('PUT', '/api/profile', { json: input }, userId), ProfileSchema)
}

export async function logout(userId?: string): Promise<void> {
  await request('POST', '/api/auth/logout', undefined, userId)
}

/** Deletes the account and every stored activity and file in it. */
export async function deleteAccount(userId?: string): Promise<void> {
  await request('DELETE', '/api/me', undefined, userId)
}

/**
 * Every activity the user has, newest first, following the server's pages to the end. With
 * `since` (epoch ms), only those created at or after it. `onUnreadable` receives the number of
 * stored activities the server could not read; it is called once, and only when that number is
 * above zero.
 *
 * With `onPage`, each page's records are handed over as they arrive and are not kept, so a large
 * library never sits in memory whole; the promise then resolves to an empty array. Without it the
 * promise resolves to every record.
 */
export async function listActivities(
  since?: number,
  userId?: string,
  onUnreadable?: (count: number) => void,
  onPage?: (items: ActivityRecord[]) => void,
): Promise<ActivityRecord[]> {
  const records: ActivityRecord[] = []
  const seenCursors = new Set<string>()
  let cursor: string | undefined
  let pages = 0
  let total = 0
  let unreadable = 0
  do {
    if (pages >= MAX_ACTIVITIES_PER_USER) {
      throw new ApiRequestError(200, 'invalid_response', INVALID_RESPONSE_MESSAGE)
    }
    pages++
    const params = new URLSearchParams({ limit: String(CLIENT_PAGE_SIZE) })
    if (since !== undefined) params.set('since', String(since))
    if (cursor !== undefined) params.set('cursor', cursor)
    const page = await readJson(
      await request('GET', `/api/activities?${params}`, undefined, userId),
      ActivityPageSchema,
      PAGE_BODY_LIMIT,
    )
    if (total + page.items.length > MAX_ACTIVITIES_PER_USER) {
      throw new ApiRequestError(200, 'invalid_response', INVALID_RESPONSE_MESSAGE)
    }
    total += page.items.length
    if (onPage) onPage(page.items)
    else records.push(...page.items)
    unreadable += page.unreadable ?? 0
    cursor = page.nextCursor ?? undefined
    // A server that repeats a cursor would make this loop forever.
    if (cursor !== undefined) {
      if (seenCursors.has(cursor)) {
        throw new ApiRequestError(200, 'invalid_response', INVALID_RESPONSE_MESSAGE)
      }
      seenCursors.add(cursor)
    }
  } while (cursor !== undefined)
  if (unreadable > 0) onUnreadable?.(unreadable)
  return records
}

/**
 * Stores an activity digest. With `replaceId`, the server updates that exact activity instead of
 * inserting one, and answers 404 not_found if it was deleted. Without it, an activity that already
 * exists is returned as it is (created false).
 */
export async function createActivity(
  digest: ActivityDigest,
  fileName: string,
  fileHash: string,
  userId?: string,
  replaceId?: string,
): Promise<CreatedActivity> {
  const query = replaceId === undefined ? '' : `?${new URLSearchParams({ replace: replaceId })}`
  const response = await request(
    'POST',
    `/api/activities${query}`,
    {
      json: { digest, fileName, fileHash },
    },
    userId,
  )
  return {
    record: await readJson(response, ActivityRecordSchema),
    created: response.status === 201,
  }
}

/** Stores the original file for an activity. The server checks it against the activity's hash. */
export async function uploadFile(
  id: string,
  bytes: Uint8Array,
  userId?: string,
): Promise<ActivityRecord> {
  const path = `/api/activities/${encodeURIComponent(id)}/file`
  return readJson(await request('PUT', path, { bytes }, userId), ActivityRecordSchema)
}

/** Downloads one original FIT file without allowing a missing length header to grow unbounded. */
export async function downloadActivityFile(id: string, userId?: string): Promise<Uint8Array> {
  const response = await request(
    'GET',
    `/api/activities/${encodeURIComponent(id)}/file`,
    undefined,
    userId,
  )
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > MAX_FILE_BYTES) {
    await response.body?.cancel()
    clearResponseTimeout(response)
    throw new ApiRequestError(413, 'file_too_large', 'Original activity file is too large')
  }
  if (!response.body) {
    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await response.arrayBuffer())
    } finally {
      clearResponseTimeout(response)
    }
    if (bytes.byteLength > MAX_FILE_BYTES) {
      throw new ApiRequestError(413, 'file_too_large', 'Original activity file is too large')
    }
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_FILE_BYTES) {
        await reader.cancel()
        throw new ApiRequestError(413, 'file_too_large', 'Original activity file is too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
    clearResponseTimeout(response)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function deleteActivity(id: string, userId?: string): Promise<void> {
  await request('DELETE', `/api/activities/${encodeURIComponent(id)}`, undefined, userId)
}
