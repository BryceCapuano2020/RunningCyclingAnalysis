import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { encodeFit } from '@rca/core/fit'
import { sampleDataset } from '@rca/core/synthetic'
import type { Activity, ActivityDigest } from '@rca/core/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ApiRequestError } from '../api/client'
import type { WorkerRequest, WorkerResponse } from './protocol'

const limits = vi.hoisted(() => ({ maxFileBytes: 50 * 1024 * 1024 }))

vi.mock('@rca/contract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rca/contract')>()
  return {
    ...actual,
    get MAX_FILE_BYTES() {
      return limits.maxFileBytes
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
    uploadFile: vi.fn(),
  }
})

const SETTINGS = { massKg: 75, bikeMassKg: 9 }
const USER_ID = 'u1'
const [sampleActivity, secondSampleActivity] = sampleDataset().activities
if (sampleActivity === undefined) throw new Error('The sample has no activities')
if (secondSampleActivity === undefined) throw new Error('The sample has fewer than two activities')
const RUN_FILE_BYTES = new Uint8Array(encodeFit(sampleActivity, { gps: true }))
const SAMPLE_DIGEST = digestActivity(sampleActivity)

function recordFor(digest: ActivityDigest, hasFile = false): ActivityRecord {
  return {
    id: `rec-${digest.id}`,
    digest,
    fileName: 'run.fit',
    hasFile,
    fileSize: hasFile ? 1 : null,
    createdAt: 1,
  }
}

const mocked = vi.mocked(client)

/** Loads the worker afresh, with a fake `self` that collects what it posts. */
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

  /** Sends one request and resolves with the messages it produced, ending with its reply. */
  async function send(request: WorkerRequest): Promise<WorkerResponse[]> {
    const start = posted.length
    fakeSelf.onmessage?.({ data: request } as MessageEvent<WorkerRequest>)
    await vi.waitFor(() => {
      const last = posted.at(-1)
      if (
        posted.length === start ||
        (last?.type !== 'state' && last?.type !== 'error' && last?.type !== 'rebuildComplete')
      ) {
        throw new Error('still working')
      }
    })
    return posted.slice(start)
  }
  return { send }
}

function fitFile(activity?: Activity, name = 'run.fit'): File {
  const source = activity ?? sampleActivity
  if (source === undefined) throw new Error('The sample has no activities')
  return new File([new Uint8Array(encodeFit(source, { gps: true }))], name)
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  limits.maxFileBytes = 50 * 1024 * 1024
  vi.unstubAllGlobals()
  mocked.createActivity.mockImplementation(async (digest) => ({
    record: recordFor(digest),
    created: true,
  }))
  mocked.uploadFile.mockImplementation(async (id) => ({
    ...recordFor(SAMPLE_DIGEST, true),
    id,
  }))
  mocked.downloadActivityFile.mockResolvedValue(RUN_FILE_BYTES)
})

