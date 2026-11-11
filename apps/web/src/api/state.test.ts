import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapshotContentHash } from '@rca/core/stateSnapshot'
import { snapshotAt } from '../test/stateCopyKit'
import { readServerState } from './state'

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
    const fetchMock = stub(
      new Response(null, {
        status: 304,
        headers: { 'X-State-Now': '7000', 'X-State-Computed-Version': '9' },
      }),
    )
    expect(await readServerState('u1', held)).toEqual({
      kind: 'unchanged',
      nowMs: 7_000,
      version: 9,
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
