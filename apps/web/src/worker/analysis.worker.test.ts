import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { encodeFit } from '@rca/core/fit'
import { encodeGpx } from '@rca/core/gpx/encode'
import { parseActivityFile } from '@rca/core/import'
import { sampleDataset } from '@rca/core/synthetic'
import type { Activity, ActivityDigest } from '@rca/core/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ApiRequestError } from '../api/client'
import { buildAccountExport } from '../export/accountExport'
import { workoutKeyOf } from './device'
import type { DeviceLibrary } from './deviceLibrary'
import type { WorkerRequest, WorkerResponse } from './protocol'

/** A reply waits on a full analysis, which takes most of a second on its own; vi.waitFor's 1 s is too short under load. */
const WAIT_FOR_MS = 10_000

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

/** The device library the worker opens. It outlives a fresh worker import, as IndexedDB does. */
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
const USER_ID = 'u1'
const [sampleActivity, secondSampleActivity, thirdSampleActivity] = sampleDataset().activities
if (sampleActivity === undefined) throw new Error('The sample has no activities')
if (secondSampleActivity === undefined) throw new Error('The sample has fewer than two activities')
if (thirdSampleActivity === undefined) throw new Error('The sample has fewer than three activities')
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
        (last?.type !== 'state' &&
          last?.type !== 'error' &&
          last?.type !== 'rebuildComplete' &&
          last?.type !== 'exportReady' &&
          last?.type !== 'splits' &&
          last?.type !== 'routeShape')
      ) {
        throw new Error('still working')
      }
    }, WAIT_FOR_MS)
    return posted.slice(start)
  }
  return { send }
}

function fitFile(activity?: Activity, name = 'run.fit'): File {
  const source = activity ?? sampleActivity
  if (source === undefined) throw new Error('The sample has no activities')
  return new File([new Uint8Array(encodeFit(source, { gps: true }))], name)
}

/** The first sample activity as a GPX file: the same workout as the FIT file, in a poorer format. */
function gpxFile(name = 'run.gpx'): File {
  if (sampleActivity === undefined) throw new Error('The sample has no activities')
  return new File([new Uint8Array(encodeGpx(sampleActivity))], name)
}

