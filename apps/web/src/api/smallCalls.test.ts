import { afterEach, describe, expect, it, vi } from 'vitest'
import { patchLabels } from './client'
import { renameActivity } from './renameClient'
import { putAccountSettings } from './settings'

function stub(body: unknown) {
  const fetchMock = vi.fn(async (_path: string, _init?: RequestInit) => {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('the small account calls', () => {
  it('sends labels as a PATCH and reads the counts back', async () => {
    const fetchMock = stub({ applied: 1, skipped: 0, refused: 0, missed: [] })
    const change = { id: 'a1', revision: 2, from: null, athleteType: null }
    expect(await patchLabels([change])).toEqual({ applied: 1, skipped: 0, refused: 0, missed: [] })
    const [path, init] = fetchMock.mock.calls[0]!
    expect(path).toBe('/api/activities/labels')
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ labels: [change] })
  })

  it('renames one activity by its id and reads the name as the server holds it', async () => {
    const fetchMock = stub({ name: 'Long run' })
    expect(await renameActivity('a/1', ' Long run ')).toEqual({ name: 'Long run' })
    const [path, init] = fetchMock.mock.calls[0]!
    expect(path).toBe('/api/activities/a%2F1/name')
    expect(init?.method).toBe('PATCH')
  })

  it('puts the settings whole and reads the document back', async () => {
    const settings = { keepPower: ['ride-a'], countedRuns: null, period: 182 }
    const fetchMock = stub(settings)
    expect(await putAccountSettings(settings)).toEqual(settings)
    const [path, init] = fetchMock.mock.calls[0]!
    expect(path).toBe('/api/settings')
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(String(init?.body))).toEqual(settings)
  })
})
