import { CLIENT_HEADER, CLIENT_HEADER_VALUE } from '@rca/contract'
import type { ActivityRecord, Me, ProfileInput } from '@rca/contract'
import type { ActivityDigest } from '@rca/core/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiRequestError,
  createActivity,
  deleteAccount,
  deleteActivity,
  getMe,
  listActivities,
  logout,
  signInUrl,
  updateProfile,
  uploadFile,
} from './client'

const ME: Me = {
  user: { id: 'u1', email: 'a@example.com', name: 'Ada', pictureUrl: null },
  profile: { massKg: 75, bikeMassKg: 9, units: 'metric', keepFiles: true, updatedAt: 1000 },
}

const PROFILE_INPUT: ProfileInput = {
  massKg: 80,
  bikeMassKg: 10,
  units: 'imperial',
  keepFiles: false,
}

/** Digest as it appears on the wire: NaN fields are null. */
const WIRE_DIGEST = {
  version: 1,
  id: 'a1',
  name: 'Morning run',
  sport: 'run',
  startMs: 1_700_000_000_000,
  durationS: null,
  distanceM: null,
  elevationGainM: 12,
  hasHeartRate: false,
  indoor: false,
  powerSource: 'none',
  flags: [],
  flagCounts: {},
  maxHeartRate: null,
  curve: [{ durationS: 60, value: null, startIndex: 0, windowS: 60, heartRate: null, terms: null }],
  hrBlocks: [],
  calibration: null,
  climbSections: [],
}

const RECORD_WIRE = {
  id: 'rec-1',
  digest: WIRE_DIGEST,
  fileName: 'run.fit',
  hasFile: false,
  fileSize: null,
  createdAt: 2000,
}

/** The same digest as the in-memory type, with NaN in the places the wire writes null. */
const DIGEST: ActivityDigest = {
  version: 1,
  id: 'a1',
  name: 'Morning run',
  sport: 'run',
  startMs: 1_700_000_000_000,
  durationS: Number.NaN,
  distanceM: Number.NaN,
  elevationGainM: 12,
  hasHeartRate: false,
  indoor: false,
  powerSource: 'none',
  flags: [],
  flagCounts: {},
  maxHeartRate: null,
  curve: [
    {
      durationS: 60,
      value: Number.NaN,
      startIndex: 0,
      windowS: 60,
      heartRate: null,
      terms: null,
    },
  ],
  hrBlocks: [],
  calibration: null,
  climbSections: [],
}

