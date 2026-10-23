import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
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
    deleteActivity: vi.fn(),
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
  vi.useRealTimers()
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
      {
        type: 'state',
        state: expect.objectContaining({ totalActivities: 1, syncIssues: [] }),
        outcome: { activities: 1, rejected: 0 },
      },
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
      state: { totalActivities: 1, syncIssues: [] },
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
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { syncIssues: [{ code: 'storage-budget', count: 2 }], totalActivities: 2 },
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
      state: { syncIssues: [{ code: 'file-too-large', count: 1 }], totalActivities: 1 },
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
      state: { syncIssues: [{ code: 'server', count: 1 }], totalActivities: 1 },
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

    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { syncIssues: [{ code: 'server', count: 1 }] },
    })
  })

  it('loads the account digests and replies with the analysis', async () => {
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST)])
    const { send } = await startWorker()
    const messages = await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    expect(mocked.listActivities).toHaveBeenCalledWith(undefined, USER_ID, expect.any(Function))
    expect(messages).toEqual([
      expect.objectContaining({ type: 'libraryActivities' }),
      { type: 'missingOriginals', count: 1 },
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
      expect.objectContaining({ modelRevision: MODEL_REVISION, sport: stale.sport }),
      'run.fit',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      USER_ID,
      `rec-${stale.id}`,
    )
    expect(messages).toEqual([
      expect.objectContaining({ type: 'libraryActivities' }),
      {
        type: 'rebuildComplete',
        rebuilt: 1,
        missing: 0,
        failed: 0,
        limited: 0,
        limitKind: null,
        limitResetsAtMs: null,
        state: expect.objectContaining({ totalActivities: 1, outdatedActivities: 0 }),
      },
    ])
  })

  it('counts a rebuild whose activity was deleted in another tab as missing, and does not re-create it', async () => {
    const stale = { ...SAMPLE_DIGEST, modelRevision: 1 }
    mocked.listActivities.mockResolvedValueOnce([recordFor(stale, true)]).mockResolvedValueOnce([])
    mocked.createActivity.mockRejectedValueOnce(
      new ApiRequestError(404, 'not_found', 'Activity not found'),
    )
    const { send } = await startWorker()
    const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

    expect(mocked.createActivity).toHaveBeenCalledOnce()
    expect(mocked.createActivity).toHaveBeenCalledWith(
      expect.anything(),
      'run.fit',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      USER_ID,
      `rec-${stale.id}`,
    )
    expect(messages.at(-1)).toMatchObject({
      type: 'rebuildComplete',
      rebuilt: 0,
      missing: 1,
      failed: 0,
    })
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
      expect.objectContaining({ type: 'libraryActivities' }),
      {
        type: 'rebuildComplete',
        rebuilt: 0,
        missing: 1,
        failed: 0,
        limited: 0,
        limitKind: null,
        limitResetsAtMs: null,
        state: expect.objectContaining({ totalActivities: 0, outdatedActivities: 1 }),
      },
    ])
  })

  it('stops downloading after a daily limit and counts the remaining stored originals as limited', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-22T15:30:00Z'))
    const stale = { ...SAMPLE_DIGEST, modelRevision: 1 }
    mocked.listActivities
      .mockResolvedValueOnce([
        recordFor(stale, true),
        recordFor({ ...stale, id: 'no-file' }, false),
        recordFor({ ...stale, id: 'other' }, true),
        recordFor({ ...stale, id: 'third' }, true),
      ])
      .mockResolvedValueOnce([recordFor(stale, true)])
    mocked.downloadActivityFile.mockRejectedValueOnce(
      new ApiRequestError(429, 'daily_limit', 'Daily download limit reached'),
    )
    const { send } = await startWorker()
    const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

    expect(mocked.downloadActivityFile).toHaveBeenCalledOnce()
    expect(messages.at(-1)).toMatchObject({
      type: 'rebuildComplete',
      rebuilt: 0,
      missing: 1,
      failed: 0,
      limited: 3,
      limitKind: 'daily',
      limitResetsAtMs: Date.parse('2026-10-23T00:00:00Z'),
    })
  })

  it('stops downloading at a rate limit, retries after a minute, and counts the rest as limited', async () => {
    const stale = { ...SAMPLE_DIGEST, modelRevision: 1 }
    mocked.listActivities
      .mockResolvedValueOnce([
        recordFor(stale, true),
        recordFor({ ...stale, id: 'no-file' }, false),
        recordFor({ ...stale, id: 'other' }, true),
      ])
      .mockResolvedValueOnce([recordFor(SAMPLE_DIGEST, true)])
    mocked.downloadActivityFile.mockRejectedValueOnce(
      new ApiRequestError(429, 'rate_limited', 'Slow down'),
    )
    const { send } = await startWorker()
    const before = Date.now()
    const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })
    const after = Date.now()

    expect(mocked.downloadActivityFile).toHaveBeenCalledOnce()
    const done = messages.at(-1)
    if (done?.type !== 'rebuildComplete') throw new Error('The rebuild did not complete')
    expect(done).toMatchObject({ rebuilt: 0, missing: 1, failed: 0, limited: 2, limitKind: 'rate' })
    expect(done.limitResetsAtMs).toBeGreaterThanOrEqual(before + 60_000)
    expect(done.limitResetsAtMs).toBeLessThanOrEqual(after + 60_000)
  })

  it('reports the stored activities the server could not read when the library loads', async () => {
    mocked.listActivities.mockImplementation(async (_since, _userId, onUnreadable) => {
      onUnreadable?.(2)
      return [recordFor(SAMPLE_DIGEST)]
    })
    const { send } = await startWorker()
    const messages = await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    expect(messages).toContainEqual({ type: 'libraryUnreadable', count: 2 })
  })

  it('reports the unreadable count of the library a rebuild leaves, and clears it when none remain', async () => {
    const stale = { ...SAMPLE_DIGEST, modelRevision: 1 }
    mocked.listActivities
      .mockImplementationOnce(async (_since, _userId, onUnreadable) => {
        onUnreadable?.(2)
        return [recordFor(stale, true)]
      })
      .mockResolvedValueOnce([recordFor(SAMPLE_DIGEST, true)])
    const { send } = await startWorker()
    const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

    expect(messages.some((message) => message.type === 'libraryUnreadable')).toBe(false)
    expect(messages.at(-1)).toMatchObject({ type: 'rebuildComplete', rebuilt: 1 })
  })

  it('counts a rebuild that conflicts with another saved activity as missing, not failed', async () => {
    const stale = { ...SAMPLE_DIGEST, modelRevision: 1 }
    mocked.listActivities
      .mockResolvedValueOnce([recordFor(stale, true)])
      .mockResolvedValueOnce([recordFor(stale, true)])
    mocked.createActivity.mockRejectedValueOnce(
      new ApiRequestError(409, 'activity_conflict', 'Saved from another file'),
    )
    const { send } = await startWorker()
    const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

    expect(messages.at(-1)).toMatchObject({
      type: 'rebuildComplete',
      rebuilt: 0,
      missing: 1,
      failed: 0,
    })
  })

  it('lists the library newest first, with ties ordered by id', async () => {
    const older = { ...SAMPLE_DIGEST, id: 'older', startMs: SAMPLE_DIGEST.startMs - 86_400_000 }
    const tieB = { ...SAMPLE_DIGEST, id: 'tie-b' }
    const tieA = { ...SAMPLE_DIGEST, id: 'tie-a' }
    mocked.listActivities.mockResolvedValue([recordFor(older), recordFor(tieB), recordFor(tieA)])
    const { send } = await startWorker()
    const messages = await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    expect(messages[0]).toMatchObject({
      type: 'libraryActivities',
      activities: [{ id: 'rec-tie-a' }, { id: 'rec-tie-b' }, { id: 'rec-older' }],
    })
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

  it('stops saving after a sign-out and reports the unsaved activities as signed out', async () => {
    mocked.createActivity.mockRejectedValue(
      new ApiRequestError(401, 'unauthenticated', 'Sign in required'),
    )
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'run-a.fit'), fitFile(secondSampleActivity, 'run-b.fit')],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(mocked.createActivity).toHaveBeenCalledOnce()
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { syncIssues: [{ code: 'signed-out', count: 2 }], totalActivities: 2 },
    })
  })

  it('stops saving after an account change and reports it as account-changed', async () => {
    mocked.createActivity.mockRejectedValue(
      new ApiRequestError(409, 'account_changed', 'The signed-in account changed'),
    )
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'run-a.fit'), fitFile(secondSampleActivity, 'run-b.fit')],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(mocked.createActivity).toHaveBeenCalledOnce()
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { syncIssues: [{ code: 'account-changed', count: 2 }] },
    })
  })

  it('keeps saving after a rate limit or a network failure, and names each cause', async () => {
    mocked.createActivity
      .mockRejectedValueOnce(new ApiRequestError(429, 'rate_limited', 'Slow down'))
      .mockRejectedValueOnce(new ApiRequestError(0, 'network_error', 'Could not reach the server'))
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'run-a.fit'), fitFile(secondSampleActivity, 'run-b.fit')],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(mocked.createActivity).toHaveBeenCalledTimes(2)
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: {
        syncIssues: [
          { code: 'rate-limited', count: 1 },
          { code: 'network', count: 1 },
        ],
      },
    })
  })

  it('names an activity quota and a storage quota as their own causes', async () => {
    mocked.createActivity.mockRejectedValueOnce(
      new ApiRequestError(403, 'activity_quota', 'Library full'),
    )
    mocked.uploadFile.mockRejectedValueOnce(
      new ApiRequestError(403, 'storage_quota', 'Storage full'),
    )
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'run-a.fit'), fitFile(secondSampleActivity, 'run-b.fit')],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: {
        syncIssues: [
          { code: 'activity-quota', count: 1 },
          { code: 'storage-quota', count: 1 },
        ],
      },
    })
  })

  it.each([
    ['a full saved-analysis quota', 403, 'digest_quota', 'digest-quota'],
    ['a full database', 503, 'database_full', 'database-full'],
  ])('stops saving at %s and names it as the cause', async (_label, status, code, cause) => {
    mocked.createActivity.mockRejectedValue(new ApiRequestError(status, code, 'Full'))
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'run-a.fit'), fitFile(secondSampleActivity, 'run-b.fit')],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(mocked.createActivity).toHaveBeenCalledOnce()
    expect(messages).toContainEqual({ type: 'accountIssue', issue: cause })
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { syncIssues: [{ code: cause, count: 2 }] },
    })
  })

  it('keeps saving the rest of an import after one activity conflicts with a saved copy', async () => {
    mocked.createActivity.mockRejectedValueOnce(
      new ApiRequestError(409, 'activity_conflict', 'Saved from another file'),
    )
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'run-a.fit'), fitFile(secondSampleActivity, 'run-b.fit')],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(mocked.createActivity).toHaveBeenCalledTimes(2)
    expect(messages.some((message) => message.type === 'accountIssue')).toBe(false)
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { syncIssues: [{ code: 'activity-conflict', count: 1 }] },
    })
  })

  it('keeps a file of exactly the upload limit and refuses one byte more', async () => {
    const size = RUN_FILE_BYTES.byteLength
    const secondSize = new Uint8Array(encodeFit(secondSampleActivity, { gps: true })).byteLength
    limits.maxFileBytes = size
    const { send } = await startWorker()
    await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })
    expect(mocked.uploadFile).toHaveBeenCalledOnce()

    limits.maxFileBytes = secondSize - 1
    const messages = await send({
      type: 'addFiles',
      files: [fitFile(secondSampleActivity)],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })
    expect(mocked.uploadFile).toHaveBeenCalledOnce()
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { syncIssues: [{ code: 'file-too-large', count: 1 }] },
    })
  })

  it('reports the saved activities whose originals are missing, and clears each one a re-import restores', async () => {
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST, false)])
    const { send } = await startWorker()
    const loaded = await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    expect(loaded).toEqual([
      expect.objectContaining({ type: 'libraryActivities' }),
      { type: 'missingOriginals', count: 1 },
      { type: 'state', state: expect.objectContaining({ totalActivities: 1 }) },
    ])

    const imported = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })
    expect(mocked.uploadFile).toHaveBeenCalledOnce()
    expect(imported).toContainEqual({ type: 'missingOriginals', count: 0 })
    expect(imported.at(-1)).toMatchObject({ type: 'state' })
  })

  it('reports a sign-out while loading the library so the app can stop showing the account', async () => {
    mocked.listActivities.mockRejectedValue(
      new ApiRequestError(401, 'unauthenticated', 'Sign in required'),
    )
    const { send } = await startWorker()
    expect(await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })).toEqual([
      { type: 'error', message: 'Sign in required', issue: 'signed-out' },
    ])
  })

  it('stops a rebuild at the first sign-out instead of failing every activity', async () => {
    const stale = { ...SAMPLE_DIGEST, modelRevision: 1 }
    mocked.listActivities.mockResolvedValueOnce([
      recordFor(stale, true),
      recordFor({ ...stale, id: 'other' }, true),
    ])
    mocked.downloadActivityFile.mockRejectedValue(
      new ApiRequestError(401, 'unauthenticated', 'Sign in required'),
    )
    const { send } = await startWorker()
    expect(await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })).toEqual([
      { type: 'error', message: 'Sign in required', issue: 'signed-out' },
    ])
    expect(mocked.downloadActivityFile).toHaveBeenCalledOnce()
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

