// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Me } from '@rca/contract'
import { liftSetKey } from '@rca/core/lift'
import type { LiftSet } from '@rca/core/lift'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openLiftStore } from '../../worker/liftStore'
import { fakeTransport, make } from '../../worker/liftTestKit'
import { LiftTransportError } from '../../worker/liftTransport'
import { noteLiftAccount } from './lastAccount'
import { announceLiftsCleared } from './liftsCleared'
import { useLiftLog } from './useLiftLog'
import type { LiftLogAccount } from './useLiftLog'

const draft = (over: Partial<Omit<LiftSet, 'setOrder'>> = {}) => ({
  date: '2031-01-05',
  exercise: 'squat',
  equipment: 'barbell' as const,
  reps: 5,
  loadKg: 60,
  ...over,
})

const post = vi.hoisted(() => vi.fn())
vi.mock('../tabSync', async (original) => ({
  ...(await original<typeof import('../tabSync')>()),
  tellOtherTabs: post,
}))

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  localStorage.clear()
  post.mockReset()
})

const SIGNED_OUT: LiftLogAccount = {
  status: 'signed-out',
  userId: null,
  refresh: async () => null,
  markExpired: () => undefined,
}
const signedIn = (over: Partial<LiftLogAccount> = {}): LiftLogAccount => ({
  ...SIGNED_OUT,
  status: 'signed-in',
  userId: 'u1',
  ...over,
})

const setup = (account: LiftLogAccount, fake = fakeTransport({})) =>
  renderHook((props: LiftLogAccount) => useLiftLog(props, { transportFor: () => fake.transport }), {
    initialProps: account,
  })
const ready = async (view: ReturnType<typeof setup>) =>
  waitFor(() => expect(view.result.current.ready).toBe(true))

describe('the lift log, signed out', () => {
  it('numbers sets across the day per lift and groups them by lift', async () => {
    const view = setup(SIGNED_OUT)
    await ready(view)
    await act(async () => {
      await view.result.current.save(draft({ exercise: 'deadlift' }))
      await view.result.current.save(draft())
      await view.result.current.save(draft())
      await view.result.current.save(draft({ exercise: 'deadlift', equipment: 'smith' }))
      await view.result.current.save(draft({ date: '2031-01-06' }))
    })
    const [later, day] = view.result.current.days
    expect(later?.date).toBe('2031-01-06')
    expect(day?.lifts.map((lift) => [lift.key, lift.sets.map((s) => s.set.setOrder)])).toEqual([
      ['deadlift.barbell', [1]],
      ['deadlift.smith', [1]],
      ['squat.barbell', [1, 2]],
    ])
    expect(view.result.current.pendingCount).toBe(0)
  })

  it('orders lifts by their earliest set time, those with a time first', async () => {
    const view = setup(SIGNED_OUT)
    await ready(view)
    const at = (time: string) => ({ time, timePrecision: 'set' as const })
    await act(async () => {
      await view.result.current.save(draft({ exercise: 'a-row', ...at('10:00') }))
      await view.result.current.save(draft({ exercise: 'b-press', ...at('09:00') }))
      await view.result.current.save(draft({ exercise: 'c-curl' }))
    })
    expect(view.result.current.days[0]!.lifts.map((lift) => lift.exercise)).toEqual([
      'b-press',
      'a-row',
      'c-curl',
    ])
  })

  it('takes two saves made together one after the other, and counts a deleted set', async () => {
    const view = setup(SIGNED_OUT)
    await ready(view)
    await act(async () => {
      await Promise.all([view.result.current.save(draft()), view.result.current.save(draft())])
    })
    expect(view.result.current.days[0]?.lifts[0]?.sets.map((s) => s.set.setOrder)).toEqual([1, 2])
    // A signed-out delete removes the row; in an account the delete row still holds its order (below).
  })

  it('edits in place, and a changed lift is a remove plus a save at the next order there', async () => {
    const view = setup(SIGNED_OUT)
    await ready(view)
    let first: LiftSet | null = null
    await act(async () => {
      first = await view.result.current.save(draft())
      await view.result.current.save(draft({ exercise: 'deadlift' }))
    })
    await act(async () => {
      await view.result.current.update(first!, draft({ loadKg: 70 }))
    })
    expect(view.result.current.days[0]!.lifts[1]!.sets.map((s) => s.set.loadKg)).toEqual([70])
    await act(async () => {
      await view.result.current.update(first!, draft({ exercise: 'deadlift' }))
    })
    const [deadlift, ...rest] = view.result.current.days[0]!.lifts
    expect(rest).toEqual([])
    expect(deadlift!.sets.map((s) => s.set.setOrder)).toEqual([1, 2])
  })

  it('lists every lift by last use', async () => {
    const view = setup(SIGNED_OUT)
    await ready(view)
    await act(async () => {
      for (let n = 0; n < 14; n++)
        await view.result.current.save(
          draft({ exercise: `lift-${n}`, date: `2031-01-${String(n + 1).padStart(2, '0')}` }),
        )
    })
    const recent = view.result.current.recentLifts
    expect(recent).toHaveLength(14)
    expect(recent[0]).toMatchObject({ key: 'lift-13.barbell', equipment: 'barbell' })
    expect(recent[13]?.exercise).toBe('lift-0')
  })

  it('tells the other tabs, and sends nothing', async () => {
    const fake = fakeTransport({})
    const view = setup(SIGNED_OUT, fake)
    await ready(view)
    await act(async () => void (await view.result.current.save(draft())))
    expect(post).toHaveBeenCalledWith({ type: 'lifts' })
    expect(fake.calls).toEqual([])
  })
})