beforeEach(() => {
  vi.resetModules()
  vi.useRealTimers()
  vi.clearAllMocks()
  limits.maxFileBytes = 50 * 1024 * 1024
  kept.library = null
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
      { type: 'progress', filesRead: 1, filesTotal: 1 },
      {
        type: 'state',
        state: expect.objectContaining({ totalActivities: 1, syncIssues: [] }),
        outcome: expect.objectContaining({ activities: 1, rejected: 0, duplicates: [] }),
      },
    ])
  })

  it('tells each progress message how many activity files the import holds', async () => {
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [
        fitFile(),
        fitFile(secondSampleActivity, 'other.fit'),
        new File(['not an activity'], 'notes.txt'),
      ],
      settings: SETTINGS,
      sync: null,
    })

    expect(messages.filter((message) => message.type === 'progress')).toEqual([
      { type: 'progress', filesRead: 1, filesTotal: 2 },
      { type: 'progress', filesRead: 2, filesTotal: 2 },
    ])
  })

  it('reports the runs and rides an import added, with the span of their starts', async () => {
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile(), fitFile(secondSampleActivity, 'other.fit')],
      settings: SETTINGS,
      sync: null,
    })
    const digests = [sampleActivity, secondSampleActivity].map((activity) =>
      digestActivity(activity),
    )
    const starts = digests.map((digest) => digest.startMs)

    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      outcome: {
        activities: 2,
        runs: digests.filter((digest) => digest.sport === 'run').length,
        rides: digests.filter((digest) => digest.sport === 'ride').length,
        firstStartMs: Math.min(...starts),
        lastStartMs: Math.max(...starts),
      },
    })
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
    expect(messages).toContainEqual({ type: 'progress', filesRead: 0, filesTotal: 1, uploaded: 1 })
    expect(messages).toContainEqual({ type: 'progress', filesRead: 1, filesTotal: 1, uploaded: 1 })
    expect(messages.at(-1)).toMatchObject({ type: 'state' })
  })

  it('reports the start of a signed-in import that saves nothing', async () => {
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [new File(['not an activity'], 'notes.txt')],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    expect(mocked.createActivity).not.toHaveBeenCalled()
    expect(messages).toContainEqual({ type: 'progress', filesRead: 0, filesTotal: 0, uploaded: 0 })
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
    expect(messages).toContainEqual({ type: 'progress', filesRead: 1, filesTotal: 1, uploaded: 1 })
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

  it('answers a splits request from the held digest, and keeps splits out of the library state', async () => {
    const { send } = await startWorker()
    const [sample] = await send({ type: 'loadSample', settings: SETTINGS })
    if (sample?.type !== 'state') throw new Error('expected a state')
    const run = sampleDataset().activities.find((activity) => activity.sport === 'run')
    if (!run) throw new Error('The sample has no run')
    const digest = digestActivity(run)
    expect(sample.state.result?.activities.find((a) => a.id === digest.id)).not.toHaveProperty(
      'splits',
    )

    const reply = await send({ type: 'activitySplits', id: digest.id })
    expect(reply).toEqual([{ type: 'splits', id: digest.id, splits: digest.splits }])
    const missing = await send({ type: 'activitySplits', id: 'not-held' })
    expect(missing).toEqual([{ type: 'splits', id: 'not-held', splits: null }])
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

/** The device library the worker opened, so a test can read what it kept. */
function keptDevice(): DeviceLibrary {
  if (kept.library === null) throw new Error('the worker did not open the device library')
  return kept.library
}

/** A signed-out import, which keeps its digests in this browser. */
function signedOutImport(file: File = fitFile()): WorkerRequest {
  return {
    type: 'addFiles',
    files: [file],
    settings: SETTINGS,
    sync: null,
    saveToDevice: true,
  }
}

/** Storage that cannot be read or written, as when the browser refuses IndexedDB. */
function refusingLibrary(): DeviceLibrary {
  const refused = () => Promise.reject(new Error('Device storage is unavailable'))
  return {
    all: async () => [],
    get: async () => null,
    route: async () => null,
    put: refused,
    remove: refused,
    clear: refused,
  }
}

/** The start times, earliest first, of the activities the last reply analyses. */
function analysedStarts(messages: WorkerResponse[]): number[] {
  const last = messages.at(-1)
  if (last?.type !== 'state') throw new Error('The request did not reply with a state')
  return (last.state.result?.activities ?? [])
    .map((activity) => activity.startMs)
    .sort((a, b) => a - b)
}

/** The start times, earliest first, of the activities the last library list reports. */
function listedStarts(messages: WorkerResponse[]): number[] {
  const lists = messages.flatMap((message) =>
    message.type === 'libraryActivities' ? [message.activities] : [],
  )
  return (lists.at(-1) ?? []).map((activity) => activity.startMs).sort((a, b) => a - b)
}

describe('device library', () => {
  it('keeps the digests of a signed-out import that asks for it, and posts them as the library', async () => {
    const { send } = await startWorker()
    const messages = await send(signedOutImport())

    expect(mocked.createActivity).not.toHaveBeenCalled()
    expect(messages).toEqual([
      // The kept library is read before the file is added, so it is listed first (empty here).
      { type: 'libraryActivities', activities: [] },
      { type: 'progress', filesRead: 1, filesTotal: 1 },
      {
        type: 'libraryActivities',
        activities: [expect.objectContaining({ sport: sampleActivity.sport })],
      },
      {
        type: 'state',
        state: expect.objectContaining({ totalActivities: 1 }),
        outcome: expect.objectContaining({ activities: 1, rejected: 0, duplicates: [] }),
      },
    ])
    expect(await keptDevice().all()).toHaveLength(1)
  })

  it('keeps nothing for an import that does not ask for it', async () => {
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: null,
    })

    expect(messages).not.toContainEqual(expect.objectContaining({ type: 'libraryActivities' }))
    expect(await keptDevice().all()).toEqual([])
  })

  it('restores the kept library when a fresh worker loads it', async () => {
    const { send } = await startWorker()
    await send(signedOutImport())

    vi.resetModules()
    const restarted = await startWorker()
    const messages = await restarted.send({ type: 'loadDevice', settings: SETTINGS })

    expect(messages).toEqual([
      {
        type: 'libraryActivities',
        activities: [expect.objectContaining({ sport: sampleActivity.sport })],
      },
      {
        type: 'state',
        state: expect.objectContaining({ totalActivities: 1, result: expect.anything() }),
      },
    ])
  })

  it('keeps the FIT copy of a workout over an earlier GPX copy, and reloads that copy', async () => {
    const { send } = await startWorker()
    await send(signedOutImport(gpxFile()))
    await send(signedOutImport(fitFile()))
    await send(signedOutImport(gpxFile()))

    const [entry] = await keptDevice().all()
    expect(entry?.digest.id).toMatch(/-run\.fit$/)

    vi.resetModules()
    const restarted = await startWorker()
    const messages = await restarted.send({ type: 'loadDevice', settings: SETTINGS })
    expect(messages).toEqual([
      {
        type: 'libraryActivities',
        activities: [expect.objectContaining({ sport: sampleActivity.sport })],
      },
      { type: 'state', state: expect.objectContaining({ totalActivities: 1 }) },
    ])
    expect(await keptDevice().all()).toEqual([entry])
  })

  it('replaces a kept digest from an older analysis model when the workout is imported again', async () => {
    const { send } = await startWorker()
    const key = workoutKeyOf(SAMPLE_DIGEST)
    await keptDevice().put(key, { ...SAMPLE_DIGEST, modelRevision: MODEL_REVISION - 1 })

    const reloaded = await send({ type: 'loadDevice', settings: SETTINGS })
    expect(reloaded.at(-1)).toMatchObject({
      type: 'state',
      state: { totalActivities: 0, outdatedActivities: 1 },
    })
    await send(signedOutImport())

    expect((await keptDevice().get(key))?.modelRevision).toBe(MODEL_REVISION)
  })

  it('reloads the kept library before files added over the sample are analysed', async () => {
    const { send } = await startWorker()
    await send(signedOutImport())
    await send({ type: 'loadSample', settings: SETTINGS })

    const messages = await send({
      type: 'addFiles',
      files: [fitFile(secondSampleActivity, 'second.fit')],
      settings: SETTINGS,
      sync: null,
      saveToDevice: true,
    })

    expect(messages[0]).toEqual({
      type: 'libraryActivities',
      activities: [expect.objectContaining({ sport: sampleActivity.sport })],
    })
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { isSample: false, totalActivities: 2 },
    })
    expect(await keptDevice().all()).toHaveLength(2)
  })

  it('keeps the sample on screen when the kept library loads after it, and keeps the library as it was', async () => {
    const { send } = await startWorker()
    await send(signedOutImport())
    await send({ type: 'loadSample', settings: SETTINGS })

    const messages = await send({ type: 'loadDevice', settings: SETTINGS })

    expect(messages).toEqual([
      {
        type: 'libraryActivities',
        activities: [expect.objectContaining({ sport: sampleActivity.sport })],
      },
      {
        type: 'state',
        state: expect.objectContaining({ isSample: true, result: expect.anything() }),
      },
    ])
    expect(await keptDevice().all()).toHaveLength(1)
  })

  it('loads the kept library once a cleared sample is no longer showing', async () => {
    const { send } = await startWorker()
    await send(signedOutImport())
    await send({ type: 'loadSample', settings: SETTINGS })
    await send({ type: 'clear' })

    const messages = await send({ type: 'loadDevice', settings: SETTINGS })

    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { isSample: false, totalActivities: 1 },
    })
  })

  it('still answers an import when the device library refuses to save it', async () => {
    kept.library = refusingLibrary()
    const { send } = await startWorker()

    const messages = await send(signedOutImport())

    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { totalActivities: 1 },
      outcome: { activities: 1, rejected: 0, duplicates: [] },
    })
  })

  it('loads an empty library when the device library cannot be read', async () => {
    kept.library = refusingLibrary()
    const { send } = await startWorker()

    const messages = await send({ type: 'loadDevice', settings: SETTINGS })

    expect(messages).toEqual([
      { type: 'libraryActivities', activities: [] },
      { type: 'state', state: expect.objectContaining({ totalActivities: 0 }) },
    ])
  })

  it('empties the session on removing all activities even when the device library refuses to clear', async () => {
    const { send } = await startWorker()
    await send(signedOutImport())
    kept.library = { ...keptDevice(), clear: () => Promise.reject(new Error('refused')) }
    vi.resetModules()
    const restarted = await startWorker()
    await restarted.send({ type: 'loadDevice', settings: SETTINGS })

    const messages = await restarted.send({ type: 'clear', forgetDevice: true })

    expect(messages).toEqual([
      { type: 'libraryActivities', activities: [] },
      { type: 'state', state: expect.objectContaining({ totalActivities: 0 }) },
    ])
    // The kept activity is still there, so the next import is analysed with it, as a reload would.
    const added = await restarted.send(signedOutImport(fitFile(secondSampleActivity, 'second.fit')))
    const both = [sampleActivity.startMs, secondSampleActivity.startMs].sort((a, b) => a - b)
    expect(analysedStarts(added)).toEqual(both)
    expect(listedStarts(added)).toEqual(both)
  })

  it('empties the kept library when a clear forgets the device', async () => {
    const { send } = await startWorker()
    await send(signedOutImport())

    const messages = await send({ type: 'clear', forgetDevice: true })

    expect(messages).toEqual([
      { type: 'libraryActivities', activities: [] },
      { type: 'state', state: expect.objectContaining({ totalActivities: 0 }) },
    ])
    expect(await keptDevice().all()).toEqual([])
  })

  it('keeps the library when a clear does not forget the device', async () => {
    const { send } = await startWorker()
    await send(signedOutImport())

    const messages = await send({ type: 'clear' })

    expect(messages).toEqual([
      { type: 'state', state: expect.objectContaining({ totalActivities: 0 }) },
    ])
    expect(await keptDevice().all()).toHaveLength(1)
  })

  it('keeps a file the import rejected when the kept library is read after it', async () => {
    const { send } = await startWorker()
    await send(signedOutImport(new File(['not an activity'], 'notes.txt')))

    const messages = await send({ type: 'loadDevice', settings: SETTINGS })

    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { rejected: [expect.objectContaining({ fileName: 'notes.txt' })] },
    })
  })

  it('adds an import to the kept digest, and lists both once more on load', async () => {
    const { send } = await startWorker()
    const keptDigest = digestActivity(secondSampleActivity)
    await keptDevice().put(workoutKeyOf(keptDigest), keptDigest)

    const imported = await send(signedOutImport())
    expect(imported.at(-1)).toMatchObject({ type: 'state', state: { totalActivities: 2 } })

    const messages = await send({ type: 'loadDevice', settings: SETTINGS })
    expect(messages).toEqual([
      { type: 'libraryActivities', activities: [expect.anything(), expect.anything()] },
      { type: 'state', state: expect.objectContaining({ totalActivities: 2 }) },
    ])
  })

  it('after the account ends, an import is analysed with the kept library', async () => {
    const { send } = await startWorker()
    const keptDigest = digestActivity(secondSampleActivity)
    await keptDevice().put(workoutKeyOf(keptDigest), keptDigest)
    await send({ type: 'loadDevice', settings: SETTINGS })
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST)])
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    const messages = await send(signedOutImport(fitFile(thirdSampleActivity, 'third.fit')))

    const both = [keptDigest.startMs, digestActivity(thirdSampleActivity).startMs].sort(
      (a, b) => a - b,
    )
    expect(analysedStarts(messages)).toEqual(both)
    expect(listedStarts(messages)).toEqual(both)
    expect(await keptDevice().all()).toHaveLength(2)
  })

  it('an import into the account does not merge the library kept in this browser', async () => {
    const { send } = await startWorker()
    const keptDigest = digestActivity(secondSampleActivity)
    await keptDevice().put(workoutKeyOf(keptDigest), keptDigest)
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST)])
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    const messages = await send({
      type: 'addFiles',
      files: [fitFile(thirdSampleActivity, 'third.fit')],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
      saveToDevice: true,
    })

    const both = [sampleActivity.startMs, thirdSampleActivity.startMs].sort((a, b) => a - b)
    expect(analysedStarts(messages)).toEqual(both)
  })

  it('loads the kept library again after a clear that keeps it', async () => {
    const { send } = await startWorker()
    const keptDigest = digestActivity(secondSampleActivity)
    await keptDevice().put(workoutKeyOf(keptDigest), keptDigest)
    await send({ type: 'loadDevice', settings: SETTINGS })
    await send({ type: 'clear' })

    const messages = await send({ type: 'loadDevice', settings: SETTINGS })

    expect(analysedStarts(messages)).toEqual([keptDigest.startMs])
  })

  it('loads the kept library again after a rebuild replaces the session', async () => {
    const { send } = await startWorker()
    const keptDigest = digestActivity(secondSampleActivity)
    await keptDevice().put(workoutKeyOf(keptDigest), keptDigest)
    await send({ type: 'loadDevice', settings: SETTINGS })
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST, true)])
    await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

    const messages = await send({ type: 'loadDevice', settings: SETTINGS })

    expect(analysedStarts(messages)).toEqual([keptDigest.startMs])
  })
})

