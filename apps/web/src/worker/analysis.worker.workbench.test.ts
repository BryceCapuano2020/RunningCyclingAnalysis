import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { encodeFit } from '@rca/core/fit'
import { encodeGpx } from '@rca/core/gpx/encode'
import { encodeTcx } from '@rca/core/tcx/encode'
import { parseActivityFile } from '@rca/core/import'
import { sampleDataset } from '@rca/core/synthetic'
import type { ActivityTrace } from '@rca/core/workbench'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { workoutKeyOf } from './device'
import type { DeviceLibrary } from './deviceLibrary'
import type { WorkerRequest, WorkerResponse } from './protocol'
import type { PutResult, TraceScope, WorkbenchStore } from './workbenchStore'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return {
    ...actual,
    createActivity: vi.fn(),
    downloadActivityFile: vi.fn(),
    listActivities: vi.fn(),
    deleteActivity: vi.fn(),
    uploadFile: vi.fn(),
  }
})

const kept = vi.hoisted(() => ({
  library: null as DeviceLibrary | null,
  store: null as WorkbenchStore | null,
}))

vi.mock('./deviceLibrary', async () => {
  const { memoryDeviceLibrary } = await import('../test/deviceLibrary.fake')
  return {
    openDeviceLibrary: () => {
      kept.library ??= memoryDeviceLibrary()
      return kept.library
    },
  }
})

vi.mock('./workbenchStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workbenchStore')>()
  return { ...actual, openWorkbenchStore: () => kept.store }
})

const SETTINGS = { massKg: 75, bikeMassKg: 9 }
const USER_ID = 'u1'
const run = sampleDataset().activities[0]!
const mocked = vi.mocked(client)

function fitFile(name = 'run.fit'): File {
  return new File([new Uint8Array(encodeFit(run, { gps: true }))], name)
}

function tcxFile(name = 'run.tcx'): File {
  return new File([new Uint8Array(encodeTcx(run))], name)
}

function gpxFile(name = 'run.gpx'): File {
  return new File([new Uint8Array(encodeGpx(run))], name)
}

/** The id the core gives the activity a file holds, which a trace of it is stored under. */
function idOf(file: File, bytes: Uint8Array): string {
  const parsed = parseActivityFile(bytes, file.name)
  if (!parsed.ok) throw new Error('The test file does not read')
  return parsed.activities[0]!.id
}

function scopeKey(scope: TraceScope, id: string): string {
  return JSON.stringify([scope.kind === 'device' ? 'device' : scope.userId, id])
}

/** An evidence store in memory whose every call is observable. */
function spyStore() {
  const rows = new Map<string, ActivityTrace>()
  const store = {
    get: vi.fn(async (scope: TraceScope, id: string) => rows.get(scopeKey(scope, id)) ?? null),
    has: vi.fn(async (scope: TraceScope, id: string) => rows.has(scopeKey(scope, id))),
    put: vi.fn(async (scope: TraceScope, trace: ActivityTrace): Promise<PutResult> => {
      rows.set(scopeKey(scope, trace.activityId), trace)
      return 'stored'
    }),
    remove: vi.fn(async (scope: TraceScope, id: string) => {
      rows.delete(scopeKey(scope, id))
      return true
    }),
    clearScope: vi.fn(async () => true),
    deleteScope: vi.fn(async () => true),
    reopenScope: vi.fn(async () => true),
    isDeleted: vi.fn(async () => false),
  } satisfies WorkbenchStore
  return { rows, store }
}

async function startWorker() {
  const posted: WorkerResponse[] = []
  const fakeSelf = {
    postMessage: (message: WorkerResponse) => {
      posted.push(message)
    },
    onmessage: null as ((event: MessageEvent<WorkerRequest>) => void) | null,
  }
  vi.stubGlobal('self', fakeSelf)
  await import('./analysis.worker')
  async function send(request: WorkerRequest): Promise<WorkerResponse[]> {
    const start = posted.length
    fakeSelf.onmessage?.({ data: request } as MessageEvent<WorkerRequest>)
    await vi.waitFor(() => {
      const type = posted.at(-1)?.type
      if (
        posted.length === start ||
        (type !== 'state' && type !== 'error' && type !== 'activityTrace')
      )
        throw new Error('still working')
    }, 10_000)
    return posted.slice(start)
  }
  return { send }
}

function signedOutImport(...files: File[]): WorkerRequest {
  return { type: 'addFiles', files, settings: SETTINGS, sync: null, saveToDevice: true }
}

let spy = spyStore()

/** The state reply that says detail was restored, if the import said so. */
const restoredIn = (messages: WorkerResponse[]) =>
  messages.find((m) => m.type === 'state' && m.outcome?.detailRestored !== undefined)

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  kept.library = null
  spy = spyStore()
  kept.store = spy.store
})

