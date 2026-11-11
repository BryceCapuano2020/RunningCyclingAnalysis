import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapshotContentHash } from '@rca/core/stateSnapshot'
import { snapshotAt } from '../test/stateCopyKit'
import { getServerSnapshot, readServerState } from './state'

function stub(response: Response | Error) {
  const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => {
    if (response instanceof Error) throw response
    return response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

afterEach(() => vi.unstubAllGlobals())

describe('getServerSnapshot', () => {
  it('reads the account’s snapshot from GET /api/state, scoped to the account', async () => {
    const snapshot = snapshotAt(1_000, 'UTC')
    const fetchMock = stub(json(200, snapshot))
    expect(await getServerSnapshot('u1')).toEqual(snapshot)
    const [path, init] = fetchMock.mock.calls[0]!
    expect(path).toBe('/api/state')
    expect(init?.method).toBe('GET')
    expect(new Headers(init?.headers).get('x-rca-user')).toBe('u1')
  })

  it('refuses a snapshot of this build whose check-in is not one, and leaves one of another shape alone', async () => {
    const snapshot = snapshotAt(1_000, 'UTC')
    stub(json(200, { ...snapshot, checkIn: { v: 1, counts: 'many' } }))
    await expect(getServerSnapshot('u1')).rejects.toThrow()
    const newer = { ...snapshot, schemaVersion: snapshot.schemaVersion + 1, checkIn: 'new shape' }
    stub(json(200, newer))
    expect(await getServerSnapshot('u1')).toEqual(newer)
  })

  it('sends the tag of the copy it holds, and answers null for a 304 (no-store means the browser sends none itself)', async () => {
    const held = snapshotAt(1_000, 'UTC')
    const fetchMock = stub(new Response(null, { status: 304 }))
    expect(await getServerSnapshot('u1', held)).toBeNull()
    const init = fetchMock.mock.calls[0]![1]
    expect(new Headers(init?.headers).get('if-none-match')).toBe(
      `"${await snapshotContentHash(held)}"`,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // With no copy there is no condition.
    const bare = stub(json(200, held))
    await getServerSnapshot('u1')
    expect(new Headers(bare.mock.calls[0]![1]?.headers).has('if-none-match')).toBe(false)
  })

  it('answers null for a 404, which is how the server says it is off for the account', async () => {
    const fetchMock = stub(json(404, { error: { code: 'not_found', message: 'Not found' } }))
    expect(await getServerSnapshot('u1')).toBeNull()
    // A 404 is final: no second try.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws for any other failure, and for a body that is not a snapshot', async () => {
    stub(json(500, { error: { code: 'boom', message: 'Boom' } }))
    await expect(getServerSnapshot('u1')).rejects.toMatchObject({ status: 500 })
    stub(json(200, { schemaVersion: 1 }))
    await expect(getServerSnapshot('u1')).rejects.toMatchObject({ code: 'invalid_response' })
    stub(json(200, null))
    await expect(getServerSnapshot('u1')).rejects.toMatchObject({ code: 'invalid_response' })
    stub(new Error('offline'))
    await expect(getServerSnapshot('u1')).rejects.toMatchObject({ code: 'network_error' })
  })
})

describe('readServerState', () => {
  it('reads a snapshot with the instant it was computed for and whether it is current', async () => {
    const snapshot = snapshotAt(1_000, 'UTC')
    stub(
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { 'content-type': 'application/json', 'X-State-Now': '5000' },
      }),
    )
    expect(await readServerState('u1')).toEqual({
      kind: 'snapshot',
      snapshot,
      nowMs: 5_000,
      current: true,
    })
  })

  it('answers a 304 with its X-State-Now, and sends the tag of the copy held', async () => {
    const held = snapshotAt(1_000, 'UTC')
    const fetchMock = stub(new Response(null, { status: 304, headers: { 'X-State-Now': '7000' } }))
    expect(await readServerState('u1', held)).toEqual({
      kind: 'unchanged',
      nowMs: 7_000,
      current: true,
    })
    expect(new Headers(fetchMock.mock.calls[0]![1]?.headers).get('if-none-match')).toBe(
      `"${await snapshotContentHash(held)}"`,
    )
  })

  it('reads X-State-Current: 0 as a stored snapshot served while the server computes', async () => {
    const snapshot = snapshotAt(1_000, 'UTC')
    stub(
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { 'content-type': 'application/json', 'X-State-Current': '0' },
      }),
    )
    expect(await readServerState('u1')).toMatchObject({
      kind: 'snapshot',
      nowMs: null,
      current: false,
    })
  })

  it('answers a 202 with the wait the server asks for, and a default without one', async () => {
    stub(json(202, { state: 'computing' }))
    expect(await readServerState('u1')).toEqual({ kind: 'computing', retryAfterMs: 2_000 })
    stub(
      new Response(JSON.stringify({ state: 'computing' }), {
        status: 202,
        headers: { 'Retry-After': '5' },
      }),
    )
    expect(await readServerState('u1')).toEqual({ kind: 'computing', retryAfterMs: 5_000 })
  })

  it('answers a 404 as none and throws any other failure', async () => {
    stub(json(404, { error: { code: 'not_found', message: 'Not found' } }))
    expect(await readServerState('u1')).toEqual({ kind: 'none' })
    stub(json(500, { error: { code: 'server', message: 'Broken' } }))
    await expect(readServerState('u1')).rejects.toThrow()
  })
})