describe('account export', () => {
  const ACCOUNT = { name: 'Ada Lovelace', email: 'ada@example.com' }
  const PROFILE = {
    massKg: 75,
    bikeMassKg: 9,
    units: 'metric' as const,
    keepFiles: false,
    birthYear: null,
    sex: null,
    updatedAt: 1000,
  }
  const REQUEST = {
    type: 'exportData' as const,
    userId: USER_ID,
    account: ACCOUNT,
    profile: PROFILE,
  }

  /** The export file's text, or a failure if the worker replied with an error instead. */
  async function exportedText(messages: WorkerResponse[]): Promise<string> {
    const reply = messages.at(-1)
    if (reply?.type !== 'exportReady')
      throw new Error(`expected an export: ${JSON.stringify(reply)}`)
    return reply.file.text()
  }

  it('lists the library once and returns the export as one JSON file', async () => {
    const saved = recordFor(SAMPLE_DIGEST)
    mocked.listActivities.mockImplementation(async (_since, _userId, _onUnreadable, onPage) => {
      onPage?.([saved])
      return []
    })
    const { send } = await startWorker()
    const messages = await send(REQUEST)

    expect(mocked.listActivities).toHaveBeenCalledTimes(1)
    expect(mocked.listActivities).toHaveBeenCalledWith(
      undefined,
      USER_ID,
      expect.any(Function),
      expect.any(Function),
    )
    const exported = JSON.parse(await exportedText(messages)) as {
      format: string
      version: number
      account: unknown
      profile: unknown
      activities: { id: string; digest: unknown }[]
    }
    expect(exported).toMatchObject({
      format: 'rca-export',
      version: 1,
      account: ACCOUNT,
      profile: PROFILE,
    })
    // A digest can hold NaN, which JSON writes as null, so compare it as the file holds it.
    expect(exported.activities).toEqual([
      expect.objectContaining({
        id: saved.id,
        digest: JSON.parse(JSON.stringify(SAMPLE_DIGEST)),
      }),
    ])
  })

  it('exports a multi-page library as the same document the schema builder describes', async () => {
    const actual = await vi.importActual<typeof client>('../api/client')
    mocked.listActivities.mockImplementation(actual.listActivities)
    const page = (id: string, nextCursor: string | null) => ({
      items: [{ ...recordFor(SAMPLE_DIGEST), id }],
      nextCursor,
    })
    const pages = [page('rec-a', 'c1'), page('rec-b', 'c2'), page('rec-c', null)]
    const fetchMock = vi.fn(async () => {
      const body = pages.shift()
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { send } = await startWorker()
    const messages = await send(REQUEST)

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const written = JSON.parse(await exportedText(messages)) as { exportedAt: string }
    // The worker stamps the export with the clock, so take that stamp from the file itself.
    expect(written.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
    const expected = buildAccountExport({
      now: new Date(written.exportedAt),
      account: ACCOUNT,
      profile: PROFILE,
      unreadable: 0,
      activities: ['rec-a', 'rec-b', 'rec-c'].map((id) =>
        Object.assign(recordFor(SAMPLE_DIGEST), { id }),
      ),
    })
    expect(written).toEqual(JSON.parse(JSON.stringify(expected)))
  })

  it('writes the file compactly, with no pretty-printing', async () => {
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST)])
    const { send } = await startWorker()
    const text = await exportedText(await send(REQUEST))
    expect(text).not.toContain('\n')
    expect(text.startsWith('{"format":"rca-export","version":1,')).toBe(true)
  })

  it('counts the stored activities the server could not read', async () => {
    mocked.listActivities.mockImplementation(async (_since, _userId, onUnreadable) => {
      onUnreadable?.(2)
      return []
    })
    const { send } = await startWorker()
    const messages = await send(REQUEST)

    expect(JSON.parse(await exportedText(messages))).toMatchObject({ unreadable: 2 })
  })

  it('exports an unreadable count of zero when every row was read', async () => {
    mocked.listActivities.mockResolvedValue([])
    const { send } = await startWorker()
    const messages = await send(REQUEST)

    expect(JSON.parse(await exportedText(messages))).toMatchObject({
      unreadable: 0,
      activities: [],
    })
  })

  it('reports a daily limit on the library read as the daily-limit cause, with no export', async () => {
    mocked.listActivities.mockRejectedValue(new ApiRequestError(429, 'daily_limit', 'Tomorrow'))
    const { send } = await startWorker()
    const messages = await send(REQUEST)

    expect(messages).toEqual([{ type: 'error', message: 'Tomorrow', issue: 'daily-limit' }])
  })

  it('reports a failed library read as an error, with no export', async () => {
    mocked.listActivities.mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
    const { send } = await startWorker()
    const messages = await send(REQUEST)

    expect(messages).toEqual([{ type: 'error', message: 'Offline', issue: 'network' }])
  })
})

