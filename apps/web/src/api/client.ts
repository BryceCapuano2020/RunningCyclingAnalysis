import {
  ActivityRecordSchema,
  ApiErrorSchema,
  CLIENT_HEADER,
  CLIENT_HEADER_VALUE,
  MeSchema,
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

async function request(method: Method, path: string, body?: Body): Promise<Response> {
  const headers = new Headers()
  if (method !== 'GET') headers.set(CLIENT_HEADER, CLIENT_HEADER_VALUE)
  let payload: BodyInit | undefined
  if (body !== undefined && 'json' in body) {
    headers.set('Content-Type', 'application/json')
    payload = JSON.stringify(body.json)
  } else if (body !== undefined) {
    headers.set('Content-Type', 'application/octet-stream')
    // A FIT file read from disk is always backed by a plain ArrayBuffer.
    payload = body.bytes as Uint8Array<ArrayBuffer>
  }
  let response: Response
  try {
    response = await fetch(path, { method, credentials: 'same-origin', headers, body: payload })
  } catch {
    throw new ApiRequestError(0, 'network_error', 'Could not reach the server')
  }
  if (response.ok) return response
  throw await errorFrom(response)
}

async function errorFrom(response: Response): Promise<ApiRequestError> {
  const body: unknown = await response.json().catch(() => undefined)
  const parsed = ApiErrorSchema.safeParse(body)
  if (parsed.success) {
    return new ApiRequestError(response.status, parsed.data.error.code, parsed.data.error.message)
  }
  const fallback = response.statusText || `Request failed with status ${response.status}`
  return new ApiRequestError(response.status, 'http_error', fallback)
}

/** Parses a response body with a contract schema. JSON has no NaN, so the schemas restore it. */
async function readJson<T>(response: Response, schema: { parse(value: unknown): T }): Promise<T> {
  const body: unknown = await response.json().catch(() => undefined)
  try {
    return schema.parse(body)
  } catch {
    throw new ApiRequestError(
      response.status,
      'invalid_response',
      'Unexpected response from the server',
    )
  }
}

/** The signed-in user and profile, or null when nobody is signed in. */
export async function getMe(): Promise<Me | null> {
  try {
    return await readJson(await request('GET', '/api/me'), MeSchema)
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null
    throw error
  }
}

export async function updateProfile(input: ProfileInput): Promise<Profile> {
  return readJson(await request('PUT', '/api/profile', { json: input }), ProfileSchema)
}

export async function logout(): Promise<void> {
  await request('POST', '/api/auth/logout')
}

/** Deletes the account and every stored activity and file in it. */
export async function deleteAccount(): Promise<void> {
  await request('DELETE', '/api/me')
}

/** The user's activities, newest first. With `since` (epoch ms), only those created at or after it. */
export async function listActivities(since?: number): Promise<ActivityRecord[]> {
  const query = since === undefined ? '' : `?${new URLSearchParams({ since: String(since) })}`
  const response = await request('GET', `/api/activities${query}`)
  return readJson(response, ActivityRecordSchema.array())
}

export async function createActivity(
  digest: ActivityDigest,
  fileName: string,
  fileHash: string,
): Promise<CreatedActivity> {
  const response = await request('POST', '/api/activities', {
    json: { digest, fileName, fileHash },
  })
  return {
    record: await readJson(response, ActivityRecordSchema),
    created: response.status === 201,
  }
}

/** Stores the original file for an activity. The server checks it against the activity's hash. */
export async function uploadFile(id: string, bytes: Uint8Array): Promise<ActivityRecord> {
  const path = `/api/activities/${encodeURIComponent(id)}/file`
  return readJson(await request('PUT', path, { bytes }), ActivityRecordSchema)
}

export async function deleteActivity(id: string): Promise<void> {
  await request('DELETE', `/api/activities/${encodeURIComponent(id)}`)
}
