// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { AthleteSettings } from '@rca/core/athlete'
import { beforeEach, describe, expect, it } from 'vitest'
import { openLiftStore } from '../../worker/liftStore'
import { make } from '../../worker/liftTestKit'
import { noteLiftAccount } from './lastAccount'
import { announceLiftsCleared } from './liftsCleared'
import { useLiftSummary } from './useLiftSummary'
import type { LiftSummaryAccount } from './useLiftSummary'

const SETTINGS: AthleteSettings = { massKg: 80, bikeMassKg: 9 }
const OUT: LiftSummaryAccount = { status: 'signed-out', userId: null }
const IN: LiftSummaryAccount = { status: 'signed-in', userId: 'u1' }

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  localStorage.clear()
})

const setup = (account: LiftSummaryAccount) =>
  renderHook((props: LiftSummaryAccount) => useLiftSummary(props, SETTINGS), {
    initialProps: account,
  })
const ready = (view: ReturnType<typeof setup>) =>
  waitFor(() => expect(view.result.current.ready).toBe(true))
const databases = async () => (await indexedDB.databases()).length

describe('the lift summary', () => {
  it('is ready and empty, and makes no database, when none exists', async () => {
    const view = setup(OUT)
    await ready(view)
    expect(view.result.current.lifts).toEqual([])
    expect(await databases()).toBe(0)
  })

  it('reads the device sets when signed out', async () => {
    await openLiftStore('device').save(make(1, 100))
    await openLiftStore('u1').save({ ...make(1, 200), exercise: 'deadlift' })
    const view = setup(OUT)
    await ready(view)
    const [squat, ...rest] = view.result.current.lifts
    expect(rest).toEqual([])
    expect(squat).toMatchObject({ exercise: 'squat', equipment: 'barbell' })
    const { point, low, high } = squat?.estimate ?? { point: 0, low: 0, high: 0 }
    expect(point).toBeGreaterThan(100)
    expect(low).toBeLessThanOrEqual(point)
    expect(high).toBeGreaterThanOrEqual(point)
  })

  it('reads the account sets when signed in, and the last account while unknown', async () => {
    await openLiftStore('device').save(make(1, 100))
    await openLiftStore('u1').save({ ...make(1, 200), exercise: 'deadlift' })
    const view = setup(IN)
    await ready(view)
    expect(view.result.current.lifts.map((lift) => lift.exercise)).toEqual(['deadlift'])
    noteLiftAccount('u1')
    const unknown = setup({ status: 'loading', userId: null })
    await ready(unknown)
    expect(unknown.result.current.lifts.map((lift) => lift.exercise)).toEqual(['deadlift'])
  })

  it('leaves out a set that is waiting to be deleted', async () => {
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
    expect(view.result.current.lifts.map((lift) => lift.exercise)).toEqual(['deadlift'])
  })

  it('reads again when another tab says it wrote', async () => {
    const view = setup(OUT)
    await ready(view)
    await openLiftStore('device').save(make(1))
    const other = new BroadcastChannel('rca-sync-v1')
    other.postMessage({ type: 'lifts' })
    other.close()
    await waitFor(() => expect(view.result.current.lifts).toHaveLength(1))
  })

  it('reads again after Remove all', async () => {
    await openLiftStore('device').save(make(1))
    const view = setup(OUT)
    await waitFor(() => expect(view.result.current.lifts).toHaveLength(1))
    const store = openLiftStore('device')
    const [row] = await store.list()
    await store.remove(row?.key ?? '')
    await act(async () => announceLiftsCleared())
    await waitFor(() => expect(view.result.current.lifts).toEqual([]))
  })
})