describe('route shapes', () => {
  const GPX_BYTES = new Uint8Array(encodeGpx(sampleActivity))
  /** The route the GPX file of the sample run has, as the import reads it. */
  const ROUTE = parseActivityFile(GPX_BYTES, 'run.gpx')
  const expectedRoute = ROUTE.ok ? ROUTE.activities[0]?.route : undefined

  /** The sample run as a record of the account, with or without its original file. */
  function savedRecord(hasFile: boolean): ActivityRecord {
    return { ...recordFor(SAMPLE_DIGEST, hasFile), fileName: 'run.gpx' }
  }

  function routeReply(messages: WorkerResponse[]) {
    return messages.at(-1)
  }

  /** The import of the sample run into this tab, signed in without keeping its file. */
  async function importHere(send: (request: WorkerRequest) => Promise<WorkerResponse[]>) {
    await send({
      type: 'addFiles',
      files: [gpxFile()],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
    })
    const [imported] = mocked.createActivity.mock.calls[0] ?? []
    return `rec-${imported?.id}`
  }

  it('gives a route to an activity imported here, and keeps no route in the upload', async () => {
    const { send } = await startWorker()
    const id = await importHere(send)

    const [digest, , , userId] = mocked.createActivity.mock.calls[0] ?? []
    expect(userId).toBe(USER_ID)
    expect(digest).not.toHaveProperty('route')
    expect(JSON.stringify(mocked.createActivity.mock.calls)).not.toContain('"points"')
    expect(JSON.stringify(mocked.createActivity.mock.calls)).not.toContain('"aspect"')
    expect(expectedRoute?.points.length).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(mocked.createActivity.mock.calls)).not.toContain(
      JSON.stringify(expectedRoute?.points),
    )

    const reply = await send({ type: 'routeShape', id, userId: USER_ID })
    expect(routeReply(reply)).toEqual({ type: 'routeShape', route: expectedRoute, original: false })
    expect(mocked.downloadActivityFile).not.toHaveBeenCalled()
  })

  it('reads the original file only when asked, and then once', async () => {
    mocked.listActivities.mockResolvedValue([savedRecord(true)])
    mocked.downloadActivityFile.mockResolvedValue(GPX_BYTES)
    const { send } = await startWorker()
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    const id = savedRecord(true).id

    const unasked = await send({ type: 'routeShape', id, userId: USER_ID })
    expect(routeReply(unasked)).toEqual({ type: 'routeShape', route: null, original: true })
    expect(mocked.downloadActivityFile).not.toHaveBeenCalled()

    const asked = await send({ type: 'routeShape', id, userId: USER_ID, fromOriginal: true })
    const again = await send({ type: 'routeShape', id, userId: USER_ID })

    expect(routeReply(asked)).toEqual({ type: 'routeShape', route: expectedRoute, original: false })
    expect(routeReply(again)).toEqual({ type: 'routeShape', route: expectedRoute, original: false })
    expect(mocked.downloadActivityFile).toHaveBeenCalledOnce()
    expect(mocked.downloadActivityFile).toHaveBeenCalledWith(id, USER_ID)
  })

  it('gives no route to a saved activity with no original file, and reads nothing', async () => {
    mocked.listActivities.mockResolvedValue([savedRecord(false)])
    const { send } = await startWorker()
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    const asked = await send({
      type: 'routeShape',
      id: savedRecord(false).id,
      userId: USER_ID,
      fromOriginal: true,
    })

    expect(routeReply(asked)).toEqual({ type: 'routeShape', route: null, original: false })
    expect(mocked.downloadActivityFile).not.toHaveBeenCalled()
  })

  it('forgets the shapes of this tab on a restart and when the tab is cleared', async () => {
    mocked.listActivities.mockResolvedValue([savedRecord(false)])
    const first = await startWorker()
    const id = await importHere(first.send)
    expect(routeReply(await first.send({ type: 'routeShape', id, userId: USER_ID }))).toMatchObject(
      { route: { points: expect.any(Array) }, original: false },
    )

    await first.send({ type: 'clear', forgetDevice: false })
    expect(routeReply(await first.send({ type: 'routeShape', id, userId: USER_ID }))).toEqual({
      type: 'routeShape',
      route: null,
      original: false,
    })

    vi.resetModules()
    const restarted = await startWorker()
    expect(routeReply(await restarted.send({ type: 'routeShape', id, userId: USER_ID }))).toEqual({
      type: 'routeShape',
      route: null,
      original: false,
    })
  })

  it('forgets the shape of a saved activity once it is deleted from the account', async () => {
    // An earlier test leaves the delete refused; this one needs the account to accept it.
    mocked.deleteActivity.mockResolvedValue(undefined)
    const { send } = await startWorker()
    const id = await importHere(send)
    expect(routeReply(await send({ type: 'routeShape', id, userId: USER_ID }))).toMatchObject({
      route: { points: expect.any(Array) },
    })

    await send({ type: 'deleteActivity', id, userId: USER_ID, settings: SETTINGS })

    expect(routeReply(await send({ type: 'routeShape', id, userId: USER_ID }))).toEqual({
      type: 'routeShape',
      route: null,
      original: false,
    })
  })

  it('keeps a signed-out route with its digest, across a restart, until the activity is deleted', async () => {
    const { send } = await startWorker()
    await send(signedOutImport(gpxFile()))
    const id = workoutKeyOf(SAMPLE_DIGEST)

    expect(routeReply(await send({ type: 'routeShape', id }))).toEqual({
      type: 'routeShape',
      route: expectedRoute,
      original: false,
    })

    vi.resetModules()
    const restarted = await startWorker()
    expect(routeReply(await restarted.send({ type: 'routeShape', id }))).toEqual({
      type: 'routeShape',
      route: expectedRoute,
      original: false,
    })

    await restarted.send({ type: 'deleteDeviceActivity', id, settings: SETTINGS })
    expect(routeReply(await restarted.send({ type: 'routeShape', id }))).toEqual({
      type: 'routeShape',
      route: null,
      original: false,
    })
  })

  it('gives no route to a signed-out activity whose file has no positions', async () => {
    const { send } = await startWorker()
    await send(signedOutImport(fitFile()))

    const reply = await send({ type: 'routeShape', id: workoutKeyOf(SAMPLE_DIGEST) })

    expect(routeReply(reply)).toEqual({ type: 'routeShape', route: null, original: false })
  })

  it('offers no route for an indoor activity, and reads nothing even when asked', async () => {
    const indoor = { ...savedRecord(true), digest: { ...SAMPLE_DIGEST, indoor: true } }
    mocked.listActivities.mockResolvedValue([indoor])
    mocked.downloadActivityFile.mockResolvedValue(GPX_BYTES)
    const { send } = await startWorker()
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    const unasked = await send({ type: 'routeShape', id: indoor.id, userId: USER_ID })
    const asked = await send({
      type: 'routeShape',
      id: indoor.id,
      userId: USER_ID,
      fromOriginal: true,
    })

    expect(routeReply(unasked)).toEqual({ type: 'routeShape', route: null, original: false })
    expect(routeReply(asked)).toEqual({ type: 'routeShape', route: null, original: false })
    expect(mocked.downloadActivityFile).not.toHaveBeenCalled()
  })

  it('forgets the shapes of this tab when the session ends without a sign-out', async () => {
    const { send } = await startWorker()
    const id = await importHere(send)
    expect(routeReply(await send({ type: 'routeShape', id, userId: USER_ID }))).toMatchObject({
      route: { points: expect.any(Array) },
    })

    const forgotten = await send({ type: 'forgetRoutes' })

    expect(routeReply(forgotten)).toEqual({ type: 'routeShape', route: null, original: false })
    expect(routeReply(await send({ type: 'routeShape', id, userId: USER_ID }))).toEqual({
      type: 'routeShape',
      route: null,
      original: false,
    })
  })

  it('forgets a signed-out route when Start over clears the library', async () => {
    const { send } = await startWorker()
    await send(signedOutImport(gpxFile()))
    const id = workoutKeyOf(SAMPLE_DIGEST)
    expect(routeReply(await send({ type: 'routeShape', id }))).toMatchObject({
      route: { points: expect.any(Array) },
    })

    await send({ type: 'clear', forgetDevice: true })

    expect(routeReply(await send({ type: 'routeShape', id }))).toEqual({
      type: 'routeShape',
      route: null,
      original: false,
    })
    expect(await keptDevice().all()).toEqual([])
  })
})
