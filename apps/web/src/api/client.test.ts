import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { CLIENT_HEADER, CLIENT_HEADER_VALUE } from '@rca/contract'
import { DURATIONS_S } from '@rca/core/constants'
import type { ActivityRecord, Me, ProfileInput } from '@rca/contract'
import type { ActivityDigest } from '@rca/core/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiRequestError,
  createActivity,
  deleteAccount,
  deleteActivity,
  downloadActivityFile,
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
  durationS: 3600,
  distanceM: null,
  elevationGainM: 12,
  hasHeartRate: false,
  indoor: false,
  powerSource: 'none',
  flags: [],
  flagCounts: {},
  maxHeartRate: null,
  curve: DURATIONS_S.map((durationS) => ({
    durationS,
    value: null,
    startIndex: 0,
    windowS: durationS,
    heartRate: null,
    terms: null,
  })),
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
  modelRevision: MODEL_REVISION,
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
  vi.useRealTimers()
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
    stubFetch(
      respond(500, { error: { code: 'internal_error', message: 'Something went wrong' } }),
      respond(500, { error: { code: 'internal_error', message: 'Something went wrong' } }),
    )
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

  it('retries a transient network failure once on a safe read', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(respond(200, ME))
    vi.stubGlobal('fetch', fetchMock)
    expect(await getMe()).toEqual(ME)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('bounds a stalled request and retries it once', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_: string, init: RequestInit) => {
      if (fetchMock.mock.calls.length > 1) return Promise.resolve(respond(200, ME))
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const request = getMe()
    await vi.advanceTimersByTimeAsync(15_000)
    await expect(request).resolves.toEqual(ME)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('does not retry a 503 that advertises Retry-After', async () => {
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'busy' } }), {
        status: 503,
        headers: { 'content-type': 'application/json', 'retry-after': '60' },
      }),
    )
    await expect(getMe()).rejects.toMatchObject({ status: 503, code: 'service_unavailable' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('allows original-file transfers to outlast the shorter metadata request deadline', async () => {
    vi.useFakeTimers()
    let finish!: () => void
    let signal: AbortSignal | null | undefined
    const fetchMock = vi.fn((_: string, init: RequestInit) => {
      signal = init.signal
      return new Promise<Response>((resolve, reject) => {
        finish = () => resolve(new Response(new Uint8Array([1, 2, 3])))
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const transfer = downloadActivityFile('a1')
      await vi.advanceTimersByTimeAsync(15_001)
      expect(signal?.aborted).toBe(false)
      finish()
      expect(await transfer).toEqual(new Uint8Array([1, 2, 3]))
      expect(fetchMock).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the timeout active while reading an error response body', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_: string, init: RequestInit) =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              init.signal?.addEventListener('abort', () => controller.error(new Error('aborted')))
            },
          }),
          { status: 503, headers: { 'retry-after': '60' } },
        ),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const request = getMe()
    const rejection = expect(request).rejects.toMatchObject({ status: 503 })
    await vi.advanceTimersByTimeAsync(15_000)
    await rejection
    expect(fetchMock).toHaveBeenCalledOnce()
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
    expect(await updateProfile(PROFILE_INPUT, 'u1')).toEqual(stored)

    const { path, init, headers } = callOf(fetchMock)
    expect(path).toBe('/api/profile')
    expect(init.method).toBe('PUT')
    expect(headers.get(CLIENT_HEADER)).toBe(CLIENT_HEADER_VALUE)
    expect(headers.get('X-RCA-User')).toBe('u1')
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

    expect(callOf(fetchMock).path).toBe('/api/activities?limit=25')
    expect(callOf(fetchMock).init.method).toBe('GET')
    expect(records).toHaveLength(1)
    const [record] = records
    expect(record?.id).toBe('rec-1')
    expect(record?.digest.durationS).toBe(3600)
    expect(record?.digest.distanceM).toBeNaN()
    expect(record?.digest.curve[0]?.value).toBeNaN()
    expect(record?.digest.curve[0]?.heartRate).toBeNull()
    expect(record?.digest.modelRevision).toBe(1)
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
    expect(callOf(fetchMock, 0).path).toBe('/api/activities?limit=25')
    expect(callOf(fetchMock, 1).path).toBe('/api/activities?limit=25&cursor=c1')
    expect(callOf(fetchMock, 2).path).toBe('/api/activities?limit=25&cursor=c2')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('reports the unreadable count summed over every page, and only when it is above zero', async () => {
    stubFetch(
      respond(200, { items: [RECORD_WIRE], nextCursor: 'c1', unreadable: 1 }),
      respond(200, { items: [{ ...RECORD_WIRE, id: 'rec-2' }], nextCursor: null, unreadable: 2 }),
    )
    const onUnreadable = vi.fn()
    const records = await listActivities(undefined, undefined, onUnreadable)
    expect(records.map((r) => r.id)).toEqual(['rec-1', 'rec-2'])
    expect(onUnreadable).toHaveBeenCalledExactlyOnceWith(3)
  })

  it('does not report an unreadable count when every stored activity was readable', async () => {
    stubFetch(respond(200, { items: [RECORD_WIRE], nextCursor: null }))
    const onUnreadable = vi.fn()
    await listActivities(undefined, undefined, onUnreadable)
    expect(onUnreadable).not.toHaveBeenCalled()
  })

  it('keeps since on every page request', async () => {
    const fetchMock = stubFetch(
      respond(200, { items: [RECORD_WIRE], nextCursor: 'c1' }),
      respond(200, { items: [{ ...RECORD_WIRE, id: 'rec-2' }], nextCursor: null }),
    )
    await listActivities(1_700_000_000_000)
    expect(callOf(fetchMock, 0).path).toBe('/api/activities?limit=25&since=1700000000000')
    expect(callOf(fetchMock, 1).path).toBe('/api/activities?limit=25&since=1700000000000&cursor=c1')
  })

  it('treats since of 0 as a parameter, not as missing', async () => {
    const fetchMock = stubFetch(respond(200, { items: [], nextCursor: null }))
    await listActivities(0)
    expect(callOf(fetchMock).path).toBe('/api/activities?limit=25&since=0')
  })

  it('stops with an error when the server repeats a cursor instead of looping forever', async () => {
    stubFetch(
      respond(200, { items: [RECORD_WIRE], nextCursor: 'same' }),
      respond(200, { items: [RECORD_WIRE], nextCursor: 'same' }),
    )
    await expect(listActivities()).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('rejects a list that is not a page of records', async () => {
    stubFetch(respond(200, [RECORD_WIRE]))
    await expect(listActivities()).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('rejects an empty page that claims more pages remain', async () => {
    stubFetch(respond(200, { items: [], nextCursor: 'cursor' }))
    await expect(listActivities()).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

describe('createActivity', () => {
  it('posts the digest, name and hash as JSON and reports a new record as created', async () => {
    const fetchMock = stubFetch(respond(201, RECORD_WIRE))
    const hash = 'a'.repeat(64)
    const { record, created } = await createActivity(DIGEST, 'run.fit', hash, 'u1')

    const { path, init, headers } = callOf(fetchMock)
    expect(path).toBe('/api/activities')
    expect(init.method).toBe('POST')
    expect(headers.get(CLIENT_HEADER)).toBe(CLIENT_HEADER_VALUE)
    expect(headers.get('X-RCA-User')).toBe('u1')
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
    expect(record.digest.durationS).toBe(3600)
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

  it('replaces only the named activity when replaceId is given, and never sends a plain create', async () => {
    const fetchMock = stubFetch(respond(200, RECORD_WIRE))
    const { created } = await createActivity(DIGEST, 'run.fit', 'c'.repeat(64), 'u1', 'rec-1')
    expect(callOf(fetchMock).path).toBe('/api/activities?replace=rec-1')
    expect(callOf(fetchMock).init.method).toBe('POST')
    expect(created).toBe(false)
  })

  it('sends no replace parameter without replaceId', async () => {
    const fetchMock = stubFetch(respond(201, RECORD_WIRE))
    await createActivity(DIGEST, 'run.fit', 'c'.repeat(64), 'u1')
    expect(callOf(fetchMock).path).toBe('/api/activities')
  })

  it('throws not_found with status 404 when the replaced activity was deleted', async () => {
    stubFetch(respond(404, { error: { code: 'not_found', message: 'Activity not found' } }))
    await expect(
      createActivity(DIGEST, 'run.fit', 'c'.repeat(64), 'u1', 'rec-1'),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' })
  })

  it('surfaces the digest quota and the database-full refusals with their codes', async () => {
    stubFetch(respond(403, { error: { code: 'digest_quota', message: 'Digest quota reached' } }))
    await expect(createActivity(DIGEST, 'run.fit', 'd'.repeat(64))).rejects.toMatchObject({
      status: 403,
      code: 'digest_quota',
    })
    stubFetch(respond(503, { error: { code: 'database_full', message: 'Database full' } }))
    await expect(createActivity(DIGEST, 'run.fit', 'd'.repeat(64))).rejects.toMatchObject({
      status: 503,
      code: 'database_full',
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

describe('downloadActivityFile', () => {
  it('downloads original bytes from the encoded activity path', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(bytes, { status: 200, headers: { 'content-length': '3' } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await downloadActivityFile('rec 1/x')).toEqual(bytes)
    expect(callOf(fetchMock).path).toBe('/api/activities/rec%201%2Fx/file')
  })

  it('rejects a file that exceeds the allowed size', async () => {
    stubFetch(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-length': '52428801' },
      }),
    )
    await expect(downloadActivityFile('rec-1')).rejects.toMatchObject({ code: 'file_too_large' })
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

describe('retry policy', () => {
  it('sends a POST exactly once when the connection drops, so a retry cannot duplicate it', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(createActivity(DIGEST, 'run.fit', 'a'.repeat(64))).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends a PUT exactly once when the connection drops', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(uploadFile('rec-1', new Uint8Array([1]))).rejects.toMatchObject({ status: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends a POST exactly once on a server error', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        respond(500, { error: { code: 'internal_error', message: 'Oops' } }),
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(createActivity(DIGEST, 'run.fit', 'a'.repeat(64))).rejects.toMatchObject({
      status: 500,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a GET once after a server error, then returns the success', async () => {
    const fetchMock = stubFetch(
      respond(500, { error: { code: 'internal_error', message: 'Oops' } }),
      respond(200, ME),
    )
    expect(await getMe()).toEqual(ME)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up on a GET after its one retry when the server keeps failing', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        respond(500, { error: { code: 'internal_error', message: 'Oops' } }),
      )
    vi.stubGlobal('fetch', fetchMock)
    await expect(getMe()).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a GET that failed with a client error', async () => {
    const fetchMock = stubFetch(respond(404, { error: { code: 'not_found', message: 'Gone' } }))
    await expect(downloadActivityFile('rec-1')).rejects.toMatchObject({ status: 404 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
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