describe('the lift log, signed in', () => {
  it('shows put and synced rows, not delete rows, and counts what is unsent', async () => {
    const store = openLiftStore('u1')
    await store.save(make(1))
    await store.save(make(2))
    await store.applyAck(liftSetKey(make(1)), 1, 5)
    await store.applyAck(liftSetKey(make(2)), 1, 5)
    await store.remove(liftSetKey(make(2)))
    await store.save(make(3))
    const offline = () => {
      throw new Error('offline')
    }
    const failing = fakeTransport({ put: offline, remove: offline })
    const view = setup(signedIn(), failing)
    await ready(view)
    await waitFor(() => expect(failing.calls.length).toBeGreaterThan(0))
    const sets = view.result.current.days[0]!.lifts[0]!.sets
    expect(sets.map((s) => [s.set.setOrder, s.state])).toEqual([
      [1, 'synced'],
      [3, 'put'],
    ])
    expect(view.result.current.pendingCount).toBe(2)
    // The deleted set's order is still taken: a new set goes after it.
    await act(async () => void (await view.result.current.save(make(0))))
    expect(view.result.current.days[0]!.lifts[0]!.sets.at(-1)!.set.setOrder).toBe(4)
  })

  it('syncs after a write, and the row turns synced', async () => {
    const fake = fakeTransport({ put: () => ({ liftRevision: 1 }) })
    const view = setup(signedIn(), fake)
    await ready(view)
    await act(async () => void (await view.result.current.save(draft())))
    await waitFor(() => expect(view.result.current.pendingCount).toBe(0))
    expect(fake.calls.some((call) => call.type === 'put')).toBe(true)
  })

  it('syncs on online, and when the revision moves', async () => {
    const fake = fakeTransport({})
    const view = setup(signedIn({ liftRevision: 1 }), fake)
    const pages = () => fake.calls.filter((c) => c.type === 'page').length
    await waitFor(() => expect(pages()).toBe(1))

    // Unchanged: nothing to pull. A write waiting to go shows the trigger is a real flush.
    await openLiftStore('u1').save(make(1))
    await act(async () => void window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(fake.calls.some((c) => c.type === 'put')).toBe(true))
    expect(pages()).toBe(1)

    view.rerender(signedIn({ liftRevision: 9 }))
    await waitFor(() => expect(pages()).toBe(2))
  })

  it('on coming into view reads the account and passes its revision, at most every 30 s', async () => {
    const fake = fakeTransport({})
    const refresh = vi.fn(async () => ({ liftRevision: 7 }) as Me)
    const view = setup(signedIn({ liftRevision: 1, refresh }), fake)
    await ready(view)
    const pages = () => fake.calls.filter((c) => c.type === 'page').length
    await waitFor(() => expect(pages()).toBe(1))

    await act(async () => void document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(pages()).toBe(2))
    expect(refresh).toHaveBeenCalledOnce()

    await act(async () => void document.dispatchEvent(new Event('visibilitychange')))
    expect(refresh).toHaveBeenCalledOnce()
  })

  it('sends again after the wait a held flush names', async () => {
    const waits: number[] = []
    const real = globalThis.setTimeout
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      if (ms === 2_000) {
        waits.push(ms)
        return 0 as unknown as ReturnType<typeof setTimeout>
      }
      return real(fn, ms)
    }) as typeof setTimeout)
    let puts = 0
    const fake = fakeTransport({
      put: () => (puts++ === 0 ? new LiftTransportError('other') : { liftRevision: 1 }),
    })
    const view = setup(signedIn(), fake)
    await ready(view)
    await act(async () => void (await view.result.current.save(draft())))
    await waitFor(() => expect(waits).toEqual([2_000]))
    spy.mockRestore()
    expect(view.result.current.pendingCount).toBe(1)
  })

  it('says what the server refused and when it is full', async () => {
    let puts = 0
    const fake = fakeTransport({
      put: () =>
        puts++ === 0 ? new LiftTransportError('invalid', [0]) : new LiftTransportError('cap'),
    })
    const view = setup(signedIn(), fake)
    await ready(view)
    await act(async () => void (await view.result.current.save(draft())))
    await waitFor(() => expect(view.result.current.refused).toBe(1))
    await act(async () => void (await view.result.current.save(draft({ date: '2031-02-01' }))))
    await waitFor(() => expect(view.result.current.full).toBe(true))
  })

  it('marks the session expired when a send is refused as signed out', async () => {
    const markExpired = vi.fn()
    const fake = fakeTransport({ put: () => new LiftTransportError('unauthorized') })
    const view = setup(signedIn({ markExpired }), fake)
    await ready(view)
    await act(async () => void (await view.result.current.save(draft())))
    await waitFor(() => expect(markExpired).toHaveBeenCalled())
  })

  it('logs into the last account while the lookup is out, and sends nothing until it is confirmed', async () => {
    noteLiftAccount('u1')
    await openLiftStore('u1').save(make(1, 90))
    const fake = fakeTransport({})
    const view = setup({ ...SIGNED_OUT, status: 'unavailable' }, fake)
    await ready(view)
    expect(view.result.current.days[0]?.lifts[0]?.sets[0]?.set.loadKg).toBe(90)
    await act(async () => void (await view.result.current.save(draft({ loadKg: 95 }))))
    expect(view.result.current.days[0]?.lifts[0]?.sets).toHaveLength(2)
    expect(fake.calls).toEqual([])

    view.rerender(signedIn())
    await waitFor(() => expect(fake.calls.some((c) => c.type === 'put')).toBe(true))
  })

  it('reopens on another account and shows only its sets', async () => {
    await openLiftStore('u2').save(make(1, 80))
    const fake = fakeTransport({
      pages: () => ({ items: [make(1, 80)], next: null, liftRevision: 5 }),
    })
    const view = setup(SIGNED_OUT, fake)
    await ready(view)
    await act(async () => void (await view.result.current.save(draft())))
    expect(view.result.current.days).toHaveLength(1)

    view.rerender(signedIn({ userId: 'u2' }))
    await waitFor(() => expect(view.result.current.days[0]?.lifts[0]?.sets[0]?.set.loadKg).toBe(80))
    expect(view.result.current.days[0]!.lifts[0]!.sets).toHaveLength(1)
  })

  it('starts no retry after it closes', async () => {
    await openLiftStore('u1').save(make(1))
    const waits: number[] = []
    const real = globalThis.setTimeout
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      if (ms === 2_000) {
        waits.push(ms)
        return 0 as unknown as ReturnType<typeof setTimeout>
      }
      return real(fn, ms)
    }) as typeof setTimeout)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fake = fakeTransport({ put: () => new LiftTransportError('other'), gate: () => gate })
    const view = setup(signedIn(), fake)
    await waitFor(() => expect(fake.calls.some((c) => c.type === 'put')).toBe(true))
    view.unmount()
    release()
    await new Promise((resolve) => real(resolve, 50))
    spy.mockRestore()
    expect(waits).toEqual([])
  })

  it('lets an answer for an old scope write nothing in the new one', async () => {
    await openLiftStore('u1').save(make(1))
    await openLiftStore('u2').save(make(1, 80))
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fake = fakeTransport({
      put: () => new LiftTransportError('invalid', [0]),
      gate: () => gate,
    })
    const quiet = fakeTransport({
      pages: () => ({ items: [make(1, 80)], next: null, liftRevision: 5 }),
    })
    const view = renderHook(
      (props: LiftLogAccount) =>
        useLiftLog(props, { transportFor: (id) => (id === 'u1' ? fake : quiet).transport }),
      { initialProps: signedIn() },
    )
    await waitFor(() => expect(fake.calls.some((c) => c.type === 'put')).toBe(true))
    view.rerender(signedIn({ userId: 'u2' }))
    await waitFor(() => expect(view.result.current.days[0]?.lifts[0]?.sets[0]?.set.loadKg).toBe(80))
    release()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(view.result.current.refused).toBe(0)
    expect(view.result.current.days[0]?.lifts[0]?.sets[0]?.set.loadKg).toBe(80)
  })

  it('leaves no connection open when an answer comes after it closed', async () => {
    const factory = new IDBFactory()
    const live = new Set<IDBDatabase>()
    const open = factory.open.bind(factory)
    factory.open = ((name: string, version?: number) => {
      const request = open(name, version)
      request.addEventListener('success', () => {
        const db = request.result
        const close = db.close.bind(db)
        live.add(db)
        db.close = () => {
          live.delete(db)
          close()
        }
      })
      return request
    }) as typeof factory.open
    vi.stubGlobal('indexedDB', factory)
    const seed = openLiftStore('u1')
    await seed.save(make(1))
    seed.close()
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fake = fakeTransport({ put: () => new LiftTransportError('other'), gate: () => gate })
    const view = setup(signedIn(), fake)
    await waitFor(() => expect(fake.calls.some((c) => c.type === 'put')).toBe(true))
    view.unmount()
    release()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(live.size).toBe(0)
  })

  it('forgets what the last account refused when the scope changes', async () => {
    await openLiftStore('u1').save(make(1))
    const refusing = fakeTransport({ put: () => new LiftTransportError('invalid', [0]) })
    // The second account's sends never answer, so only the reset can clear what the first one refused.
    const quiet = fakeTransport({ gate: () => new Promise<void>(() => undefined) })
    const view = renderHook(
      (props: LiftLogAccount) =>
        useLiftLog(props, { transportFor: (id) => (id === 'u1' ? refusing : quiet).transport }),
      { initialProps: signedIn() },
    )
    await waitFor(() => expect(view.result.current.refused).toBe(1))
    view.rerender(signedIn({ userId: 'u2' }))
    await waitFor(() => expect(view.result.current.ready).toBe(true))
    expect(view.result.current.refused).toBe(0)
  })

  it('reads the remembered account again when the status changes', async () => {
    await openLiftStore('u1').save(make(1, 90))
    await openLiftStore('u2').save(make(1, 70))
    noteLiftAccount('u1')
    const view = setup({ ...SIGNED_OUT, status: 'unavailable' })
    await waitFor(() => expect(view.result.current.days[0]?.lifts[0]?.sets[0]?.set.loadKg).toBe(90))
    noteLiftAccount('u2')
    view.rerender({ ...SIGNED_OUT, status: 'loading' })
    await waitFor(() => expect(view.result.current.days[0]?.lifts[0]?.sets[0]?.set.loadKg).toBe(70))
  })
})