describe('analysis worker', () => {
  it('imports files without saving anything when there is no sync', async () => {
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: null,
    })

    expect(mocked.createActivity).not.toHaveBeenCalled()
    expect(mocked.uploadFile).not.toHaveBeenCalled()
    expect(messages).toEqual([
      { type: 'progress', filesRead: 1 },
      { type: 'state', state: expect.objectContaining({ totalActivities: 1, syncFailures: 0 }) },
    ])
  })

  it('saves each new activity and uploads its file when files are kept', async () => {
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(mocked.createActivity).toHaveBeenCalledWith(
      expect.objectContaining({ sport: sampleActivity.sport }),
      'run.fit',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      USER_ID,
    )
    const [digest] = mocked.createActivity.mock.calls[0] ?? []
    expect(mocked.uploadFile).toHaveBeenCalledWith(
      `rec-${digest?.id}`,
      expect.any(Uint8Array),
      USER_ID,
    )
    // The upload is reported as it happens, before the file itself counts as read.
    expect(messages).toContainEqual({ type: 'progress', filesRead: 0, uploaded: 1 })
    expect(messages).toContainEqual({ type: 'progress', filesRead: 1, uploaded: 1 })
    expect(messages.at(-1)).toMatchObject({ type: 'state' })
  })

  it('saves the activity without uploading its file when files are not kept', async () => {
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
    })

    expect(mocked.createActivity).toHaveBeenCalledOnce()
    expect(mocked.uploadFile).not.toHaveBeenCalled()
    expect(messages).toContainEqual({ type: 'progress', filesRead: 1, uploaded: 1 })
  })

  it('uploads a previously saved duplicate when original-file retention is enabled', async () => {
    const { send } = await startWorker()
    await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
    })

    const messages = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(mocked.createActivity).toHaveBeenCalledTimes(2)
    const [digest] = mocked.createActivity.mock.calls[1] ?? []
    expect(mocked.uploadFile).toHaveBeenCalledOnce()
    expect(mocked.uploadFile).toHaveBeenCalledWith(
      `rec-${digest?.id}`,
      expect.any(Uint8Array),
      USER_ID,
    )
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { totalActivities: 1, syncFailures: 0 },
    })
  })

  it('reports a storage allowance failure and does not retry remaining original uploads', async () => {
    mocked.uploadFile.mockRejectedValueOnce(
      new ApiRequestError(429, 'storage_budget_exhausted', 'Storage allowance reached'),
    )
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'run-a.fit'), fitFile(secondSampleActivity, 'run-b.fit')],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(mocked.createActivity).toHaveBeenCalledTimes(2)
    expect(mocked.uploadFile).toHaveBeenCalledOnce()
    expect(messages).toContainEqual({ type: 'storageBudgetExceeded' })
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { syncFailures: 2, totalActivities: 2 },
    })
  })

  it('does not upload when the saved activity already has its file', async () => {
    mocked.createActivity.mockImplementation(async (digest) => ({
      record: recordFor(digest, true),
      created: false,
    }))
    const { send } = await startWorker()
    await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(mocked.uploadFile).not.toHaveBeenCalled()
  })

  it('reports a partial save when a retained original exceeds the upload limit', async () => {
    limits.maxFileBytes = 10
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(mocked.createActivity).toHaveBeenCalledOnce()
    expect(mocked.uploadFile).not.toHaveBeenCalled()
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { syncFailures: 1, totalActivities: 1 },
    })
    expect(messages).not.toContainEqual(expect.objectContaining({ uploaded: 1 }))
  })

  it('counts a failed save and still finishes the import', async () => {
    mocked.createActivity.mockRejectedValue(new Error('offline'))
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { syncFailures: 1, totalActivities: 1 },
    })
    expect(mocked.uploadFile).not.toHaveBeenCalled()
  })

  it('counts a failed upload as a failed save', async () => {
    mocked.uploadFile.mockRejectedValue(new Error('too large'))
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(messages.at(-1)).toMatchObject({ type: 'state', state: { syncFailures: 1 } })
  })

  it('loads the account digests and replies with the analysis', async () => {
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST)])
    const { send } = await startWorker()
    const messages = await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    expect(mocked.listActivities).toHaveBeenCalledWith(undefined, USER_ID)
    expect(messages).toEqual([
      {
        type: 'state',
        state: expect.objectContaining({ totalActivities: 1, isSample: false }),
      },
    ])
  })

  it('rebuilds stale digests from their stored originals and refreshes the active analysis', async () => {
    const stale = { ...SAMPLE_DIGEST, modelRevision: 1 }
    mocked.listActivities
      .mockResolvedValueOnce([recordFor(stale, true)])
      .mockResolvedValueOnce([recordFor(SAMPLE_DIGEST, true)])
    const { send } = await startWorker()
    const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

    expect(mocked.downloadActivityFile).toHaveBeenCalledWith(`rec-${stale.id}`, USER_ID)
    expect(mocked.createActivity).toHaveBeenCalledWith(
      expect.objectContaining({ modelRevision: 2, sport: stale.sport }),
      'run.fit',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      USER_ID,
    )
    expect(messages).toEqual([
      {
        type: 'rebuildComplete',
        rebuilt: 1,
        missing: 0,
        failed: 0,
        state: expect.objectContaining({ totalActivities: 1, outdatedActivities: 0 }),
      },
    ])
  })

  it('keeps stale activities excluded and reports originals that must be re-imported', async () => {
    const stale = { ...SAMPLE_DIGEST, modelRevision: 1 }
    mocked.listActivities
      .mockResolvedValueOnce([recordFor(stale, false)])
      .mockResolvedValueOnce([recordFor(stale, false)])
    const { send } = await startWorker()
    const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

    expect(mocked.downloadActivityFile).not.toHaveBeenCalled()
    expect(mocked.createActivity).not.toHaveBeenCalled()
    expect(messages).toEqual([
      {
        type: 'rebuildComplete',
        rebuilt: 0,
        missing: 1,
        failed: 0,
        state: expect.objectContaining({ totalActivities: 0, outdatedActivities: 1 }),
      },
    ])
  })

  it('passes sample, settings, range and clear requests through to the session', async () => {
    const { send } = await startWorker()
    const sample = await send({ type: 'loadSample', settings: SETTINGS })
    expect(sample).toEqual([{ type: 'state', state: expect.objectContaining({ isSample: true }) }])

    const range = await send({ type: 'setRange', rangeDays: 42, settings: SETTINGS })
    expect(range).toEqual([{ type: 'state', state: expect.objectContaining({ rangeDays: 42 }) }])

    const settings = await send({
      type: 'setSettings',
      settings: { massKg: 80, bikeMassKg: 9 },
    })
    expect(settings).toEqual([{ type: 'state', state: expect.objectContaining({ rangeDays: 42 }) }])

    const cleared = await send({ type: 'clear' })
    expect(cleared).toEqual([
      {
        type: 'state',
        state: expect.objectContaining({ isSample: false, totalActivities: 0, rangeDays: null }),
      },
    ])
  })

  it('posts the message of a request that fails', async () => {
    mocked.listActivities.mockRejectedValue(new Error('Sign in required'))
    const { send } = await startWorker()
    expect(await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })).toEqual([
      { type: 'error', message: 'Sign in required' },
    ])
  })

  it('posts a non-Error failure as text', async () => {
    mocked.listActivities.mockRejectedValue('offline')
    const { send } = await startWorker()
    expect(await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })).toEqual([
      { type: 'error', message: 'offline' },
    ])
  })

  it('handles requests strictly in order, even when they arrive together', async () => {
    const posted: WorkerResponse[] = []
    const fakeSelf = {
      postMessage: (message: WorkerResponse) => {
        posted.push(message)
      },
      onmessage: null as ((event: MessageEvent<WorkerRequest>) => void) | null,
    }
    vi.stubGlobal('self', fakeSelf)
    await import('./analysis.worker')

    fakeSelf.onmessage?.({
      data: { type: 'loadSample', settings: SETTINGS },
    } as MessageEvent<WorkerRequest>)
    fakeSelf.onmessage?.({ data: { type: 'clear' } } as MessageEvent<WorkerRequest>)
    await vi.waitFor(() => expect(posted).toHaveLength(2))
    expect(posted).toEqual([
      { type: 'state', state: expect.objectContaining({ isSample: true }) },
      { type: 'state', state: expect.objectContaining({ isSample: false }) },
    ])
  })
})
