import { MAX_PAGE_BODY_BYTES } from '@rca/contract'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMe, updateProfile, uploadFile } from './client'

const ME = {
  user: { id: 'u1', email: 'a@example.com', name: 'Ada', pictureUrl: null },
  profile: {
    massKg: 75,
    bikeMassKg: 9,
    units: 'metric',
    keepFiles: true,
    birthYear: null,
    sex: null,
    updatedAt: 1000,
  },
}

const PROFILE_INPUT = { massKg: 80, bikeMassKg: 10, units: 'imperial', keepFiles: false } as const

const ERROR_BODY_LIMIT = 64 * 1024
const REQUEST_TIMEOUT_MS = 15_000
const TRANSFER_TIMEOUT_MS = 120_000

/** A JSON body padded with trailing spaces to exactly `bytes` bytes. */
function jsonOfSize(value: unknown, bytes: number): Uint8Array<ArrayBuffer> {
  const text = JSON.stringify(value)
  if (text.length > bytes) throw new Error(`${text.length} bytes does not fit in ${bytes}`)
  return Uint8Array.from(new TextEncoder().encode(text.padEnd(bytes, ' ')))
}

/** A fetch stand-in that never answers and rejects when the client aborts it. */
function stalledFetch() {
  const fetchMock = vi.fn((_: string, init: RequestInit) => {
    signalOf.current = init.signal
    return new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () =>
        reject(new DOMException('aborted', 'AbortError')),
      )
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const signalOf: { current: AbortSignal | null | undefined } = { current: undefined }

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  signalOf.current = undefined
})

describe('request timeouts', () => {
  it('aborts a metadata request exactly at the 15 second deadline', async () => {
    vi.useFakeTimers()
    stalledFetch()
    const outcome = updateProfile(PROFILE_INPUT).catch((error: unknown) => error)

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)
    expect(signalOf.current?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signalOf.current?.aborted).toBe(true)
    expect(await outcome).toMatchObject({ status: 0, code: 'network_error' })
  })

  it('aborts an original-file transfer exactly at the 120 second deadline', async () => {
    // Only the deadline's own timer is faked: the file is gzipped (real stream work) before the request is sent, and the
    // deadline is for the transfer, so it starts when the request does.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    stalledFetch()
    const outcome = uploadFile('a1', new Uint8Array([1, 2, 3])).catch((error: unknown) => error)
    for (let tick = 0; tick < 200 && signalOf.current === undefined; tick++) {
      await new Promise((resolve) => setImmediate(resolve))
    }
    expect(signalOf.current).toBeDefined()

    await vi.advanceTimersByTimeAsync(TRANSFER_TIMEOUT_MS - 1)
    expect(signalOf.current?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signalOf.current?.aborted).toBe(true)
    expect(await outcome).toMatchObject({ status: 0, code: 'network_error' })
  })
})

describe('response size limits', () => {
  it('accepts a declared length of exactly the page body limit', async () => {
    stubResponse(
      new Response(jsonOfSize(ME, MAX_PAGE_BODY_BYTES), {
        status: 200,
        headers: { 'content-length': String(MAX_PAGE_BODY_BYTES) },
      }),
    )
    await expect(getMe()).resolves.toEqual(ME)
  })

  it('rejects a declared length one byte over the page body limit before reading it', async () => {
    stubResponse(
      new Response(jsonOfSize(ME, MAX_PAGE_BODY_BYTES + 1), {
        status: 200,
        headers: { 'content-length': String(MAX_PAGE_BODY_BYTES + 1) },
      }),
    )
    await expect(getMe()).rejects.toMatchObject({ status: 502, code: 'invalid_response' })
  })

  it('accepts a body of exactly the page body limit when no body stream is exposed', async () => {
    stubResponse(bodilessResponse(jsonOfSize(ME, MAX_PAGE_BODY_BYTES)))
    await expect(getMe()).resolves.toEqual(ME)
  })

  it('rejects a body one byte over the page body limit when no body stream is exposed', async () => {
    stubResponse(bodilessResponse(jsonOfSize(ME, MAX_PAGE_BODY_BYTES + 1)))
    await expect(getMe()).rejects.toMatchObject({ status: 502, code: 'invalid_response' })
  })

  it('reads an error body of exactly 64 KiB and keeps its code', async () => {
    stubResponse(errorResponse(ERROR_BODY_LIMIT))
    await expect(getMe()).rejects.toMatchObject({ status: 400, code: 'quota_full' })
  })

  it('ignores an error body one byte over 64 KiB and falls back to the status', async () => {
    stubResponse(errorResponse(ERROR_BODY_LIMIT + 1))
    await expect(getMe()).rejects.toMatchObject({ status: 400, code: 'http_error' })
  })
})

function stubResponse(response: Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response)),
  )
}

/** A real response whose body stream is hidden, so the client takes the buffered path. */
function bodilessResponse(bytes: Uint8Array<ArrayBuffer>): Response {
  const response = new Response(bytes, { status: 200 })
  Object.defineProperty(response, 'body', { value: null })
  return response
}

function errorResponse(bytes: number): Response {
  const body = { error: { code: 'quota_full', message: 'x'.repeat(4000) } }
  return new Response(jsonOfSize(body, bytes), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  })
}
