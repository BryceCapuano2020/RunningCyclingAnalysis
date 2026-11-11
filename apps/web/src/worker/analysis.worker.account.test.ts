import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { gzipSync, strToU8, zipSync } from 'fflate'
import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { encodeFit } from '@rca/core/fit'
import { sampleDataset } from '@rca/core/synthetic'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import type { WorkerRequest, WorkerResponse } from './protocol'
import { REPLY_TYPES } from './protocol'

/**
 * An account's results are the server's (docs/design/server-authority.md, decision 1): in an account's scope the worker keeps
 * an index of the library and builds no `SessionState`.
 */

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return {
    ...actual,
    createActivity: vi.fn(),
    downloadActivityFile: vi.fn(),
    listActivities: vi.fn(),
    getMe: vi.fn(),
    deleteActivity: vi.fn(),
    uploadFile: vi.fn(),
    patchLabels: vi.fn(),
  }
})
vi.mock('../api/renameClient', () => ({
  renameActivity: async (_id: string, name: string) => ({ name }),
}))
vi.mock('../api/settings', () => ({
  getAccountSettings: async () => ({ keepPower: [], countedRuns: null, period: null }),
}))
vi.mock('../api/lifts', () => ({
  createLiftTransport: () => ({ page: async () => ({ items: [], next: null, liftRevision: 1 }) }),
}))
const serverReads = vi.hoisted(() => ({ reads: 0 }))
vi.mock('../api/state', () => ({
  readServerState: async () => {
    serverReads.reads++
    return { kind: 'computing', retryAfterMs: 2_000 }
  },
}))

const SETTINGS = { massKg: 75, bikeMassKg: 9 }
const USER = 'u1'
const [first, second] = sampleDataset().activities
if (first === undefined || second === undefined)
  throw new Error('The sample has too few activities')
const DIGEST = digestActivity(first)
const RUN_BYTES = new Uint8Array(encodeFit(first, { gps: true }))
const recordFor = (digest: typeof DIGEST, hasFile = false): ActivityRecord => ({
  id: `rec-${digest.id}`,
  digest,
  fileName: 'run.fit',
  hasFile,
  fileSize: hasFile ? 1 : null,
  createdAt: 1,
})
const mocked = vi.mocked(client)

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
    const replyAt = () => posted.findIndex((m, i) => i >= start && REPLY_TYPES.has(m.type))
    await vi.waitFor(() => {
      if (replyAt() < 0) throw new Error('still working')
    }, 10_000)
    return posted.slice(start, replyAt() + 1)
  }
  return { send }
}

afterEach(() => vi.doUnmock('./labelsConfig'))

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  vi.resetModules()
  vi.resetAllMocks()
  serverReads.reads = 0
  mocked.listActivities.mockResolvedValue([recordFor(DIGEST)])
  mocked.deleteActivity.mockResolvedValue(undefined)
  mocked.createActivity.mockImplementation(async (digest) => ({
    record: recordFor(digest),
    created: true,
  }))
})

/**
 * Every request type, as an account's page sends it once its library is loaded. `device` marks the ones that change which
 * library the worker holds or read the one kept in this browser: they are not requests in an account's scope. The record
 * makes a missing type a compile error here.
 */
type DeviceRequest =
  'loadSample' | 'loadDevice' | 'keepProvisional' | 'deleteDeviceActivity' | 'clear'
const IN_ACCOUNT: Record<Exclude<WorkerRequest['type'], DeviceRequest>, () => WorkerRequest> = {
  addFiles: () => ({
    type: 'addFiles',
    files: [new File([new Uint8Array(encodeFit(second, { gps: true }))], 'b.fit')],
    settings: SETTINGS,
    sync: { userId: USER, keepFiles: false },
  }),
  loadServer: () => ({ type: 'loadServer', userId: USER, choice: 42 }),
  rebuildStale: () => ({ type: 'rebuildStale', userId: USER }),
  resumeSaves: () => ({ type: 'resumeSaves', settings: SETTINGS, userId: USER }),
  undoLabels: () => ({ type: 'undoLabels', settings: SETTINGS, userId: USER }),
  setSettings: () => ({ type: 'setSettings', settings: SETTINGS }),
  setRange: () => ({ type: 'setRange', choice: 'all', settings: SETTINGS }),
  deleteActivity: () => ({
    type: 'deleteActivity',
    id: `rec-${DIGEST.id}`,
    userId: USER,
    settings: SETTINGS,
  }),
  renameActivity: () => ({
    type: 'renameActivity',
    id: `rec-${DIGEST.id}`,
    name: 'Club loop',
    userId: USER,
    settings: SETTINGS,
  }),
  adoptDevice: () => ({ type: 'adoptDevice', userId: USER, settings: SETTINGS }),
  forgetDeviceLibrary: () => ({ type: 'forgetDeviceLibrary', settings: SETTINGS }),
  exportData: () => ({
    type: 'exportData',
    userId: USER,
    account: { name: 'Sam', email: 'a@example.test' },
    profile: {} as never,
  }),
  activitySplits: () => ({ type: 'activitySplits', id: DIGEST.id }),
  routeShape: () => ({ type: 'routeShape', id: `rec-${DIGEST.id}`, userId: USER }),
  forgetRoutes: () => ({ type: 'forgetRoutes' }),
  activityTrace: () => ({ type: 'activityTrace', id: DIGEST.id, userId: USER }),
  markSeen: () => ({ type: 'markSeen', row: 'checkIn', event: 'open' }),
  acceptPartialImport: () => ({ type: 'acceptPartialImport' }),
}

