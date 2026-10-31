import {
  ActivityPageWireSchema,
  ActivityRecordSchema,
  ACCOUNT_SCOPE_HEADER,
  CLIENT_HEADER,
  CLIENT_HEADER_VALUE,
  MAX_ACTIVITIES_PER_USER,
  MAX_PAGE_BODY_BYTES,
  MAX_PAGE_SIZE,
  MAX_FILE_BYTES,
  MeResponseSchema,
  ProfileSchema,
} from '@rca/contract'
import { ActivityLabelsResultSchema } from '@rca/contract'
import type {
  ActivityLabelsResult,
  ActivityRecord,
  LabelChange,
  Me,
  Profile,
  ProfileInput,
} from '@rca/contract'
import type { ActivityDigest } from '@rca/core/types'
import { readableRecords } from './pageRecords'
import { ApiRequestError } from './apiError'
import { gzipSmaller } from './gzip'
import { noteRequestActivity } from './requestActivity'
import type { RequestOptions } from './requestOptions'
import {
  clearResponseTimeout,
  errorFrom,
  INVALID_RESPONSE_MESSAGE,
  noteResponseTimeout,
  readJson,
} from './responseBody'

export { ApiRequestError, readJson }
export type { RequestOptions }

/** Where the browser starts Google sign-in. The API redirects back to the app when done. */
export const signInUrl = '/api/auth/google'

export interface CreatedActivity {
  record: ActivityRecord
  /** False when the same activity already existed and was returned as it is. */
  created: boolean
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
type Body = { json: unknown } | { bytes: Uint8Array; encoding?: 'gzip' }

/** Keep a stalled connection from pinning the worker queue indefinitely. */
const REQUEST_TIMEOUT_MS = 15_000
/** Originals may be tens of MiB; allow a bounded transfer without imposing a metadata deadline. */
const TRANSFER_TIMEOUT_MS = 120_000
/**
 * How long a create waits before its one retry after a lost connection or a 5xx with no
 * Retry-After. Only a create asks for one: the server dedupes it by dedupe_key (a replace names the
 * activity by its id), so a second try returns the activity the first stored. A read always repeats
 * at once, and nothing else repeats.
 */
const CREATE_RETRY_BACKOFF_MS = 1_000
/** Refusals that will not clear in a moment, so they are never retried. */
const NOT_TRANSIENT = new Set(['database_full', 'read_only'])
const CLIENT_PAGE_SIZE = MAX_PAGE_SIZE
const PAGE_BODY_LIMIT = MAX_PAGE_BODY_BYTES
/** One fetch with its deadline. Resolves to null when the server could not be reached. */
async function fetchOnce(path: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(path, { ...init, signal: controller.signal })
    noteResponseTimeout(response, timeout)
    return response
  } catch {
    clearTimeout(timeout)
    return null
  }
}

/**
 * Sends a request. A read is tried once more at once, and with `retryBackoffMs` any other request is
 * tried once more after that long, when it fails by a lost connection or a 5xx with no Retry-After.
 */
export async function request(
  method: Method,
  path: string,
  body?: Body,
  userId?: string,
  retryBackoffMs?: number,
  options: RequestOptions = {},
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
    if (body.encoding !== undefined) headers.set('Content-Encoding', body.encoding)
    // A FIT file read from disk is always backed by a plain ArrayBuffer.
    payload = body.bytes as Uint8Array<ArrayBuffer>
  }
  const init: RequestInit = { method, credentials: 'same-origin', headers, body: payload }
  const timeoutMs =
    options.timeoutMs ?? (path.endsWith('/file') ? TRANSFER_TIMEOUT_MS : REQUEST_TIMEOUT_MS)
  const backoffMs = options.retry === false ? undefined : method === 'GET' ? 0 : retryBackoffMs
  for (let attempt = 0; ; attempt++) {
    const startedAt = Date.now()
    const response = await fetchOnce(path, init, timeoutMs)
    noteRequestActivity()
    const failedFast =
      options.retryWithinMs === undefined || Date.now() - startedAt < options.retryWithinMs
    const canRetry = backoffMs !== undefined && attempt === 0 && failedFast
    if (response === null) {
      if (!canRetry) throw new ApiRequestError(0, 'network_error', 'Could not reach the server')
    } else if (response.ok) {
      if (response.body === null) clearResponseTimeout(response)
      return response
    } else if (!canRetry || response.status < 500 || response.headers.get('retry-after') !== null) {
      throw await errorFrom(response)
    } else {
      const error = await errorFrom(response)
      if (NOT_TRANSIENT.has(error.code)) throw error
    }
    if (backoffMs) await new Promise((resolve) => setTimeout(resolve, backoffMs))
  }
}

/**
 * The signed-in user and profile, or null when nobody is signed in. The account lookup passes a short
 * deadline and no immediate retry, since it retries on its own schedule and nothing waits on it.
 */
export async function getMe(options?: RequestOptions): Promise<Me | null> {
  return readJson(
    await request('GET', '/api/me', undefined, undefined, undefined, options),
    MeResponseSchema,
  )
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
 * stored activities that could not be read, whether the server found they are not JSON or a digest
 * failed its schema here; it is called once, and only when that number is above zero. A digest that
 * fails the schema is skipped, not fatal to the page.
 *
 * With `onPage`, each page's records are handed over as they arrive and are not kept, so a large
 * library never sits in memory whole; the promise then resolves to an empty array. Without it the
 * promise resolves to every record. `onFetched` hears of each page as it arrives, which tells a watchdog
 * that a long listing is getting somewhere.
 */
export async function listActivities(
  since?: number,
  userId?: string,
  onUnreadable?: (count: number) => void,
  onPage?: (items: ActivityRecord[]) => void,
  onFetched?: () => void,
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
      ActivityPageWireSchema,
      PAGE_BODY_LIMIT,
    )
    if (total + page.items.length > MAX_ACTIVITIES_PER_USER) {
      throw new ApiRequestError(200, 'invalid_response', INVALID_RESPONSE_MESSAGE)
    }
    total += page.items.length
    const readable = readableRecords(page.items)
    onFetched?.()
    if (onPage) onPage(readable.records)
    else records.push(...readable.records)
    unreadable += (page.unreadable ?? 0) + readable.unreadable
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
    { json: { digest, fileName, fileHash } },
    userId,
    CREATE_RETRY_BACKOFF_MS,
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
  // Sent gzipped when that is smaller: the server checks the hash of the file itself and stores, and counts, what it gets.
  const zipped = await gzipSmaller(bytes)
  const body = zipped === null ? { bytes } : { bytes: zipped, encoding: 'gzip' as const }
  return readJson(await request('PUT', path, body, userId), ActivityRecordSchema)
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

/**
 * Sets or clears the athlete's label on saved activities, in place (at most MAX_LABELS_PER_REQUEST at a time). A change
 * applies only to a row that still holds the revision and label it names; the answer lists the rows that no longer do.
 */
export async function patchLabels(
  labels: LabelChange[],
  userId?: string,
): Promise<ActivityLabelsResult> {
  const response = await request('PATCH', '/api/activities/labels', { json: { labels } }, userId)
  return readJson(response, ActivityLabelsResultSchema)
}
