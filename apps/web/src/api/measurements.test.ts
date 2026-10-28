import { ACCOUNT_SCOPE_HEADER, CLIENT_HEADER, CLIENT_HEADER_VALUE } from '@rca/contract'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError } from './client'
import { deleteMeasurement, listMeasurements, putMeasurement } from './measurements'

const HEART_RATE = { kind: 'maxHeartRate', sport: 'run', value: 188, from: '2024-03-01' } as const

function respond(status: number, body?: unknown): Response {
  return body === undefined
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), {
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

function callOf(fetchMock: ReturnType<typeof stubFetch>) {
  const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return { path, init, headers: new Headers(init.headers) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('listMeasurements', () => {
  it('reads the account list with a same-origin GET scoped to the account', async () => {
    const fetchMock = stubFetch(respond(200, { items: [HEART_RATE] }))
    expect(await listMeasurements('u1')).toEqual([HEART_RATE])
    const { path, init, headers } = callOf(fetchMock)
    expect(path).toBe('/api/measurements')
    expect(init.method).toBe('GET')
    expect(headers.get(ACCOUNT_SCOPE_HEADER)).toBe('u1')
    expect(headers.has(CLIENT_HEADER)).toBe(false)
  })

  it('refuses a list that is not the contract', async () => {
    stubFetch(respond(200, { items: [{ kind: 'height', value: 1, from: '2024-03-01' }] }))
    await expect(listMeasurements()).rejects.toMatchObject({ code: 'invalid_response' })
  })
})

describe('putMeasurement', () => {
  it('sends the entry with the client header and returns what the server stored', async () => {
    const fetchMock = stubFetch(respond(200, HEART_RATE))
    expect(await putMeasurement(HEART_RATE, 'u1')).toEqual(HEART_RATE)
    const { path, init, headers } = callOf(fetchMock)
    expect(path).toBe('/api/measurements')
    expect(init.method).toBe('PUT')
    expect(headers.get(CLIENT_HEADER)).toBe(CLIENT_HEADER_VALUE)
    expect(JSON.parse(init.body as string)).toEqual(HEART_RATE)
  })

  it('throws the server refusal', async () => {
    stubFetch(respond(409, { error: { code: 'measurement_limit', message: 'Too many' } }))
    const error = await putMeasurement(HEART_RATE).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error).toMatchObject({ status: 409, code: 'measurement_limit' })
  })
})

describe('deleteMeasurement', () => {
  it('names the entry by its key', async () => {
    const fetchMock = stubFetch(respond(204))
    await deleteMeasurement(HEART_RATE, 'u1')
    const { path, init, headers } = callOf(fetchMock)
    expect(path).toBe('/api/measurements/maxHeartRate.run.2024-03-01')
    expect(init.method).toBe('DELETE')
    expect(headers.get(CLIENT_HEADER)).toBe(CLIENT_HEADER_VALUE)
  })
})