describe('where an import keeps recordings', () => {
  it('keeps those of a provisional import in memory only, never in the browser cache', async () => {
    const { send } = await startWorker()
    const file = fitFile()
    const id = idOf(file, new Uint8Array(await file.arrayBuffer()))

    await send({
      type: 'addFiles',
      files: [file],
      settings: SETTINGS,
      sync: null,
      provisional: true,
    })

    expect(spy.store.put).not.toHaveBeenCalled()
    const [reply] = await send({ type: 'activityTrace', id })
    expect(reply).toEqual({
      type: 'activityTrace',
      reply: { kind: 'trace', trace: expect.objectContaining({ activityId: id }) },
    })
  })

  it('keeps those of a provisional import once it is kept for the device, and serves them after a restart', async () => {
    const { send } = await startWorker()
    const file = fitFile()
    const id = idOf(file, new Uint8Array(await file.arrayBuffer()))
    await send({
      type: 'addFiles',
      files: [file],
      settings: SETTINGS,
      sync: null,
      provisional: true,
    })
    expect(spy.store.put).not.toHaveBeenCalled()

    await send({ type: 'keepProvisional', settings: SETTINGS })

    expect(spy.store.put).toHaveBeenCalledTimes(1)
    expect(spy.store.put).toHaveBeenCalledWith(
      { kind: 'device' },
      expect.objectContaining({ activityId: id }),
      expect.any(Number),
    )
    vi.resetModules()
    const restarted = await startWorker()
    await restarted.send({ type: 'loadDevice', settings: SETTINGS })
    const [reply] = await restarted.send({ type: 'activityTrace', id })
    expect(reply).toEqual({
      type: 'activityTrace',
      reply: { kind: 'trace', trace: expect.objectContaining({ activityId: id }) },
    })
  })

  it('writes nothing to the device when the provisional files go to the account', async () => {
    mocked.listActivities.mockResolvedValue([])
    mocked.createActivity.mockImplementation(async (digest) => ({
      record: {
        id: `rec-${digest.id}`,
        digest,
        fileName: 'run.fit',
        hasFile: false,
        fileSize: null,
        createdAt: 1,
      },
      created: true,
    }))
    const { send } = await startWorker()
    const file = fitFile()
    const provisional = { type: 'addFiles', files: [file], settings: SETTINGS, sync: null }
    await send({ ...provisional, provisional: true } as WorkerRequest)

    // The account loads, and the same files are sent to it.
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    await send({ ...provisional, sync: { keepFiles: false, userId: USER_ID } } as WorkerRequest)
    await send({ type: 'keepProvisional', settings: SETTINGS })

    const writes = vi.mocked(spy.store.put).mock.calls.map(([scope]) => scope.kind)
    expect(writes).toEqual(['account'])
    expect(await kept.library!.all()).toEqual([])
  })

  it('stores no recording of a provisional import that is carried to the account instead', async () => {
    const { send } = await startWorker()
    await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: null,
      provisional: true,
    })

    await send({ type: 'clear', forgetDevice: false })
    await send({ type: 'keepProvisional', settings: SETTINGS })

    expect(spy.store.put).not.toHaveBeenCalled()
  })

  it('keeps those of a signed-out import that is kept in this browser in the device cache', async () => {
    const { send } = await startWorker()

    await send(signedOutImport(fitFile()))

    expect(spy.store.put).toHaveBeenCalledTimes(1)
    expect(spy.store.put).toHaveBeenCalledWith(
      { kind: 'device' },
      expect.anything(),
      expect.any(Number),
    )
  })

  it('keeps no recording of a copy the library hides', async () => {
    const { send } = await startWorker()

    await send(signedOutImport(fitFile()))
    await send(signedOutImport(gpxFile()))

    expect(spy.store.put).toHaveBeenCalledTimes(1)
    expect(spy.rows.size).toBe(1)
  })

  it('restores a missing recording when the file the library holds is added again', async () => {
    const { send } = await startWorker()
    await send(signedOutImport(fitFile()))
    spy.rows.clear()

    await send(signedOutImport(fitFile()))

    expect(spy.rows.size).toBe(1)
  })

  it('serves a recording kept in this browser after the worker restarts', async () => {
    const { send } = await startWorker()
    const file = fitFile()
    const id = idOf(file, new Uint8Array(await file.arrayBuffer()))
    await send(signedOutImport(file))
    vi.resetModules()
    const restarted = await startWorker()
    await restarted.send({ type: 'loadDevice', settings: SETTINGS })

    const [reply] = await restarted.send({ type: 'activityTrace', id })

    expect(spy.store.get).toHaveBeenCalledWith({ kind: 'device' }, id)
    expect(reply).toEqual({
      type: 'activityTrace',
      reply: { kind: 'trace', trace: expect.objectContaining({ activityId: id }) },
    })
  })

  it('says detail was restored for a held activity added again, and only when it was missing', async () => {
    const { send } = await startWorker()
    const first = await send(signedOutImport(fitFile()))
    expect(restoredIn(first)).toBeUndefined()

    const present = await send(signedOutImport(fitFile()))
    expect(restoredIn(present)).toBeUndefined()

    spy.rows.clear()
    const missing = await send(signedOutImport(fitFile()))
    expect(restoredIn(missing)).toMatchObject({ outcome: { detailRestored: 1 } })
  })

  it('does not say detail was restored for copies of one workout added in one import', async () => {
    const { send } = await startWorker()
    const messages = await send(signedOutImport(gpxFile(), tcxFile()))

    expect(restoredIn(messages)).toBeUndefined()
  })

  it('does not count the recording of a held copy that a richer copy replaces in the same import', async () => {
    const { send } = await startWorker()
    await send(signedOutImport(gpxFile()))
    spy.rows.clear()

    const messages = await send(signedOutImport(gpxFile(), tcxFile()))

    expect(restoredIn(messages)).toBeUndefined()
  })

  it('does not say detail was restored for a near copy a fresh import also keeps', async () => {
    const { send } = await startWorker()
    const later = { ...run, startMs: run.startMs + 30_000 }
    const near = new File([new Uint8Array(encodeFit(later, { gps: true }))], 'near.fit')

    const messages = await send(signedOutImport(fitFile(), near))

    expect(restoredIn(messages)).toBeUndefined()
    expect(spy.rows.size).toBe(2)
  })

  it('does not say detail was restored when the cache will not keep the recording', async () => {
    const { send } = await startWorker()
    await send(signedOutImport(fitFile()))
    spy.rows.clear()
    vi.mocked(spy.store.put).mockImplementation(async () => 'outranked')

    const messages = await send(signedOutImport(fitFile()))

    expect(restoredIn(messages)).toBeUndefined()
    expect(spy.rows.size).toBe(0)
  })

  it('does not call a richer copy that replaces a held one a restored recording', async () => {
    const { send } = await startWorker()
    await send(signedOutImport(gpxFile()))

    const messages = await send(signedOutImport(fitFile()))

    expect(
      messages.some((m) => m.type === 'state' && m.outcome?.detailRestored !== undefined),
    ).toBe(false)
  })

  it('drops the recording of a copy that a richer copy replaces', async () => {
    const { send } = await startWorker()
    const gpx = gpxFile()
    const gpxId = idOf(gpx, new Uint8Array(await gpx.arrayBuffer()))

    await send(signedOutImport(gpx))
    expect(spy.rows.has(scopeKey({ kind: 'device' }, gpxId))).toBe(true)
    await send(signedOutImport(fitFile()))

    expect(spy.store.remove).toHaveBeenCalledWith({ kind: 'device' }, gpxId)
    expect(spy.rows.has(scopeKey({ kind: 'device' }, gpxId))).toBe(false)
    expect(spy.rows.size).toBe(1)
  })
})