describe('Remove all in this tab', () => {
  it('empties the log on screen when the worker clears the store', async () => {
    const view = setup(SIGNED_OUT)
    await ready(view)
    await act(async () => void (await view.result.current.save(draft())))
    expect(view.result.current.days).toHaveLength(1)
    await act(async () => {
      const store = openLiftStore('device')
      for (const row of await store.list()) await store.remove(row.key)
      announceLiftsCleared()
    })
    await waitFor(() => expect(view.result.current.days).toHaveLength(0))
  })
})

describe('the lift log, paths a session meets less often', () => {
  it('removes a set by its key', async () => {
    const view = setup(SIGNED_OUT)
    await ready(view)
    await act(async () => void (await view.result.current.save(draft())))
    const key = view.result.current.days[0]!.lifts[0]!.sets[0]!.key
    await act(async () => view.result.current.remove(key))
    expect(view.result.current.days).toEqual([])
  })

  it('reads the store again when another tab says it wrote', async () => {
    const view = setup(SIGNED_OUT)
    await ready(view)
    await openLiftStore('device').save(make(1))
    const other = new BroadcastChannel('rca-sync-v1')
    other.postMessage({ type: 'lifts' })
    other.close()
    await waitFor(() => expect(view.result.current.days).toHaveLength(1))
  })

  it('sends again when the wait a held flush names runs out', async () => {
    let fire: (() => void) | undefined
    const real = globalThis.setTimeout
    const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms?: number,
    ) => {
      if (ms === 2_000) {
        fire = fn
        return 0 as unknown as ReturnType<typeof setTimeout>
      }
      return real(fn, ms)
    }) as typeof setTimeout)
    let puts = 0
    const fake = fakeTransport({
      put: () => (puts++ === 0 ? new LiftTransportError('other') : { liftRevision: 1 }),
    })
    const view = setup(signedIn(), fake)
    await ready(view)
    await act(async () => void (await view.result.current.save(draft())))
    await waitFor(() => expect(fire).toBeDefined())
    spy.mockRestore()
    expect(puts).toBe(1)
    await act(async () => fire!())
    await waitFor(() => expect(puts).toBe(2))
  })
})