/** An export of one run, which the list calls a hike: with the labels on it labels the record the account holds. */
function hikeExport(): File {
  const csv = strToU8(
    'Activity ID,Activity Name,Activity Type,Filename\n1,Lunch,Hike,activities/1.fit.gz\n',
  )
  return new File(
    [
      new Uint8Array(
        zipSync({ 'activities/1.fit.gz': gzipSync(RUN_BYTES), 'activities.csv': csv }),
      ),
    ],
    'export.zip',
  )
}

/** Puts the worker where an entry's request means something: undo needs labels an import applied. */
const SETUP: Partial<Record<keyof typeof IN_ACCOUNT, (send: Send) => Promise<void>>> = {
  undoLabels: async (send) => {
    const saved = recordFor({ ...DIGEST, id: `${first.startMs}-activities/1.fit` })
    mocked.listActivities
      .mockResolvedValueOnce([saved])
      .mockResolvedValueOnce([{ ...saved, digest: { ...saved.digest, athleteType: 'hike' } }])
    mocked.patchLabels.mockResolvedValue({ applied: 1, skipped: 0, refused: 0, missed: [] })
    await send({ type: 'loadServer', userId: USER })
    await send({
      type: 'addFiles',
      files: [hikeExport()],
      settings: SETTINGS,
      sync: { userId: USER, keepFiles: false },
    })
    expect(mocked.patchLabels).toHaveBeenCalledOnce()
    mocked.listActivities.mockResolvedValue([saved])
  },
}

type Send = (request: WorkerRequest) => Promise<WorkerResponse[]>

describe('the worker in an account’s scope', () => {
  // A fresh worker for each request, so one request's change of scope cannot make the next one pass or fail.
  it.each(Object.keys(IN_ACCOUNT) as (keyof typeof IN_ACCOUNT)[])(
    'builds no state for %s: the analysis is never asked for an account’s library',
    async (type) => {
      // Labels are off unless a test turns them on, before the worker loads.
      if (type === 'undoLabels')
        vi.doMock('./labelsConfig', () => ({ ATHLETE_LABELS_ENABLED: true }))
      const { send } = await startWorker()
      const { AnalysisSession } = await import('@rca/core/session')
      const built = vi.spyOn(
        AnalysisSession.prototype as unknown as { state: (settings: unknown) => unknown },
        'state',
      )
      const setup = SETUP[type]
      if (setup === undefined) await send({ type: 'loadServer', userId: USER })
      else await setup(send)
      const reply = (await send(IN_ACCOUNT[type]())).at(-1)
      expect(reply, JSON.stringify(reply)).not.toMatchObject({ type: 'error' })
      if (reply?.type === 'state' || reply?.type === 'rebuildComplete') {
        expect(reply.state).toBeNull()
      }
      expect(built).not.toHaveBeenCalled()
    },
  )

  it('builds none after the session expires, which empties the worker’s scope but not the account’s index', async () => {
    const { send } = await startWorker()
    const { AnalysisSession } = await import('@rca/core/session')
    const built = vi.spyOn(
      AnalysisSession.prototype as unknown as { state: (settings: unknown) => unknown },
      'state',
    )
    await send({ type: 'loadServer', userId: USER })
    await send({ type: 'forgetRoutes' })
    for (const request of [IN_ACCOUNT.setSettings(), IN_ACCOUNT.setRange()]) {
      expect((await send(request)).at(-1)).toMatchObject({ type: 'state', state: null })
    }
    expect(built).not.toHaveBeenCalled()
  })

  it('builds a state again for the library kept in this browser, once the account is left', async () => {
    const { send } = await startWorker()
    await send({ type: 'loadServer', userId: USER })
    await send({ type: 'clear' })
    const kept = (await send({ type: 'setSettings', settings: SETTINGS })).at(-1)
    expect(kept).toMatchObject({
      type: 'state',
      state: expect.objectContaining({ isSample: false }),
    })
  })

  it('says the library version it listed the account at, read before the list, so the page can tell a later change', async () => {
    const order: string[] = []
    mocked.getMe.mockImplementation(async () => {
      order.push('me')
      return { libraryVersion: 7 } as never
    })
    mocked.listActivities.mockImplementation(async () => {
      order.push('list')
      return [recordFor(DIGEST)]
    })
    const { send } = await startWorker()
    const loaded = (await send({ type: 'loadServer', userId: USER })).at(-1)
    expect(loaded).toMatchObject({ type: 'state', state: null, libraryVersion: 7 })
    expect(order).toEqual(['me', 'list'])
  })

  it('names no version when the account cannot be asked, and the page takes the next snapshot’s', async () => {
    mocked.getMe.mockRejectedValue(new Error('offline'))
    const { send } = await startWorker()
    const loaded = (await send({ type: 'loadServer', userId: USER })).at(-1)
    expect(loaded).not.toHaveProperty('libraryVersion')
  })

  it('reads one fresh /api/state before an import, for its baseline, and shows no check-in when the server is computing', async () => {
    const { send } = await startWorker()
    await send({ type: 'loadServer', userId: USER })
    const reads = serverReads.reads
    const reply = (await send(IN_ACCOUNT.addFiles())).at(-1)
    expect(serverReads.reads).toBe(reads + 1)
    expect(reply).toMatchObject({ type: 'state', state: null })
    expect(reply).not.toHaveProperty('checkIn')
  })

  it('reads no /api/state for a period or settings change, or any other request', async () => {
    const { send } = await startWorker()
    await send({ type: 'loadServer', userId: USER })
    const reads = serverReads.reads
    await send(IN_ACCOUNT.setRange())
    await send(IN_ACCOUNT.setSettings())
    await send(IN_ACCOUNT.deleteActivity())
    expect(serverReads.reads).toBe(reads)
  })
})