describe('signing in again after a sign-out', () => {
  it('lets the account take recordings again when its library is loaded', async () => {
    mocked.listActivities.mockResolvedValue([])
    const { send } = await startWorker()
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    expect(spy.store.reopenScope).toHaveBeenCalledExactlyOnceWith({
      kind: 'account',
      userId: USER_ID,
    })
  })
})

describe('what is said when a recording cannot be removed', () => {
  const notForgotten = (messages: WorkerResponse[]) =>
    messages.filter((m) => m.type === 'deviceIssue' && m.issue === 'notForgotten')

  it('says it once when removing all activities is refused by the library and the cache', async () => {
    const { send } = await startWorker()
    await send(signedOutImport(fitFile()))
    kept.library = { ...kept.library!, clear: () => Promise.reject(new Error('refused')) }
    vi.mocked(spy.store.clearScope).mockResolvedValue(false)
    vi.resetModules()
    const restarted = await startWorker()
    await restarted.send({ type: 'loadDevice', settings: SETTINGS })

    const messages = await restarted.send({ type: 'clear', forgetDevice: true })

    expect(notForgotten(messages)).toHaveLength(1)
  })

  it('says it when only the cache refuses to clear', async () => {
    const { send } = await startWorker()
    await send(signedOutImport(fitFile()))
    vi.mocked(spy.store.clearScope).mockResolvedValue(false)

    const messages = await send({ type: 'clear', forgetDevice: true })

    expect(notForgotten(messages)).toHaveLength(1)
  })

  it('says it once when a signed-in delete leaves both a cached recording and a device copy', async () => {
    const digest = digestActivity(run)
    const record: ActivityRecord = {
      id: `rec-${digest.id}`,
      digest,
      fileName: 'run.fit',
      hasFile: false,
      fileSize: null,
      createdAt: 1,
    }
    mocked.listActivities.mockResolvedValue([record])
    mocked.deleteActivity.mockResolvedValue(undefined)
    const { send } = await startWorker()
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    vi.mocked(spy.store.remove).mockResolvedValue(false)
    await kept.library!.put(workoutKeyOf(digest), digest)
    vi.spyOn(kept.library!, 'remove').mockRejectedValue(new Error('refused'))

    const messages = await send({
      type: 'deleteActivity',
      id: record.id,
      userId: USER_ID,
      settings: SETTINGS,
    })

    expect(notForgotten(messages)).toHaveLength(1)
  })
})
