import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { encodeFit } from '@rca/core/fit'
import { strToU8, zipSync } from 'fflate'
import { sampleDataset } from '@rca/core/synthetic'
import type { ActivityDigest } from '@rca/core/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { workoutKeyOf } from './device'
import type { DeviceLibrary } from './deviceLibrary'
import type { WorkerRequest, WorkerResponse } from './protocol'

/** Files the index knows are not read again; the worker keeps the index per scope and checks it against the library. */

const parsed = vi.hoisted(() => ({ calls: 0 }))
vi.mock('@rca/core/import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rca/core/import')>()
  return {
    ...actual,
    parseActivityFile: (...args: Parameters<typeof actual.parseActivityFile>) => {
      parsed.calls++
      return actual.parseActivityFile(...args)
    },
  }
})

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
const USER = 'u1'
const [one, two] = sampleDataset().activities
if (one === undefined || two === undefined) throw new Error('The sample has too few activities')
const mocked = vi.mocked(client)

const fit = (activity = one, name = 'run.fit') =>
  new File([new Uint8Array(encodeFit(activity, { gps: true }))], name)

function record(digest: ActivityDigest, hasFile: boolean): ActivityRecord {
  return {
    id: `rec-${digest.id}`,
    digest,
    fileName: 'run.fit',
    hasFile,
    fileSize: hasFile ? 1 : null,
    createdAt: 1,
  }
}

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
      if (posted.length === start || (last?.type !== 'state' && last?.type !== 'error')) {
        throw new Error('still working')
      }
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
const account = (files: File[], keepFiles: boolean): WorkerRequest => ({
  type: 'addFiles',
  files,
  settings: SETTINGS,
  sync: { keepFiles, userId: USER },
})

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  vi.clearAllMocks()
  parsed.calls = 0
  kept.library = null
  mocked.createActivity.mockImplementation(async (digest) => ({
    record: record(digest, false),
    created: true,
  }))
  mocked.uploadFile.mockImplementation(async (id) => ({ ...record(digestActivity(one), true), id }))
})

describe('re-importing files the worker already read', () => {
  it('reads nothing the second time into the library kept in this browser, and the report is the same', async () => {
    const { send } = await startWorker()
    await send(device([fit(one), fit(two, 'other.fit')]))
    const firstParses = parsed.calls
    expect(firstParses).toBe(2)
    const again = await send(device([fit(one), fit(two, 'other.fit')]))
    expect(parsed.calls).toBe(firstParses)
    expect(again.at(-1)).toMatchObject({
      type: 'state',
      state: { totalActivities: 2 },
      outcome: { activities: 2, filesAdded: 0, rejected: 0 },
    })
  })

  it('reads a file again after its activity was deleted, and after everything was removed', async () => {
    const { send } = await startWorker()
    await send(device([fit(one)]))
    await send({
      type: 'deleteDeviceActivity',
      id: workoutKeyOf(digestActivity(one)),
      settings: SETTINGS,
    })
    await send(device([fit(one)]))
    expect(parsed.calls).toBe(2)
    await send(device([fit(one)]))
    expect(parsed.calls).toBe(2)
    await send({ type: 'clear', forgetDevice: true } as WorkerRequest)
    await send(device([fit(one)]))
    expect(parsed.calls).toBe(3)
  })

  it('keeps no index for files analysed alone, where nothing is kept', async () => {
    const { send } = await startWorker()
    await send({ type: 'addFiles', files: [fit(one)], settings: SETTINGS, sync: null })
    await send({ type: 'addFiles', files: [fit(one)], settings: SETTINGS, sync: null })
    expect(parsed.calls).toBe(2)
  })

  it('skips a file whose saved activity already has its original, and reads one that lacks it', async () => {
    const { send } = await startWorker()
    await send(account([fit(one)], true))
    expect(mocked.uploadFile).toHaveBeenCalledTimes(1)
    await send(account([fit(one)], true))
    expect(parsed.calls).toBe(1)

    // The original did not go up: the file is read again, so it is uploaded then.
    vi.resetModules()
    vi.stubGlobal('indexedDB', new IDBFactory())
    parsed.calls = 0
    mocked.uploadFile.mockRejectedValue(new Error('offline'))
    const second = await startWorker()
    await second.send(account([fit(two, 'other.fit')], true))
    await second.send(account([fit(two, 'other.fit')], true))
    expect(parsed.calls).toBe(2)
  })

  it('reads a file again when the account is a different one, which has its own index', async () => {
    const { send } = await startWorker()
    await send(account([fit(one)], false))
    await send({
      ...account([fit(one)], false),
      sync: { keepFiles: false, userId: 'u2' },
    } as WorkerRequest)
    expect(parsed.calls).toBe(2)
  })

  it('keeps no activity name in the index: what an export said of a file is kept as a signature', async () => {
    const zip = zipSync({
      'activities/1.fit': new Uint8Array(encodeFit(one, { gps: true })),
      'activities.csv': strToU8(
        'Activity Name,Activity Type,Filename\nSecretly Named Morning Run,Run,activities/1.fit\n',
      ),
    })
    const { send } = await startWorker()
    await send(device([new File([new Uint8Array(zip)], 'export.zip')]))
    const rows = await new Promise<unknown[]>((resolve) => {
      const open = indexedDB.open('rca-checkin')
      open.onsuccess = () => {
        const all = open.result.transaction('held', 'readonly').objectStore('held').getAll()
        all.onsuccess = () => resolve(all.result)
      }
    })
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toMatch(/secretly|named|morning|1\.fit|export\.zip/i)
    // The same export again is skipped, so the signature still stands for the name.
    parsed.calls = 0
    await send(device([new File([new Uint8Array(zip)], 'export.zip')]))
    expect(parsed.calls).toBe(0)
  })
})
