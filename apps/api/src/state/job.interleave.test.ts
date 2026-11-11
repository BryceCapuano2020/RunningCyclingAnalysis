import { gunzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { afterNewest, libraryDigests, seedDigests, stateWorld } from '../test/stateKit.ts'
import { computeAndStore } from './refresh.ts'
import { jobRow } from './row.ts'

/*
 * Many accounts share one isolate and, if the queue's concurrency is raised, run their jobs at once, each awaiting D1 and
 * R2 between steps. (The isolate's compute lock now keeps them one at a time, so this runs the compute past it: the
 * compute itself must stay a pure function of its inputs.) An account's snapshot must be the one it gets alone. This runs two accounts whose zone, mass, birth
 * year, kept power and period all differ, their jobs interleaved, and compares each stored snapshot with the same account
 * computed in a world of its own.
 */

const digests = libraryDigests()

interface Choices {
  email: string
  zone: string
  period: number | null
  keepPower: string[]
  profile: Record<string, unknown>
}

const EAST: Choices = {
  email: 'east@example.com',
  zone: 'Pacific/Auckland',
  period: 14,
  keepPower: [],
  profile: {
    massKg: 58,
    bikeMassKg: 7,
    units: 'metric',
    keepFiles: false,
    birthYear: 1990,
    sex: 'female',
  },
}
const WEST: Choices = {
  email: 'west@example.com',
  zone: 'Pacific/Honolulu',
  period: null,
  keepPower: [digests.find((d) => d.sport === 'ride')!.id],
  profile: {
    massKg: 92,
    bikeMassKg: 12,
    units: 'metric',
    keepFiles: false,
    birthYear: 1972,
    sex: 'male',
  },
}

let worlds = 0
type World = Awaited<ReturnType<typeof stateWorld>>

/** One more account in the world, with its inputs and the same library. */
async function addAccount(w: World, choices: Choices): Promise<string> {
  const cookies = { rca_session: await w.h.signIn(`${++worlds}-${choices.email}`) }
  const me = (await (await w.h.send({ path: '/api/me', cookies })).json()) as {
    user: { id: string }
  }
  const { zone, period, keepPower } = choices
  const settings = { keepPower, countedRuns: null, period, zone }
  expect(
    (await w.h.send({ method: 'PUT', path: '/api/settings', json: settings, cookies })).status,
  ).toBe(200)
  expect(
    (await w.h.send({ method: 'PUT', path: '/api/profile', json: choices.profile, cookies }))
      .status,
  ).toBe(200)
  await seedDigests(w.env.DB, me.user.id, digests)
  return me.user.id
}

async function snapshotOf(w: World, userId: string): Promise<unknown> {
  const row = await w.env.DB.prepare('SELECT snapshot_hash FROM state_jobs WHERE user_id = ?')
    .bind(userId)
    .first<{ snapshot_hash: string }>()
  const object = await w.env.FILES!.get(`users/${userId}/state/${row!.snapshot_hash}.json.gz`)
  return JSON.parse(gunzipSync(Buffer.from(await object!.arrayBuffer())).toString())
}

/** The account's snapshot from a world where it is the only account. */
async function alone(choices: Choices): Promise<unknown> {
  const w = await stateWorld({ email: `${++worlds}-owner@example.com` })
  const id = await addAccount(w, choices)
  w.h.clock.now = afterNewest(digests)
  // Core's memos are fresh for each baseline: a copy of every module no other account has touched.
  vi.resetModules()
  const fresh = await import('./job.ts')
  expect(await fresh.runStateJob(w.env, w.deps, id)).toBe('written')
  return snapshotOf(w, id)
}

describe('two state jobs at once', () => {
  it('give each account the snapshot it gets alone', async () => {
    const [eastAlone, westAlone] = [await alone(EAST), await alone(WEST)]
    expect(JSON.stringify(eastAlone)).not.toBe(JSON.stringify(westAlone))

    const w = await stateWorld({ email: `${++worlds}-owner@example.com` })
    const east = await addAccount(w, EAST)
    const west = await addAccount(w, WEST)
    w.h.clock.now = afterNewest(digests)
    const compute = async (id: string) =>
      (await computeAndStore(w.env, w.deps, id, (await jobRow(w.env.DB, id))!, true)).kind
    expect(await Promise.all([compute(east), compute(west)])).toEqual(['written', 'written'])
    expect(await snapshotOf(w, east)).toStrictEqual(eastAlone)
    expect(await snapshotOf(w, west)).toStrictEqual(westAlone)
  })
})