function respond(status: number, body?: unknown): Response {
  if (body === undefined) return new Response(null, { status })
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn()
  for (const response of responses) fetchMock.mockResolvedValueOnce(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function callOf(fetchMock: ReturnType<typeof stubFetch>, index = 0) {
  const call = fetchMock.mock.calls[index]
  if (call === undefined) throw new Error(`fetch was not called ${index + 1} times`)
  const [path, init] = call as [string, RequestInit]
  return { path, init, headers: new Headers(init.headers) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('signInUrl', () => {
  it('starts Google sign-in on the same origin', () => {
    expect(signInUrl).toBe('/api/auth/google')
  })
})

describe('getMe', () => {
  it('returns the parsed user and profile with a same-origin GET', async () => {
    const fetchMock = stubFetch(respond(200, ME))
    expect(await getMe()).toEqual(ME)

    const { path, init, headers } = callOf(fetchMock)
    expect(path).toBe('/api/me')
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('same-origin')
    expect(headers.has(CLIENT_HEADER)).toBe(false)
  })

  it('returns null when nobody is signed in', async () => {
    stubFetch(respond(401, { error: { code: 'unauthenticated', message: 'Sign in required' } }))
    expect(await getMe()).toBeNull()
  })

  it('throws the server error code and message for other failures', async () => {
    stubFetch(respond(500, { error: { code: 'internal_error', message: 'Something went wrong' } }))
    const error = await getMe().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({
      status: 500,
      code: 'internal_error',
      message: 'Something went wrong',
    })
  })

  it('maps a non-JSON error page (a static host without the API) to http_error', async () => {
    stubFetch(new Response('<html>Not found</html>', { status: 404, statusText: 'Not Found' }))
    await expect(getMe()).rejects.toMatchObject({
      status: 404,
      code: 'http_error',
      message: 'Not Found',
    })
  })

  it('uses a status message when the error body is JSON but not an API error', async () => {
    stubFetch(respond(404, { detail: 'nope' }))
    await expect(getMe()).rejects.toMatchObject({
      status: 404,
      code: 'http_error',
      message: 'Request failed with status 404',
    })
  })

  it('maps a network failure to status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(getMe()).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
      message: 'Could not reach the server',
    })
  })

  it('rejects a body that does not match the contract', async () => {
    stubFetch(respond(200, { user: { id: 'u1' } }))
    await expect(getMe()).rejects.toMatchObject({ status: 200, code: 'invalid_response' })
  })

  it('rejects a success response with no body', async () => {
    stubFetch(new Response(null, { status: 200 }))
    await expect(getMe()).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

describe('updateProfile', () => {
  it('sends the profile as JSON with the client header and returns the stored profile', async () => {
    const stored = { ...PROFILE_INPUT, updatedAt: 3000 }
    const fetchMock = stubFetch(respond(200, stored))
    expect(await updateProfile(PROFILE_INPUT)).toEqual(stored)

    const { path, init, headers } = callOf(fetchMock)
    expect(path).toBe('/api/profile')
    expect(init.method).toBe('PUT')
    expect(headers.get(CLIENT_HEADER)).toBe(CLIENT_HEADER_VALUE)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual(PROFILE_INPUT)
  })

  it('throws the validation error from the server', async () => {
    stubFetch(respond(400, { error: { code: 'invalid_request', message: 'massKg is too small' } }))
    await expect(updateProfile(PROFILE_INPUT)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
      message: 'massKg is too small',
    })
  })
})

describe('logout', () => {
  it('posts with the client header and resolves on 204', async () => {
    const fetchMock = stubFetch(respond(204))
    await expect(logout()).resolves.toBeUndefined()

    const { path, init, headers } = callOf(fetchMock)
    expect(path).toBe('/api/auth/logout')
    expect(init.method).toBe('POST')
    expect(headers.get(CLIENT_HEADER)).toBe(CLIENT_HEADER_VALUE)
  })

  it('throws when the server refuses', async () => {
    stubFetch(respond(403, { error: { code: 'csrf_rejected', message: 'Requests must send' } }))
    await expect(logout()).rejects.toMatchObject({ status: 403, code: 'csrf_rejected' })
  })
})

describe('deleteAccount', () => {
  it('deletes the account with the client header', async () => {
    const fetchMock = stubFetch(respond(204))
    await expect(deleteAccount()).resolves.toBeUndefined()

    const { path, init, headers } = callOf(fetchMock)
    expect(path).toBe('/api/me')
    expect(init.method).toBe('DELETE')
    expect(headers.get(CLIENT_HEADER)).toBe(CLIENT_HEADER_VALUE)
  })
})

describe('listActivities', () => {
  it('lists every activity with no since parameter and restores NaN in the digests', async () => {
    const fetchMock = stubFetch(respond(200, { items: [RECORD_WIRE], nextCursor: null }))
    const records = await listActivities()

    expect(callOf(fetchMock).path).toBe('/api/activities?limit=1000')
    expect(callOf(fetchMock).init.method).toBe('GET')
    expect(records).toHaveLength(1)
    const [record] = records
    expect(record?.id).toBe('rec-1')
    expect(record?.digest.durationS).toBeNaN()
    expect(record?.digest.distanceM).toBeNaN()
    expect(record?.digest.curve[0]?.value).toBeNaN()
    expect(record?.digest.curve[0]?.heartRate).toBeNull()
  })

  it('follows nextCursor until a page says there is no more', async () => {
    const second = { ...RECORD_WIRE, id: 'rec-2' }
    const third = { ...RECORD_WIRE, id: 'rec-3' }
    const fetchMock = stubFetch(
      respond(200, { items: [RECORD_WIRE], nextCursor: 'c1' }),
      respond(200, { items: [second], nextCursor: 'c2' }),
      respond(200, { items: [third], nextCursor: null }),
    )
    const records = await listActivities()

    expect(records.map((r) => r.id)).toEqual(['rec-1', 'rec-2', 'rec-3'])
    expect(callOf(fetchMock, 0).path).toBe('/api/activities?limit=1000')
    expect(callOf(fetchMock, 1).path).toBe('/api/activities?limit=1000&cursor=c1')
    expect(callOf(fetchMock, 2).path).toBe('/api/activities?limit=1000&cursor=c2')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('keeps since on every page request', async () => {
    const fetchMock = stubFetch(
      respond(200, { items: [], nextCursor: 'c1' }),
      respond(200, { items: [], nextCursor: null }),
    )
    await listActivities(1_700_000_000_000)
    expect(callOf(fetchMock, 0).path).toBe('/api/activities?limit=1000&since=1700000000000')
    expect(callOf(fetchMock, 1).path).toBe(
      '/api/activities?limit=1000&since=1700000000000&cursor=c1',
    )
  })

  it('treats since of 0 as a parameter, not as missing', async () => {
    const fetchMock = stubFetch(respond(200, { items: [], nextCursor: null }))
    await listActivities(0)
    expect(callOf(fetchMock).path).toBe('/api/activities?limit=1000&since=0')
  })

  it('stops with an error when the server repeats a cursor instead of looping forever', async () => {
    stubFetch(
      respond(200, { items: [], nextCursor: 'same' }),
      respond(200, { items: [], nextCursor: 'same' }),
    )
    await expect(listActivities()).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('rejects a list that is not a page of records', async () => {
    stubFetch(respond(200, [RECORD_WIRE]))
    await expect(listActivities()).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

describe('createActivity', () => {
  it('posts the digest, name and hash as JSON and reports a new record as created', async () => {
    const fetchMock = stubFetch(respond(201, RECORD_WIRE))
    const hash = 'a'.repeat(64)
    const { record, created } = await createActivity(DIGEST, 'run.fit', hash)

    const { path, init, headers } = callOf(fetchMock)
    expect(path).toBe('/api/activities')
    expect(init.method).toBe('POST')
    expect(headers.get(CLIENT_HEADER)).toBe(CLIENT_HEADER_VALUE)
    expect(headers.get('Content-Type')).toBe('application/json')
    const body = JSON.parse(init.body as string) as {
      digest: { durationS: unknown; curve: { value: unknown }[] }
      fileName: string
      fileHash: string
    }
    expect(body.fileName).toBe('run.fit')
    expect(body.fileHash).toBe(hash)
    expect(body.digest.durationS).toBeNull()
    expect(body.digest.curve[0]?.value).toBeNull()

    expect(created).toBe(true)
    expect(record.digest.durationS).toBeNaN()
  })

  it('reports an activity that already existed as not created', async () => {
    stubFetch(respond(200, RECORD_WIRE))
    const { created, record } = await createActivity(DIGEST, 'run.fit', 'b'.repeat(64))
    expect(created).toBe(false)
    expect(record.id).toBe('rec-1')
  })

  it('throws the server validation error', async () => {
    stubFetch(respond(400, { error: { code: 'invalid_request', message: 'fileHash is invalid' } }))
    await expect(createActivity(DIGEST, 'run.fit', 'x')).rejects.toMatchObject({
      status: 400,
      code: 'invalid_request',
    })
  })
})

describe('uploadFile', () => {
  it('puts the raw bytes to the activity file path and returns the updated record', async () => {
    const fetchMock = stubFetch(respond(200, { ...RECORD_WIRE, hasFile: true, fileSize: 3 }))
    const bytes = new Uint8Array([1, 2, 3])
    const record: ActivityRecord = await uploadFile('rec 1/x', bytes)

    const { path, init, headers } = callOf(fetchMock)
    expect(path).toBe('/api/activities/rec%201%2Fx/file')
    expect(init.method).toBe('PUT')
    expect(headers.get(CLIENT_HEADER)).toBe(CLIENT_HEADER_VALUE)
    expect(headers.get('Content-Type')).toBe('application/octet-stream')
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(bytes)
    expect(record.hasFile).toBe(true)
    expect(record.fileSize).toBe(3)
  })

  it('throws the hash mismatch from the server', async () => {
    stubFetch(respond(422, { error: { code: 'hash_mismatch', message: 'Does not match' } }))
    await expect(uploadFile('rec-1', new Uint8Array([1]))).rejects.toMatchObject({
      status: 422,
      code: 'hash_mismatch',
    })
  })
})

describe('deleteActivity', () => {
  it('deletes the activity by id with the client header', async () => {
    const fetchMock = stubFetch(respond(204))
    await expect(deleteActivity('rec-1')).resolves.toBeUndefined()

    const { path, init, headers } = callOf(fetchMock)
    expect(path).toBe('/api/activities/rec-1')
    expect(init.method).toBe('DELETE')
    expect(headers.get(CLIENT_HEADER)).toBe(CLIENT_HEADER_VALUE)
  })
})

describe('ApiRequestError', () => {
  it('carries status, code and message', () => {
    const error = new ApiRequestError(409, 'files_disabled', 'Turned off')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ApiRequestError')
    expect(error).toMatchObject({ status: 409, code: 'files_disabled', message: 'Turned off' })
  })
})
