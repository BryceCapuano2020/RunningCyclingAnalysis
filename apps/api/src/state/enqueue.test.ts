import { describe, expect, it } from 'vitest'
import { createHarness, digestFixture } from '../test/harness.ts'
import { keyOf, liftSet } from '../test/lifts.ts'
import { failingDb, stateWorld, type StateWorld } from '../test/stateKit.ts'
import { clearPending } from './pending.ts'
import { sha256Hex } from '../util.ts'

const FILE_HASH = 'b'.repeat(64)
const ORIGINAL = new TextEncoder().encode('ride original')

function create(w: StateWorld, startMs: number) {
  return w.h.send({
    method: 'POST',
    path: '/api/activities',
    json: { digest: digestFixture({ startMs }), fileName: 'ride.fit', fileHash: FILE_HASH },
    cookies: w.cookies,
  })
}

const WRITES: [string, (w: StateWorld) => Promise<Response>][] = [
  ['an activity create', (w) => create(w, 1_700_000_000_000)],
  [
    'a profile change',
    (w) =>
      w.h.send({
        method: 'PUT',
        path: '/api/profile',
        json: { massKg: 70, bikeMassKg: 9, units: 'metric', keepFiles: false },
        cookies: w.cookies,
      }),
  ],
  [
    'a dated setting',
    (w) =>
      w.h.send({
        method: 'PUT',
        path: '/api/measurements',
        json: { kind: 'massKg', value: 70, from: '2026-01-01' },
        cookies: w.cookies,
      }),
  ],
  [
    'an account settings change',
    (w) =>
      w.h.send({
        method: 'PUT',
        path: '/api/settings',
        json: { keepPower: ['a'], countedRuns: null, period: null },
        cookies: w.cookies,
      }),
  ],
  [
    'a lift write',
    (w) =>
      w.h.send({
        method: 'PUT',
        path: '/api/lifts',
        json: { sets: [liftSet()] },
        cookies: w.cookies,
      }),
  ],
  [
    'a lift delete',
    (w) =>
      w.h.send({
        method: 'POST',
        path: '/api/lifts/delete',
        json: { keys: [keyOf(liftSet())] },
        cookies: w.cookies,
      }),
  ],
]

/** The job has picked up the message the last write sent, so the next write sends its own. */
async function arrived(w: StateWorld) {
  await clearPending(w.env.DB, w.userId)
  w.sent.length = 0
}

describe('the state job producer', () => {
  it('sends one message for a burst of writes while it is on its way, and the next once the job has it', async () => {
    const w = await stateWorld()
    for (let i = 0; i < 5; i += 1)
      expect((await create(w, 1_700_000_000_000 + i * 60_000)).status).toBe(201)
    expect(w.sent).toHaveLength(1)
    await arrived(w)
    expect((await create(w, 1_700_000_900_000)).status).toBe(201)
    expect(w.sent).toHaveLength(1)
  })

  it('sends again once a marker has outlived its message, which the Queue may have lost', async () => {
    const w = await stateWorld()
    await create(w, 1_700_000_000_000)
    w.h.clock.now += (10 + 120) * 1000 - 1
    await create(w, 1_700_000_060_000)
    expect(w.sent).toHaveLength(1)
    w.h.clock.now += 1
    await create(w, 1_700_000_120_000)
    expect(w.sent).toHaveLength(2)
  })

  it('sends when the marker cannot be read, so a D1 error costs a duplicate message, never a write', async () => {
    const w = await stateWorld()
    const db = w.env.DB
    w.env.DB = failingDb(db, /pending_until/)
    try {
      await create(w, 1_700_000_000_000)
      await create(w, 1_700_000_060_000)
    } finally {
      w.env.DB = db
    }
    expect(w.sent).toHaveLength(2)
  })

  it.each(WRITES)('%s sends the account to the queue, delayed', async (_name, write) => {
    const w = await stateWorld()
    expect((await write(w)).status).toBeLessThan(300)
    expect(w.sent).toEqual([{ body: { userId: w.userId }, options: { delaySeconds: 10 } }])
  })

  it('sends one for an activity delete, and none for a delete that finds nothing', async () => {
    const w = await stateWorld()
    const id = ((await (await create(w, 1_700_000_000_000)).json()) as { id: string }).id
    await arrived(w)
    expect(
      (await w.h.send({ method: 'DELETE', path: '/api/activities/nope', cookies: w.cookies }))
        .status,
    ).toBe(404)
    expect(w.sent).toEqual([])
    expect(
      (await w.h.send({ method: 'DELETE', path: `/api/activities/${id}`, cookies: w.cookies }))
        .status,
    ).toBe(204)
    expect(w.sent).toHaveLength(1)
  })

  it('sends nothing for an original file upload, which changes no input of the results', async () => {
    const w = await stateWorld()
    const profile = { massKg: 70, bikeMassKg: 9, units: 'metric', keepFiles: true }
    await w.h.send({ method: 'PUT', path: '/api/profile', json: profile, cookies: w.cookies })
    const hash = await sha256Hex(ORIGINAL)
    const made = await w.h.send({
      method: 'POST',
      path: '/api/activities',
      json: {
        digest: digestFixture({ startMs: 1_700_000_000_000 }),
        fileName: 'r.fit',
        fileHash: hash,
      },
      cookies: w.cookies,
    })
    const { id } = (await made.json()) as { id: string }
    w.sent.length = 0
    const up = await w.h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: ORIGINAL,
      cookies: w.cookies,
    })
    expect(up.status).toBe(200)
    expect(w.sent).toEqual([])
  })

  it('sends nothing for a read, a refused write or a signed-out request', async () => {
    const w = await stateWorld()
    await w.h.send({ path: '/api/activities', cookies: w.cookies })
    await w.h.send({ path: '/api/settings', cookies: w.cookies })
    expect(
      (
        await w.h.send({
          method: 'PUT',
          path: '/api/settings',
          json: { nope: 1 },
          cookies: w.cookies,
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await w.h.send({
          method: 'PUT',
          path: '/api/settings',
          json: { keepPower: null, countedRuns: null, period: null },
        })
      ).status,
    ).toBe(401)
    expect(w.sent).toEqual([])
  })

  it('does not fail a write when the queue refuses it', async () => {
    const w = await stateWorld()
    const failing = {
      send: async () => {
        throw new Error('queue down')
      },
    } as unknown as Queue<{ userId: string }>
    const h = createHarness({}, { STATE_QUEUE: failing })
    const token = await h.signIn('other@example.com')
    const res = await h.send({
      method: 'PUT',
      path: '/api/settings',
      json: { keepPower: null, countedRuns: null, period: null },
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
    expect(w.sent).toEqual([])
  })
})