it('deletes by server record id without dropping another unsaved activity', async () => {
  const saved = recordFor(SAMPLE_DIGEST)
  mocked.listActivities.mockResolvedValue([saved])
  mocked.deleteActivity.mockResolvedValue(undefined)
  const { send } = await startWorker()
  await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
  mocked.createActivity.mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
  await send({
    type: 'addFiles',
    files: [fitFile(secondSampleActivity)],
    settings: SETTINGS,
    sync: { userId: USER_ID, keepFiles: false },
  })
  const messages = await send({
    type: 'deleteActivity',
    id: saved.id,
    userId: USER_ID,
    settings: SETTINGS,
  })
  expect(mocked.deleteActivity).toHaveBeenCalledWith(saved.id, USER_ID)
  expect(messages).toContainEqual({ type: 'libraryActivities', activities: [] })
  expect(messages.at(-1)).toMatchObject({
    type: 'state',
    state: { totalActivities: 1, syncIssues: [{ code: 'network', count: 1 }] },
  })
})

it('keeps a saved activity after its deletion fails', async () => {
  const saved = recordFor(SAMPLE_DIGEST)
  mocked.listActivities.mockResolvedValue([saved])
  mocked.deleteActivity.mockRejectedValue(new ApiRequestError(503, 'unavailable', 'Try later'))
  const { send } = await startWorker()
  await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
  const messages = await send({
    type: 'deleteActivity',
    id: saved.id,
    userId: USER_ID,
    settings: SETTINGS,
  })
  expect(messages).toEqual([{ type: 'error', message: 'Try later', issue: 'server' }])
  const state = await send({ type: 'setSettings', settings: SETTINGS })
  expect(state.at(-1)).toMatchObject({ state: { totalActivities: 1 } })
})

it('reports a daily limit during a delete with the daily-limit cause', async () => {
  const saved = recordFor(SAMPLE_DIGEST)
  mocked.listActivities.mockResolvedValue([saved])
  mocked.deleteActivity.mockRejectedValue(new ApiRequestError(429, 'daily_limit', 'Tomorrow'))
  const { send } = await startWorker()
  await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
  const messages = await send({
    type: 'deleteActivity',
    id: saved.id,
    userId: USER_ID,
    settings: SETTINGS,
  })
  expect(messages).toEqual([{ type: 'error', message: 'Tomorrow', issue: 'daily-limit' }])
})
