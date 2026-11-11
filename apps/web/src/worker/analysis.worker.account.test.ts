import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { encodeFit } from '@rca/core/fit'
import { sampleDataset } from '@rca/core/synthetic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    deleteActivity: vi.fn(),
    uploadFile: vi.fn(),
    patchLabels: vi.fn(),
  }
})
vi.mock('../api/renameClient', () => ({
  renameActivity: async (_id: string, name: string) => ({ name }),
}))
vi.mock('../api/settings', () => ({ getAccountSettings: async () => ({}) }))
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
  loadServer: () => ({ type: 'loadServer', settings: SETTINGS, userId: USER, choice: 42 }),
  rebuildStale: () => ({ type: 'rebuildStale', settings: SETTINGS, userId: USER }),
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
    account: { id: USER, email: 'a@example.test', createdAt: 0 } as never,
    profile: {} as never,
  }),
  activitySplits: () => ({ type: 'activitySplits', id: DIGEST.id }),
  routeShape: () => ({ type: 'routeShape', id: `rec-${DIGEST.id}`, userId: USER }),
  forgetRoutes: () => ({ type: 'forgetRoutes' }),
  activityTrace: () => ({ type: 'activityTrace', id: DIGEST.id, userId: USER }),
  markSeen: () => ({ type: 'markSeen', row: 'checkIn', event: 'open' }),
  acceptPartialImport: () => ({ type: 'acceptPartialImport' }),
}

describe('the worker in an account’s scope', () => {
  it('builds no state for any request: the analysis is never asked for an account’s library', async () => {
    const { send } = await startWorker()
    // The session and the period cache are the worker's own, loaded after the reset.
    const { AnalysisSession } = await import('@rca/core/session')
    const built = vi.spyOn(
      AnalysisSession.prototype as unknown as { state: (settings: unknown) => unknown },
      'state',
    )
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER })
    const requests = Object.values(IN_ACCOUNT)
    for (const make of requests) {
      const reply = (await send(make())).at(-1)
      if (reply?.type === 'state' || reply?.type === 'rebuildComplete') {
        expect(reply.state, `${JSON.stringify(reply).slice(0, 80)}`).toBeNull()
      }
    }
    expect(built).not.toHaveBeenCalled()
  })

  it('reads the check-in baseline from a fresh /api/state before an import, and shows none when the server is computing', async () => {
    const { send } = await startWorker()
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER })
    const reads = serverReads.reads
    const reply = (await send(IN_ACCOUNT.addFiles())).at(-1)
    // One read for the baseline, one for the check-in of the library the import left; a 202 gives neither a view.
    expect(serverReads.reads).toBe(reads + 2)
    expect(reply).toMatchObject({ type: 'state', state: null })
    expect(reply).not.toHaveProperty('checkIn')
  })

  it('leaves the check-in alone for a period or settings change', async () => {
    const { send } = await startWorker()
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER })
    const reads = serverReads.reads
    await send(IN_ACCOUNT.setRange())
    await send(IN_ACCOUNT.setSettings())
    expect(serverReads.reads).toBe(reads)
  })
})
