import { afterEach, describe, expect, it, vi } from 'vitest'
import { snapshotContentHash } from '@rca/core/stateSnapshot'
import { snapshotAt } from '../test/stateCopyKit'
import { getServerSnapshot } from './state'

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
