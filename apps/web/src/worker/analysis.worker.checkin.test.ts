import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { encodeFit } from '@rca/core/fit'
import { sampleDataset } from '@rca/core/synthetic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeviceLibrary } from './deviceLibrary'
import type { CheckInView, WorkerRequest, WorkerResponse } from './protocol'

/** "Since your last import" in the worker: the snapshot taken before an import, the baseline it moves, and what the page is told. */

const kept = vi.hoisted(() => ({ library: null as DeviceLibrary | null }))
vi.mock('./deviceLibrary', async () => {
  const { memoryDeviceLibrary } = await import('../test/deviceLibrary.fake')
  return {
    openDeviceLibrary: () => {
      kept.library ??= memoryDeviceLibrary()
      return kept.library
    },
  }
})

const SETTINGS = { massKg: 75, bikeMassKg: 9 }
const [one, two, three] = sampleDataset().activities
if (one === undefined || two === undefined || three === undefined) {
  throw new Error('The sample has too few activities')
}
const fit = (activity = one, name = 'a.fit') =>
  new File([new Uint8Array(encodeFit(activity, { gps: true }))], name)
const HOUR = 3_600_000
const real = Date.now()

async function startWorker() {
  const posted: WorkerResponse[] = []
  const fakeSelf = {
    postMessage: (message: WorkerResponse) => posted.push(message),
    onmessage: null as ((event: MessageEvent<WorkerRequest>) => void) | null,
  }
  vi.stubGlobal('self', fakeSelf)
  await import('./analysis.worker')
  async function send(request: WorkerRequest): Promise<WorkerResponse[]> {
    const start = posted.length
    fakeSelf.onmessage?.({ data: request } as MessageEvent<WorkerRequest>)
    await vi.waitFor(() => {
      const last = posted.at(-1)
      const done = last?.type === 'state' || last?.type === 'error' || last?.type === 'checkInSaved'
      if (posted.length === start || !done) throw new Error('still working')
    }, 10_000)
    return posted.slice(start)
  }
  return { send }
}

const device = (files: File[]): WorkerRequest => ({
  type: 'addFiles',
  files,
  settings: SETTINGS,
  sync: null,
  saveToDevice: true,
})

/** The check-in view that went with the state ending a request: none posted is none to show. */
const viewOf = (messages: WorkerResponse[]): CheckInView => {
  const last = messages.at(-1)
  if (last?.type !== 'state' && last?.type !== 'rebuildComplete')
    throw new Error('no state was posted')
  return last.checkIn ?? { checkIn: null, seen: false }
}

/** Moves the worker's clock on, as a visit hours later. */
const later = (hours: number) => vi.spyOn(Date, 'now').mockReturnValue(real + hours * HOUR)

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  vi.restoreAllMocks()
  kept.library = null
})

describe('the check-in the worker posts', () => {
  it('has nothing at a first import, and says what an import added at the next', async () => {
    const { send } = await startWorker()
    const first = await send(device([fit(one)]))
    expect(viewOf(first)).toEqual({ checkIn: null, seen: false })
    later(7)
    const second = await send(device([fit(two, 'b.fit')]))
    const view = viewOf(second)
    expect(view.seen).toBe(false)
    expect((view.checkIn?.added.run ?? 0) + (view.checkIn?.added.ride ?? 0)).toBe(1)
    expect(view.checkIn?.sinceMs).toBeGreaterThanOrEqual(real)
  })

  it('keeps a first import made in several drops a first import', async () => {
    const { send } = await startWorker()
    await send(device([fit(one)]))
    later(2)
    const second = await send(device([fit(two, 'b.fit')]))
    expect(viewOf(second).checkIn).toBeNull()
  })

  it('has none for the sample, or for files kept nowhere, and writes no database for them', async () => {
    const { send } = await startWorker()
    const sample = await send({ type: 'loadSample', settings: SETTINGS })
    expect(viewOf(sample)).toEqual({ checkIn: null, seen: false })
    await send({ type: 'addFiles', files: [fit(one)], settings: SETTINGS, sync: null })
    later(8)
    const again = await send({
      type: 'addFiles',
      files: [fit(two, 'b.fit')],
      settings: SETTINGS,
      sync: null,
    })
    expect(viewOf(again).checkIn).toBeNull()
    expect((await indexedDB.databases()).some((d) => d.name === 'rca-checkin')).toBe(false)
  })

  it('is remembered across a reload of the page and read again on the device load', async () => {
    const first = await startWorker()
    await first.send(device([fit(one)]))
    later(7)
    await first.send(device([fit(two, 'b.fit')]))
    vi.resetModules()
    const reloaded = await startWorker()
    const loaded = await reloaded.send({ type: 'loadDevice', settings: SETTINGS })
    expect(viewOf(loaded).checkIn).not.toBeNull()
  })

  it('is gone after everything is removed, and the next import is a first one', async () => {
    const { send } = await startWorker()
    await send(device([fit(one)]))
    later(7)
    await send(device([fit(two, 'b.fit')]))
    await send({ type: 'clear', forgetDevice: true } as WorkerRequest)
    later(15)
    const again = await send(device([fit(three, 'c.fit')]))
    expect(viewOf(again).checkIn).toBeNull()
  })

  it('counts a row seen after it was opened, and tells the page', async () => {
    const { send } = await startWorker()
    await send(device([fit(one)]))
    later(7)
    await send(device([fit(two, 'b.fit')]))
    const reply = await send({ type: 'markSeen', row: 'checkIn', event: 'open' })
    expect(reply.at(-1)).toEqual({ type: 'checkInSaved', seen: true })
    const loaded = await send({ type: 'loadDevice', settings: SETTINGS, reload: true })
    expect(viewOf(loaded).seen).toBe(true)
  })

  it('moves the baseline for an import with a damaged zip only when it is accepted', async () => {
    const { send } = await startWorker()
    await send(device([fit(one)]))
    later(7)
    const broken = new File([new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8])], 'broken.zip')
    const partial = await send(device([fit(two, 'b.fit'), broken]))
    expect(viewOf(partial).checkIn).toBeNull()
    const accepted = await send({ type: 'acceptPartialImport' })
    expect(accepted.at(-1)).toMatchObject({ type: 'checkInSaved' })
    const loaded = await send({ type: 'loadDevice', settings: SETTINGS, reload: true })
    expect(viewOf(loaded).checkIn).not.toBeNull()
  })
})
