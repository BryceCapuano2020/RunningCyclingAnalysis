import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiftSet } from '@rca/core/lift'
import { LiftTransportError } from '../worker/liftTransport'
import { createLiftTransport } from './lifts'

const SET: LiftSet = {
  date: '2026-01-05',
  exercise: 'squat',
  equipment: 'barbell',
  setOrder: 1,
  reps: 5,
  loadKg: 100,
}

function reply(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function failure(code: string, refused?: number[]) {
  return { error: { code, message: 'No', ...(refused === undefined ? {} : { refused }) } }
}

function stub(...answers: (Response | Error)[]) {
  const fetchMock = vi.fn(async () => {
    const answer = answers.shift()
    if (answer instanceof Error) throw answer
    if (answer === undefined) throw new Error('No answer left')
    return answer
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

async function caught(promise: Promise<unknown>): Promise<LiftTransportError> {
  const error: unknown = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(LiftTransportError)
  return error as LiftTransportError
}

describe('createLiftTransport', () => {
  it('puts sets and reads the revision and skipped keys', async () => {
    const fetchMock = stub(reply(200, { liftRevision: 4, skipped: ['k1'] }))
    const answer = await createLiftTransport('u1').put([SET], { insertOnly: true })
    expect(answer).toEqual({ liftRevision: 4, skipped: ['k1'] })
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/lifts')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ sets: [SET], insertOnly: true })
    expect(new Headers(init.headers).get('X-RCA-User')).toBe('u1')
  })

  it('leaves insertOnly out of an ordinary put', async () => {
    const fetchMock = stub(reply(200, { liftRevision: 1, skipped: [] }))
    await createLiftTransport().put([SET])
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ sets: [SET] })
  })

  it('removes keys over POST', async () => {
    const fetchMock = stub(reply(200, { liftRevision: 9 }))
    expect(await createLiftTransport().remove(['a', 'b'])).toEqual({ liftRevision: 9 })
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/lifts/delete')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ keys: ['a', 'b'] })
  })

  it('reads the first page with no cursor and the next with an encoded one', async () => {
    const fetchMock = stub(
      reply(200, { items: [SET], next: 'c/1', liftRevision: 2 }),
      reply(200, { items: [], next: null, liftRevision: 2 }),
    )
    const transport = createLiftTransport()
    expect(await transport.page(null)).toEqual({ items: [SET], next: 'c/1', liftRevision: 2 })
    await transport.page('c/1')
    expect((fetchMock.mock.calls as unknown as [string][]).map(([path]) => path)).toEqual([
      '/api/lifts',
      '/api/lifts?cursor=c%2F1',
    ])
  })

  it('treats an answer that breaks the contract as a failure that will not clear at once', async () => {
    stub(reply(200, { items: [{ ...SET, reps: 0 }], next: null, liftRevision: 2 }))
    const error = await caught(createLiftTransport().page(null))
    expect(error).toMatchObject({ kind: 'other', transient: false })
  })

  it('also treats an oversize page as a contract break, not transient', async () => {
    stub(reply(200, { items: [], next: null, liftRevision: 1 }, { 'content-length': '999999' }))
    expect(await caught(createLiftTransport().page(null))).toMatchObject({
      kind: 'other',
      transient: false,
    })
  })

  it('sends a cursor with + and = encoded', async () => {
    const fetchMock = stub(reply(200, { items: [], next: null, liftRevision: 1 }))
    await createLiftTransport().page('a+b=c')
    expect((fetchMock.mock.calls as unknown as [string][])[0]?.[0]).toBe(
      '/api/lifts?cursor=a%2Bb%3Dc',
    )
  })

  it('maps a 400 to invalid with the refused positions', async () => {
    stub(reply(400, failure('invalid_request', [0, 3])))
    const error = await caught(createLiftTransport().put([SET]))
    expect(error).toMatchObject({ kind: 'invalid', refused: [0, 3] })
  })

  it('maps a 400 that names none to invalid with an empty list', async () => {
    stub(reply(400, failure('invalid_request')))
    expect(await caught(createLiftTransport().remove(['a']))).toMatchObject({
      kind: 'invalid',
      refused: [],
    })
  })

  it('maps a 401 to unauthorized', async () => {
    stub(reply(401, failure('unauthorized')))
    expect(await caught(createLiftTransport().put([SET]))).toMatchObject({ kind: 'unauthorized' })
  })

  it('maps a 409 lift_limit to cap', async () => {
    stub(reply(409, failure('lift_limit')))
    expect(await caught(createLiftTransport().put([SET]))).toMatchObject({ kind: 'cap' })
  })

  it('maps another 409 to other, not transient', async () => {
    stub(reply(409, failure('conflict')))
    expect(await caught(createLiftTransport().put([SET]))).toMatchObject({
      kind: 'other',
      transient: false,
    })
  })

  it.each([429, 500, 503])('maps a %i to other, transient', async (status) => {
    stub(reply(status, failure('busy'), { 'retry-after': '1' }))
    expect(await caught(createLiftTransport().put([SET]))).toMatchObject({
      kind: 'other',
      transient: true,
    })
  })

  it('maps a network failure to other, transient', async () => {
    stub(new TypeError('offline'))
    expect(await caught(createLiftTransport().put([SET]))).toMatchObject({
      kind: 'other',
      transient: true,
    })
  })

  it.each([403, 404, 413])('maps a %i to other, not transient', async (status) => {
    stub(reply(status, failure('no')))
    expect(await caught(createLiftTransport().put([SET]))).toMatchObject({
      kind: 'other',
      transient: false,
    })
  })
})
