// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { openLiftStore } from '../../worker/liftStore'
import { fakeTransport, make } from '../../worker/liftTestKit'
import { noteLiftAccount } from './lastAccount'
import { announceLiftsCleared } from './liftsCleared'
import { useLiveLiftSets } from './useLiveLiftSets'
import type { LiftSummaryAccount } from './useLiveLiftSets'

const OUT: LiftSummaryAccount = { status: 'signed-out', userId: null }
const IN: LiftSummaryAccount = { status: 'signed-in', userId: 'u1' }

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
})

// A server that never answers, so a test reads only what it put in the store; one test gives it an answer.
const silent = fakeTransport({ gate: () => new Promise<void>(() => undefined) }).transport
const setup = (account: LiftSummaryAccount, transport = silent) =>
  renderHook((props: LiftSummaryAccount) => useLiveLiftSets(props, () => transport), {
    initialProps: account,
  })
const ready = (view: ReturnType<typeof setup>) =>
  waitFor(() => expect(view.result.current).not.toBeNull())
const exercises = (view: ReturnType<typeof setup>) =>
  (view.result.current ?? []).map((set) => set.exercise)
const databases = async () => (await indexedDB.databases()).length

describe('the live lift sets', () => {
  it('are ready and empty, and make no database, when none exists', async () => {
    const view = setup(OUT)
    await ready(view)
    expect(view.result.current).toEqual([])
    expect(await databases()).toBe(0)
  })

  it('are the device’s when signed out', async () => {
    await openLiftStore('device').save(make(1, 100))
    await openLiftStore('u1').save({ ...make(1, 200), exercise: 'deadlift' })
    const view = setup(OUT)
    await ready(view)
    expect(exercises(view)).toEqual(['squat'])
  })

  it('are the account’s when signed in, and the last account’s while it is unknown', async () => {
    await openLiftStore('device').save(make(1, 100))
    await openLiftStore('u1').save({ ...make(1, 200), exercise: 'deadlift' })
    const view = setup(IN)
    await ready(view)
    expect(exercises(view)).toEqual(['deadlift'])
    noteLiftAccount('u1')
    const unknown = setup({ status: 'loading', userId: null })
    await ready(unknown)
    expect(exercises(unknown)).toEqual(['deadlift'])
  })

  it('leave out a set that is waiting to be deleted', async () => {
    const store = openLiftStore('u1')
    await store.save(make(1))
    await store.save({ ...make(1), exercise: 'deadlift' })
    const rows = await store.list()
    const squat = rows.find((row) => row.set.exercise === 'squat')
    await store.applyAck(squat?.key ?? '', squat?.rev ?? 0, 1)
    await store.remove(squat?.key ?? '')
    expect((await store.list()).map((row) => row.state)).toContain('delete')
    const view = setup(IN)
    await ready(view)
    expect(exercises(view)).toEqual(['deadlift'])
  })

  it('are read again when another tab says it wrote', async () => {
    const view = setup(OUT)
    await ready(view)
    await openLiftStore('device').save(make(1))
    const other = new BroadcastChannel('rca-sync-v1')
    other.postMessage({ type: 'lifts' })
    other.close()
    await waitFor(() => expect(view.result.current).toHaveLength(1))
  })

  it('are read again after Remove all', async () => {
    await openLiftStore('device').save(make(1))
    const view = setup(OUT)
    await waitFor(() => expect(view.result.current).toHaveLength(1))
    const store = openLiftStore('device')
    const [row] = await store.list()
    await store.remove(row?.key ?? '')
    await act(async () => announceLiftsCleared())
    await waitFor(() => expect(view.result.current).toEqual([]))
  })

  it('pull the account’s sets on opening when signed in, so a browser that never opened Lift has them', async () => {
    const fake = fakeTransport({
      pages: () => ({ items: [make(1, 100)], next: null, liftRevision: 4 }),
    })
    const view = setup(IN, fake.transport)
    await waitFor(() => expect(view.result.current).toHaveLength(1))
    expect(fake.calls.some((call) => call.type === 'page')).toBe(true)
  })

  it('send and read nothing from the server when signed out', async () => {
    const fake = fakeTransport({})
    const view = setup(OUT, fake.transport)
    await ready(view)
    expect(fake.calls).toEqual([])
  })
})
