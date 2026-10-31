import { strToU8, zipSync } from 'fflate'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import type { ActivityRecord } from '@rca/contract'
import { digestActivity, serializeDigest } from '@rca/core/digest'
import { encodeFit } from '@rca/core/fit'
import { encodeGpx } from '@rca/core/gpx/encode'
import { parseActivityFile } from '@rca/core/import'
import { AnalysisSession } from '@rca/core/session'
import { SAMPLE_REFERENCE_NOW_MS, sampleDataset } from '@rca/core/synthetic'
import type { Activity, ActivityDigest } from '@rca/core/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ApiRequestError } from '../api/client'
import { buildAccountExport } from '../export/accountExport'
import { workoutKeyOf } from './device'
import { deviceClock, sampleActivityById } from './sampleClock'
import type { DeviceLibrary } from './deviceLibrary'
import { memoryDeviceLibrary } from '../test/deviceLibrary.fake'
import * as importSummary from './importSummary'
import { REPLY_TYPES } from './protocol'
import { SAVE_CONCURRENCY } from './saveLimits'
import type { WorkerRequest, WorkerResponse } from './protocol'

/** A reply waits on a full analysis, which takes most of a second on its own; vi.waitFor's 1 s is too short under load. */
const WAIT_FOR_MS = 10_000

const limits = vi.hoisted(() => ({ maxFileBytes: 50 * 1024 * 1024 }))
/** How many of the sample's newest activities the worker draws in these tests: both sports, a few weeks. */
const SAMPLE_PLAN_TAIL = vi.hoisted(() => 8)

vi.mock('@rca/contract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rca/contract')>()
  return {
    ...actual,
    get MAX_FILE_BYTES() {
      return limits.maxFileBytes
    },
  }
})

/**
 * The sample is drawn second by second, and the worker draws it afresh on each load: these tests need a sample
 * on screen, not a season, so its plan is its last few activities. The worker's own clock and the plan are
 * still the real ones, so a recording drawn later is of the same activity (sampleClock.test.ts draws the
 * full season's plan, and sampleSections.test.ts its figures).
 */
vi.mock('@rca/core/synthetic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rca/core/synthetic')>()
  return {
    ...actual,
    samplePlan: (...args: Parameters<typeof actual.samplePlan>) =>
      actual.samplePlan(...args).slice(-SAMPLE_PLAN_TAIL),
  }
})

vi.mock('./importSummary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./importSummary')>()
  return { ...actual, summarizeAdded: vi.fn(actual.summarizeAdded) }
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

/** The outbox in memory, shared by every account the test opens: rows by account and workout. */
const outboxRows = vi.hoisted(() => new Map<string, Map<string, unknown>>())
vi.mock('./outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./outbox')>()
  const { serializeDigest } = await import('@rca/core/digest')
  return {
    ...actual,
    clearOutbox: async () => {
      for (const rows of outboxRows.values()) rows.clear()
      return true
    },
    openOutbox: (userId: string) => {
      const mine = outboxRows.get(userId) ?? new Map<string, unknown>()
      outboxRows.set(userId, mine)
      let seq = 0
      return {
        add: async ({
          digest,
          fileName,
          fileHash,
          fromDevice,
        }: {
          digest: Parameters<typeof serializeDigest>[0]
          fileName: string
          fileHash: string
          fromDevice?: boolean
        }) => {
          const key = `${digest.sport}-${Math.round(digest.startMs / 1000)}`
          mine.set(key, {
            id: `${userId}|${key}`,
            userId,
            key,
            digestId: digest.id,
            seq: seq++,
            digestJson: serializeDigest(digest),
            fileName,
            fileHash,
            attempts: 0,
            ...(fromDevice === true ? { fromDevice } : {}),
          })
        },
        done: async (key: string, digestId?: string) => {
          const row = mine.get(key) as { digestId: string } | undefined
          if (digestId === undefined || row?.digestId === digestId) mine.delete(key)
        },
        failed: async () => false,
        pending: async () => [...mine.values()],
        forget: async () => mine.clear(),
      }
    },
  }
})

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
/**
 * The sample as a saved copy of a file: a rebuild reads the file back under the record's name, so the
 * digest it makes carries the id that name gives, and an update checks it does before it sends.
 */
function savedAs(bytes: Uint8Array, fileName: string): ActivityDigest {
  const parsed = parseActivityFile(bytes, fileName, undefined, { activityType: 'Run', race: false })
  const read = parsed.ok ? parsed.activities[0] : undefined
  if (read === undefined) throw new Error('The sample file did not read')
  return { ...SAMPLE_DIGEST, id: digestActivity(read).id }
}
const SAVED_DIGEST = savedAs(RUN_FILE_BYTES, 'run.fit')

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
    // The reply ends the request. What the worker says apart from it, such as an outbox resume, may follow.
    const replyAt = () => posted.findIndex((m, i) => i >= start && REPLY_TYPES.has(m.type))
    await vi.waitFor(() => {
      if (replyAt() < 0) throw new Error('still working')
    }, WAIT_FOR_MS)
    return posted.slice(start, replyAt() + 1)
  }
  return { send, posted }
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
  vi.resetAllMocks()
  limits.maxFileBytes = 50 * 1024 * 1024
  kept.library = null
  outboxRows.clear()
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

  it("leaves an export's saved routes out of the progress total, and reports them apart", async () => {
    const zip = zipSync({
      'activities/1.fit': new Uint8Array(encodeFit(sampleActivity, { gps: true })),
      'routes/1.gpx': strToU8('<gpx/>'),
      'routes/2.gpx': strToU8('<gpx/>'),
      'activities.csv': strToU8(
        'Activity Name,Activity Type,Filename\nMorning Run,Run,activities/1.fit\n',
      ),
    })
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [new File([new Uint8Array(zip)], 'export.zip')],
      settings: SETTINGS,
      sync: null,
    })

    expect(messages.filter((message) => message.type === 'progress')).toEqual([
      { type: 'progress', filesRead: 1, filesTotal: 1 },
    ])
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      outcome: { activities: 1, filesAdded: 1, rejected: 0, notActivities: 2 },
    })
  })

  describe('progress messages', () => {
    /** The worker loads its own session module after the reset, so the count is stubbed there. */
    async function unknownTotal() {
      const { AnalysisSession: Session } = await import('@rca/core/session')
      vi.spyOn(Session.prototype, 'countFiles').mockResolvedValueOnce(null)
    }

    const FILES = 12

    function importOf(sync: { keepFiles: boolean; userId: string } | null) {
      const activities = sampleDataset().activities.slice(0, FILES)
      return {
        type: 'addFiles' as const,
        files: activities.map((activity, index) => fitFile(activity, `a${index}.fit`)),
        settings: SETTINGS,
        sync,
      }
    }

    it('sends far fewer than one per file, and ends with the exact counts', async () => {
      // A clock that stands still keeps every file inside one interval, however slow the machine.
      const clock = vi.spyOn(performance, 'now').mockReturnValue(1_000)
      try {
        const { send } = await startWorker()
        const messages = await send(importOf({ keepFiles: false, userId: USER_ID }))
        const progress = messages.filter((message) => message.type === 'progress')

        // Unthrottled, this is one message at the start and two for each file.
        expect(progress.length).toBeLessThan(FILES)
        expect(progress.at(-1)).toEqual({
          type: 'progress',
          filesRead: FILES,
          filesTotal: FILES,
          uploaded: FILES,
        })
        expect(messages.at(-1)).toMatchObject({ type: 'state' })
        expect(messages.indexOf(progress.at(-1) as WorkerResponse)).toBeLessThan(
          messages.findIndex((message) => message.type === 'state'),
        )
      } finally {
        clock.mockRestore()
      }
    })

    it('ends on the exact count when the total is not known, with nothing to send it at once', async () => {
      const clock = vi.spyOn(performance, 'now').mockReturnValue(1_000)
      await unknownTotal()
      try {
        const { send } = await startWorker()
        const messages = await send(importOf({ keepFiles: false, userId: USER_ID }))
        const progress = messages.filter((message) => message.type === 'progress')

        expect(progress.length).toBeLessThan(FILES)
        expect(progress.at(-1)).toEqual({ type: 'progress', filesRead: FILES, uploaded: FILES })
        expect(messages.indexOf(progress.at(-1) as WorkerResponse)).toBeLessThan(
          messages.findIndex((message) => message.type === 'state'),
        )
      } finally {
        clock.mockRestore()
      }
    })

    it('sends the exact count before an import fails, and nothing after the failure', async () => {
      const clock = vi.spyOn(performance, 'now').mockReturnValue(1_000)
      // With no total there is no last file to send at once, so a message is waiting at the end.
      await unknownTotal()
      vi.mocked(importSummary.summarizeAdded).mockImplementationOnce(() => {
        throw new Error('The summary failed')
      })
      try {
        const { send, posted } = await startWorker()
        const messages = await send(importOf({ keepFiles: false, userId: USER_ID }))

        expect(messages.at(-1)).toEqual({ type: 'error', message: 'The summary failed' })
        // The failed import still tells the page which originals are missing.
        expect(messages.at(-2)).toEqual({ type: 'progress', filesRead: FILES, uploaded: FILES })
        expect(messages).toContainEqual({ type: 'missingOriginals', count: FILES })

        // The throttled message would have gone out one interval after the first.
        await new Promise((resolve) => setTimeout(resolve, 400))
        expect(posted.at(-1)).toEqual({ type: 'error', message: 'The summary failed' })
      } finally {
        clock.mockRestore()
      }
    })

    it('says how many it saved in the reply that ends a signed-in import, and not otherwise', async () => {
      const { send } = await startWorker()
      const signedIn = await send(importOf({ keepFiles: false, userId: USER_ID }))
      expect(signedIn.at(-1)).toMatchObject({ type: 'state', saved: FILES })

      const signedOut = await send(importOf(null))
      expect(signedOut.at(-1)).not.toHaveProperty('saved')
    })

    it('sends the count of a signed-out import at the end too', async () => {
      const clock = vi.spyOn(performance, 'now').mockReturnValue(1_000)
      try {
        const { send } = await startWorker()
        const messages = await send(importOf(null))
        const progress = messages.filter((message) => message.type === 'progress')

        expect(progress.length).toBeLessThan(FILES)
        expect(progress.at(-1)).toEqual({ type: 'progress', filesRead: FILES, filesTotal: FILES })
      } finally {
        clock.mockRestore()
      }
    })
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
    expect(messages.filter((message) => message.type === 'progress').at(-1)).toEqual({
      type: 'progress',
      filesRead: 1,
      filesTotal: 1,
      uploaded: 1,
    })
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

    expect(mocked.listActivities).toHaveBeenCalledWith(
      undefined,
      USER_ID,
      expect.any(Function),
      undefined,
      expect.any(Function),
    )
    expect(messages).toEqual([
      expect.objectContaining({ type: 'libraryActivities' }),
      { type: 'missingOriginals', count: 1 },
      {
        type: 'state',
        state: expect.objectContaining({ totalActivities: 1, isSample: false }),
      },
    ])
  })

  it('loads the account digests on the period the page asks for, in one analysis', async () => {
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST)])
    const { send } = await startWorker()
    const messages = await send({
      type: 'loadServer',
      settings: SETTINGS,
      userId: USER_ID,
      choice: 42,
    })

    expect(messages.filter((message) => message.type === 'state')).toEqual([
      {
        type: 'state',
        state: expect.objectContaining({
          totalActivities: 1,
          period: expect.objectContaining({ choice: 42, days: 42 }),
        }),
      },
    ])
  })

  it('loads the account digests on the default period when the page asks for none', async () => {
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST)])
    const { send } = await startWorker()
    const messages = await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { period: { choice: 'default' } },
    })
  })

  it('analyses the account library once on the stored period, after the sample was on screen', async () => {
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST)])
    const { send } = await startWorker()
    await send({ type: 'loadSample', settings: SETTINGS, choice: 'all' })
    // Counted from here. A period set before the account loads would analyse the sample first.
    const { PeriodCache } = await import('@rca/core/period')
    const analysis = vi.spyOn(PeriodCache.prototype, 'analysis')
    const messages = await send({
      type: 'loadServer',
      settings: SETTINGS,
      userId: USER_ID,
      choice: 42,
    })

    expect(analysis).toHaveBeenCalledTimes(1)
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { totalActivities: 1, period: { choice: 42, days: 42 } },
    })
  })

  it('loads the sample on the period the page asks for, in one analysis', async () => {
    const { send } = await startWorker()
    const messages = await send({ type: 'loadSample', settings: SETTINGS, choice: 'all' })
    expect(messages).toEqual([
      {
        type: 'state',
        state: expect.objectContaining({
          isSample: true,
          period: expect.objectContaining({ choice: 'all', days: null }),
        }),
      },
    ])
  })

  it('loads the kept library on the period the page asks for, in one analysis', async () => {
    const { send } = await startWorker()
    await keptDevice().put(workoutKeyOf(SAMPLE_DIGEST), SAMPLE_DIGEST)
    const messages = await send({ type: 'loadDevice', settings: SETTINGS, choice: 42 })
    expect(messages.filter((message) => message.type === 'state')).toEqual([
      {
        type: 'state',
        state: expect.objectContaining({
          totalActivities: 1,
          period: expect.objectContaining({ choice: 42, days: 42 }),
        }),
      },
    ])
  })

  it('answers with an error, not an empty library, when the kept library cannot be read', async () => {
    kept.library = {
      ...memoryDeviceLibrary(),
      all: () => Promise.reject(new Error('Connection to Indexed Database server lost')),
    }
    const { send } = await startWorker()
    const messages = await send({ type: 'loadDevice', settings: SETTINGS })

    expect(messages).toEqual([
      { type: 'error', message: expect.stringMatching(/kept results could not be read/) },
    ])
  })

  it('analyses a signed-out import on its own, and says so, when the kept library cannot be read', async () => {
    kept.library = {
      ...memoryDeviceLibrary(),
      all: () => Promise.reject(new Error('Connection to Indexed Database server lost')),
      // Each save first reads what is kept under its workout, so nothing kept can be written over.
      lookup: () => Promise.reject(new Error('Connection to Indexed Database server lost')),
    }
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: null,
      saveToDevice: true,
    })

    expect(messages).toContainEqual({ type: 'deviceIssue', issue: 'notRead' })
    expect(messages).toContainEqual({ type: 'deviceIssue', issue: 'notSaved', count: 1 })
    expect(messages.at(-1)).toMatchObject({ type: 'state', state: { totalActivities: 1 } })
    expect(messages.some((message) => message.type === 'error')).toBe(false)
  })

  it('leaves the sample on its period when the kept library loads after it', async () => {
    const { send } = await startWorker()
    await send({ type: 'loadSample', settings: SETTINGS })
    const messages = await send({ type: 'loadDevice', settings: SETTINGS, choice: 42 })
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { isSample: true, period: { choice: 'default' } },
    })
  })

  it('rebuilds stale digests from their stored originals and refreshes the active analysis', async () => {
    const stale = { ...SAVED_DIGEST, modelRevision: 1 }
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

  it('rebuilds an original GPX file that names no sport as the sport it was saved as', async () => {
    const gpx = new TextDecoder().decode(encodeGpx(sampleActivity))
    mocked.downloadActivityFile.mockResolvedValue(
      new TextEncoder().encode(gpx.replace(/<type>[^<]*<\/type>/, '')),
    )
    const stale = {
      ...savedAs(
        new TextEncoder().encode(gpx.replace(/<type>[^<]*<\/type>/, '')),
        'activities/1.gpx',
      ),
      modelRevision: 1,
    }
    mocked.listActivities
      .mockResolvedValueOnce([{ ...recordFor(stale, true), fileName: 'activities/1.gpx' }])
      .mockResolvedValueOnce([recordFor(SAMPLE_DIGEST, true)])
    const { send } = await startWorker()
    const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

    expect(messages.at(-1)).toMatchObject({
      type: 'rebuildComplete',
      rebuilt: 1,
      missing: 0,
      failed: 0,
    })
  })

  it('keeps the saved name when it rebuilds from a file that carries no title', async () => {
    // A Strava export names the activity in activities.csv, so the FIT file alone would give a generated name.
    const named = { ...SAVED_DIGEST, name: 'Lunch with Sam', modelRevision: 1 }
    mocked.listActivities
      .mockResolvedValueOnce([recordFor(named, true)])
      .mockResolvedValueOnce([recordFor({ ...SAMPLE_DIGEST, name: 'Lunch with Sam' }, true)])
    const { send } = await startWorker()
    await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

    expect(mocked.createActivity).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Lunch with Sam', modelRevision: MODEL_REVISION }),
      'run.fit',
      expect.any(String),
      USER_ID,
      `rec-${named.id}`,
    )
  })

  it('counts a rebuild whose activity was deleted in another tab as missing, and does not re-create it', async () => {
    const stale = { ...SAVED_DIGEST, modelRevision: 1 }
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
    const stale = { ...SAVED_DIGEST, modelRevision: 1 }
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

  it('reports a re-added stale file as updated, with counts only and nothing new', async () => {
    const stale = { ...SAVED_DIGEST, modelRevision: 1 }
    mocked.listActivities
      .mockResolvedValueOnce([recordFor(stale, false)])
      .mockResolvedValueOnce([recordFor(stale, false)])
    const { send } = await startWorker()
    await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })
    const messages = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: null,
    })

    const reply = messages.find((message) => message.type === 'state')
    expect(reply).toMatchObject({
      state: { totalActivities: 1, outdatedActivities: 0 },
      outcome: { runs: 0, rides: 0, filesAdded: 1 },
    })
    // The sport is whatever the sample's activity is; one of the two update counts is one, the other zero.
    const outcome: Record<string, unknown> = {
      ...(reply as { outcome?: object } | undefined)?.outcome,
    }
    expect([outcome.updatedRuns, outcome.updatedRides].sort()).toEqual([0, 1])
    // Counts cross to the page, never the digests.
    expect(outcome).not.toHaveProperty('upgraded')
    expect(outcome).not.toHaveProperty('added')
  })

  it('stops downloading after a daily limit and counts the remaining stored originals as limited', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-22T15:30:00Z'))
    const stale = { ...SAVED_DIGEST, modelRevision: 1 }
    mocked.listActivities
      .mockResolvedValueOnce([
        recordFor(stale, true),
        recordFor({ ...stale, id: 'no-file' }, false),
        recordFor({ ...stale, id: 'other' }, true),
        recordFor({ ...stale, id: 'third' }, true),
      ])
      .mockResolvedValueOnce([recordFor(stale, true)])
    mocked.downloadActivityFile.mockRejectedValue(
      new ApiRequestError(429, 'daily_limit', 'Daily download limit reached'),
    )
    const { send } = await startWorker()
    const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

    // Two activities are rebuilt at a time, so two downloads met the limit; the third is never asked for.
    expect(mocked.downloadActivityFile).toHaveBeenCalledTimes(2)
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

  it('waits out a rate limit once, then stops downloading and counts the rest as limited', async () => {
    const stale = { ...SAVED_DIGEST, modelRevision: 1 }
    mocked.listActivities
      .mockResolvedValueOnce([
        recordFor(stale, true),
        recordFor({ ...stale, id: 'no-file' }, false),
        recordFor({ ...stale, id: 'other' }, true),
      ])
      .mockResolvedValueOnce([recordFor(SAMPLE_DIGEST, true)])
    // The wait the server asked for is a few milliseconds here; the page is told a minute either way.
    mocked.downloadActivityFile.mockRejectedValue(
      new ApiRequestError(429, 'rate_limited', 'Slow down', 5),
    )
    const { send } = await startWorker()
    const before = Date.now()
    const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })
    const after = Date.now()

    // Each of the two activities tried at once is tried again after the wait, and no more.
    expect(mocked.downloadActivityFile).toHaveBeenCalledTimes(4)
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
    const stale = { ...SAVED_DIGEST, modelRevision: 1 }
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
    const stale = { ...SAVED_DIGEST, modelRevision: 1 }
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
    // Two activities that start together are one workout unless they are of different sports.
    const tieB = { ...SAMPLE_DIGEST, id: 'tie-b', sport: 'ride' as const }
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
    // The sample is drawn relative to the day it is loaded, so the day is held still to draw it again.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(SAMPLE_REFERENCE_NOW_MS)
    const { send } = await startWorker()
    const [sample] = await send({ type: 'loadSample', settings: SETTINGS })
    if (sample?.type !== 'state') throw new Error('expected a state')
    const listed = sample.state.library.find((activity) => activity.sport === 'run')
    const run = listed && sampleActivityById(deviceClock(), listed.id)
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

    const range = await send({ type: 'setRange', choice: 42, settings: SETTINGS })
    expect(range).toEqual([
      {
        type: 'state',
        state: expect.objectContaining({ period: expect.objectContaining({ choice: 42 }) }),
      },
    ])

    const settings = await send({
      type: 'setSettings',
      settings: { massKg: 80, bikeMassKg: 9 },
    })
    expect(settings).toEqual([
      {
        type: 'state',
        state: expect.objectContaining({ period: expect.objectContaining({ choice: 42 }) }),
      },
    ])

    const cleared = await send({ type: 'clear' })
    expect(cleared).toEqual([
      {
        type: 'state',
        state: expect.objectContaining({ isSample: false, totalActivities: 0, library: [] }),
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

  it('keeps saving after a network or server failure, and names each cause', async () => {
    mocked.createActivity
      .mockRejectedValueOnce(new ApiRequestError(500, 'internal_error', 'Oops'))
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
          { code: 'server', count: 1 },
          { code: 'network', count: 1 },
        ],
      },
    })
  })

  it('names a storage quota as its own cause, and keeps saving the next activity', async () => {
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

    expect(mocked.createActivity).toHaveBeenCalledTimes(2)
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { syncIssues: [{ code: 'storage-quota', count: 1 }] },
    })
  })

  it.each([
    ['a full saved-analysis quota', 403, 'digest_quota', 'digest-quota'],
    ['a full database', 503, 'database_full', 'database-full'],
    ['a full library', 403, 'activity_quota', 'activity-quota'],
    ['the daily limit on saves', 429, 'daily_limit', 'daily-limit'],
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

  it('waits out a rate limit and saves the same activity again, then goes on', async () => {
    mocked.createActivity.mockRejectedValueOnce(
      new ApiRequestError(429, 'rate_limited', 'Slow down', 1),
    )
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'run-a.fit'), fitFile(secondSampleActivity, 'run-b.fit')],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
    })

    expect(mocked.createActivity).toHaveBeenCalledTimes(3)
    expect(messages.some((message) => message.type === 'accountIssue')).toBe(false)
    expect(messages.at(-1)).toMatchObject({ type: 'state', state: { syncIssues: [] } })
    expect(messages.findLast((message) => message.type === 'progress')).toMatchObject({
      uploaded: 2,
    })
  })

  it('tells the page the saves are paused before it waits, and the next progress ends that', async () => {
    const { send, posted } = await startWorker()
    let postedAtRetry: WorkerResponse[] = []
    // The first activity is refused once; its second try is the call made after the pause.
    let firstId: string | undefined
    let tries = 0
    mocked.createActivity.mockImplementation(async (digest) => {
      firstId ??= digest.id
      if (digest.id === firstId && ++tries === 1) {
        throw new ApiRequestError(429, 'rate_limited', 'Slow down', 1)
      }
      if (digest.id === firstId) postedAtRetry = [...posted]
      return { record: recordFor(digest), created: true }
    })
    const messages = await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'run-a.fit'), fitFile(secondSampleActivity, 'run-b.fit')],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
    })

    // The pause carries the counts so far, and was sent before the second try began. Reading goes on beside the
    // saves, so a progress for the second file may come after it, and that ends the pause as well.
    expect(postedAtRetry.findLast((message) => 'paused' in message)).toMatchObject({
      type: 'progress',
      filesTotal: 2,
      uploaded: 0,
      paused: true,
    })
    const progress = messages.filter((message) => message.type === 'progress')
    expect(progress.filter((message) => 'paused' in message)).toHaveLength(1)
    expect(progress.at(-1)).not.toHaveProperty('paused')
  })

  it('stops saving when the rate limit holds after the wait', async () => {
    mocked.createActivity.mockRejectedValue(
      new ApiRequestError(429, 'rate_limited', 'Slow down', 1),
    )
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'run-a.fit'), fitFile(secondSampleActivity, 'run-b.fit')],
      settings: SETTINGS,
      sync: { keepFiles: true, userId: USER_ID },
    })

    // Both are sent once beside each other. One waits the limit out and tries again; the other is not sent a second time.
    expect(mocked.createActivity.mock.calls.length).toBeLessThanOrEqual(2 + SAVE_CONCURRENCY)
    expect(mocked.createActivity.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(messages).toContainEqual({ type: 'accountIssue', issue: 'rate-limited' })
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      state: { syncIssues: [{ code: 'rate-limited', count: 2 }], totalActivities: 2 },
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

  describe('outdated saved activities that still have their original file', () => {
    const stale = { ...SAVED_DIGEST, modelRevision: 1 }
    const DAY_MS = 86_400_000
    const other = (id: string, days: number, modelRevision = 1) => ({
      ...stale,
      id,
      startMs: stale.startMs + days * DAY_MS,
      modelRevision,
    })

    /** The reply that ends a request, which carries the state and the count that goes with it. */
    function ending(messages: WorkerResponse[]): WorkerResponse {
      const last = messages.at(-1)
      if (last === undefined) throw new Error('no reply')
      return last
    }

    it('sends the count with the state it belongs to, and not before it', async () => {
      mocked.listActivities.mockImplementation(async () => [
        recordFor(stale, true),
        recordFor(other('no-file', 1), false),
        recordFor(other('current', 2, MODEL_REVISION), true),
        recordFor(other('no-file-current', 3, MODEL_REVISION)),
      ])
      const { send } = await startWorker()
      const loaded = await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

      expect(ending(loaded)).toMatchObject({
        type: 'state',
        outdatedWithOriginal: 1,
        state: { outdatedActivities: 2 },
      })
      // The missing count goes ahead of the state, alone: the two outdated counts must land together.
      expect(loaded).toContainEqual({ type: 'missingOriginals', count: 2 })
      expect(loaded.slice(0, -1).some((message) => 'outdatedWithOriginal' in message)).toBe(false)
    })

    it('leaves the count off when none of the outdated activities has its file', async () => {
      mocked.listActivities.mockResolvedValue([recordFor(stale, false)])
      const { send } = await startWorker()
      const loaded = await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

      expect(ending(loaded)).toMatchObject({ state: { outdatedActivities: 1 } })
      expect(ending(loaded)).not.toHaveProperty('outdatedWithOriginal')
    })

    it('does not count a stale record whose workout the library holds from a current copy', async () => {
      mocked.listActivities.mockResolvedValue([
        recordFor(stale, true),
        recordFor({ ...stale, id: 'same-start', modelRevision: MODEL_REVISION }, true),
      ])
      const { send } = await startWorker()
      const loaded = await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

      expect(ending(loaded)).toMatchObject({ state: { outdatedActivities: 0 } })
      expect(ending(loaded)).not.toHaveProperty('outdatedWithOriginal')
    })

    it('drops the count in the rebuild reply once its activities are updated', async () => {
      const library = () => [recordFor(stale, true), recordFor(other('no-file', 1), false)]
      mocked.listActivities.mockImplementation(async () => library())
      const { send } = await startWorker()
      await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

      const updated = library()
      updated[0] = recordFor(SAMPLE_DIGEST, true)
      mocked.listActivities.mockResolvedValueOnce(library()).mockResolvedValueOnce(updated)
      const rebuilt = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

      expect(ending(rebuilt)).toMatchObject({
        type: 'rebuildComplete',
        rebuilt: 1,
        state: { outdatedActivities: 1 },
      })
      expect(ending(rebuilt)).not.toHaveProperty('outdatedWithOriginal')
    })

    it('counts an activity a rebuild cannot match as missing its original, and stops offering it', async () => {
      // The second record's file holds no activity that starts when the record says it did.
      const library = () => [recordFor(stale, true), recordFor(other('second', 1), true)]
      mocked.listActivities.mockImplementation(async () => library())
      const { send } = await startWorker()
      const loaded = await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
      expect(ending(loaded)).toMatchObject({ outdatedWithOriginal: 2 })

      const updated = library()
      updated[0] = recordFor(SAMPLE_DIGEST, true)
      mocked.listActivities.mockResolvedValueOnce(library()).mockResolvedValueOnce(updated)
      const rebuilt = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

      expect(ending(rebuilt)).toMatchObject({
        type: 'rebuildComplete',
        rebuilt: 1,
        missing: 1,
        state: { outdatedActivities: 1 },
      })
      // Update now would only report the same file missing again, so none is offered.
      expect(ending(rebuilt)).not.toHaveProperty('outdatedWithOriginal')
      // The file is still stored, so nothing is reported missing: adding it again updates the activity.
      expect(rebuilt.some((message) => message.type === 'missingOriginals')).toBe(false)
    })

    it('offers a deleted activity again when a record with its id comes back', async () => {
      const library = () => [recordFor(stale, true)]
      mocked.listActivities.mockImplementation(async () => library())
      const { send } = await startWorker()
      await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
      mocked.createActivity.mockRejectedValueOnce(
        new ApiRequestError(404, 'not_found', 'Activity not found'),
      )
      await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })
      await send({
        type: 'deleteActivity',
        id: `rec-${stale.id}`,
        userId: USER_ID,
        settings: SETTINGS,
      })

      // A rebuild that stops at a limit leaves the record neither updated nor unmatched.
      mocked.downloadActivityFile.mockRejectedValueOnce(
        new ApiRequestError(429, 'daily_limit', 'Daily download limit reached'),
      )
      const limited = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })
      expect(ending(limited)).toMatchObject({ limited: 1, outdatedWithOriginal: 1 })
    })

    it('forgets the unmatched activities when the library loads again', async () => {
      mocked.listActivities.mockImplementation(async () => [recordFor(stale, true)])
      const { send } = await startWorker()
      await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
      mocked.createActivity.mockRejectedValueOnce(
        new ApiRequestError(404, 'not_found', 'Activity not found'),
      )
      const rebuilt = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })
      expect(ending(rebuilt)).not.toHaveProperty('outdatedWithOriginal')

      const reloaded = await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
      expect(ending(reloaded)).toMatchObject({ outdatedWithOriginal: 1 })
      expect(reloaded).toContainEqual({ type: 'missingOriginals', count: 0 })
    })

    it('refreshes the count when an import updates an outdated activity', async () => {
      mocked.listActivities.mockImplementation(async () => [recordFor(stale, true)])
      const { send } = await startWorker()
      const loaded = await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
      expect(ending(loaded)).toMatchObject({ outdatedWithOriginal: 1 })

      const imported = await send({
        type: 'addFiles',
        files: [fitFile()],
        settings: SETTINGS,
        sync: { keepFiles: true, userId: USER_ID },
      })
      expect(ending(imported)).toMatchObject({ type: 'state', state: { outdatedActivities: 0 } })
      expect(ending(imported)).not.toHaveProperty('outdatedWithOriginal')
    })

    it('tells the page which originals are missing when an import fails', async () => {
      mocked.listActivities.mockResolvedValue([recordFor(stale, false)])
      const { send } = await startWorker()
      await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
      vi.mocked(importSummary.summarizeAdded).mockImplementationOnce(() => {
        throw new Error('The summary failed')
      })
      const imported = await send({
        type: 'addFiles',
        files: [fitFile()],
        settings: SETTINGS,
        sync: { keepFiles: false, userId: USER_ID },
      })

      expect(imported.at(-1)).toMatchObject({ type: 'error' })
      expect(imported).toContainEqual({ type: 'missingOriginals', count: 1 })
    })
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
    const stale = { ...SAVED_DIGEST, modelRevision: 1 }
    mocked.listActivities.mockResolvedValueOnce([
      recordFor(stale, true),
      recordFor({ ...stale, id: 'other' }, true),
      recordFor({ ...stale, id: 'third' }, true),
    ])
    mocked.downloadActivityFile.mockRejectedValue(
      new ApiRequestError(401, 'unauthenticated', 'Sign in required'),
    )
    const { send } = await startWorker()
    expect(await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })).toEqual([
      { type: 'error', message: 'Sign in required', issue: 'signed-out' },
    ])
    // Two are in flight at once; the third is never asked for.
    expect(mocked.downloadActivityFile).toHaveBeenCalledTimes(2)
  })

  describe('the update behind Update now', () => {
    const stale = { ...SAVED_DIGEST, modelRevision: 1 }

    it('does nothing in a tab when another tab of the account holds the writer lock', async () => {
      vi.stubGlobal('navigator', {
        locks: {
          request: async (_name: string, _options: object, run: (lock: null) => unknown) =>
            run(null),
        },
      })
      mocked.listActivities
        .mockResolvedValueOnce([recordFor(stale, true)])
        .mockResolvedValueOnce([recordFor(stale, true)])
      const { send } = await startWorker()
      const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

      expect(mocked.downloadActivityFile).not.toHaveBeenCalled()
      expect(mocked.createActivity).not.toHaveBeenCalled()
      expect(messages.at(-1)).toMatchObject({ rebuilt: 0, failed: 0, stopped: 'elsewhere' })
    })

    it('sends nothing for an activity that starts at another time than the saved one', async () => {
      mocked.listActivities
        .mockResolvedValueOnce([recordFor({ ...stale, startMs: stale.startMs + 60_000 }, true)])
        .mockResolvedValueOnce([recordFor(stale, true)])
      const { send } = await startWorker()
      const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

      expect(mocked.createActivity).not.toHaveBeenCalled()
      // The file holds no activity at that time, so it is unmatched, not rebuilt.
      expect(messages.at(-1)).toMatchObject({ rebuilt: 0, missing: 1, failed: 0 })
    })

    it('keeps the saved id when the file gives another for the same workout', async () => {
      mocked.listActivities
        .mockResolvedValueOnce([recordFor({ ...stale, id: 'the-id-it-was-saved-with' }, true)])
        .mockResolvedValueOnce([recordFor(stale, true)])
      const { send } = await startWorker()
      const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

      expect(mocked.createActivity).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'the-id-it-was-saved-with' }),
        'run.fit',
        expect.any(String),
        USER_ID,
        'rec-the-id-it-was-saved-with',
      )
      expect(messages.at(-1)).toMatchObject({ rebuilt: 1, failed: 0 })
    })

    it('stops at once when the server says the app is out of date', async () => {
      mocked.listActivities
        .mockResolvedValueOnce([recordFor(stale, true)])
        .mockResolvedValueOnce([recordFor(stale, true)])
      mocked.createActivity.mockRejectedValue(new ApiRequestError(409, 'app_outdated', 'Reload'))
      const { send } = await startWorker()
      const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

      expect(messages.at(-1)).toMatchObject({ rebuilt: 0, failed: 0, stopped: 'outdated' })
      expect(mocked.createActivity).toHaveBeenCalledOnce()
    })

    it('stops after five failures in a row and leaves the rest as they are', async () => {
      const library = Array.from({ length: 12 }, (_, i) =>
        recordFor({ ...stale, id: `a${i}`, startMs: stale.startMs + i * 1000 }, true),
      )
      mocked.listActivities.mockResolvedValueOnce(library).mockResolvedValueOnce(library)
      mocked.downloadActivityFile.mockRejectedValue(
        new ApiRequestError(500, 'server_error', 'down'),
      )
      const { send } = await startWorker()
      const messages = await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

      const done = messages.at(-1)
      expect(done).toMatchObject({ rebuilt: 0, stopped: 'breaker' })
      expect(mocked.downloadActivityFile.mock.calls.length).toBeLessThanOrEqual(6)
    })

    it('stands aside for an import that arrives while it runs, and says so', async () => {
      mocked.listActivities
        .mockResolvedValueOnce([recordFor(stale, true)])
        .mockResolvedValueOnce([recordFor(stale, true)])
      const { send, posted } = await startWorker()
      const update = send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })
      const change = send({ type: 'clear' })
      await Promise.all([update, change])

      expect(mocked.downloadActivityFile).not.toHaveBeenCalled()
      expect(posted.find((message) => message.type === 'rebuildComplete')).toMatchObject({
        rebuilt: 0,
        stopped: 'paused',
      })
    })
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
    skipped: () => 0,
    get: async () => null,
    lookup: async () => null,
    route: async () => null,
    put: refused,
    backfillFile: refused,
    removeIfDigest: refused,
    // Storage the browser does not offer holds nothing, and so has no epoch to move.
    epoch: async () => 0,
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

  it('empties the session on removing all activities even when the device library refuses to clear, and says what remains', async () => {
    const { send } = await startWorker()
    await send(signedOutImport())
    kept.library = { ...keptDevice(), clear: () => Promise.reject(new Error('refused')) }
    vi.resetModules()
    const restarted = await startWorker()
    await restarted.send({ type: 'loadDevice', settings: SETTINGS })

    const messages = await restarted.send({ type: 'clear', forgetDevice: true })

    expect(messages).toEqual([
      // The library that remains, not an empty one, and then why.
      {
        type: 'libraryActivities',
        activities: [expect.objectContaining({ startMs: sampleActivity.startMs })],
      },
      { type: 'deviceIssue', issue: 'notForgotten' },
      { type: 'state', state: expect.objectContaining({ totalActivities: 0 }) },
    ])
    // The kept activity is still there, so the next import is analysed with it, as a reload would.
    const added = await restarted.send(signedOutImport(fitFile(secondSampleActivity, 'second.fit')))
    const both = [sampleActivity.startMs, secondSampleActivity.startMs].sort((a, b) => a - b)
    expect(analysedStarts(added)).toEqual(both)
    expect(listedStarts(added)).toEqual(both)
  })

  it('tries the clear again when removing all activities is asked for again', async () => {
    const { send } = await startWorker()
    await send(signedOutImport())
    const device = keptDevice()
    let attempts = 0
    kept.library = {
      ...device,
      clear: () => (++attempts === 1 ? Promise.reject(new Error('refused')) : device.clear()),
    }
    vi.resetModules()
    const restarted = await startWorker()
    await restarted.send({ type: 'loadDevice', settings: SETTINGS })
    await restarted.send({ type: 'clear', forgetDevice: true })

    const messages = await restarted.send({ type: 'clear', forgetDevice: true })

    expect(attempts).toBe(2)
    expect(messages).toEqual([
      { type: 'libraryActivities', activities: [] },
      { type: 'state', state: expect.objectContaining({ totalActivities: 0 }) },
    ])
    expect(await device.all()).toEqual([])
  })

  it('tells the page how many activities this browser could not keep, and still shows the results', async () => {
    kept.library = {
      ...memoryDeviceLibrary(),
      put: () => Promise.reject(new Error('QuotaExceededError')),
    }
    const { send } = await startWorker()

    const messages = await send({
      type: 'addFiles',
      files: [fitFile(), fitFile(secondSampleActivity, 'second.fit')],
      settings: SETTINGS,
      sync: null,
      saveToDevice: true,
    })

    expect(messages.at(-2)).toEqual({ type: 'deviceIssue', issue: 'notSaved', count: 2 })
    expect(messages.at(-1)).toMatchObject({ type: 'state', state: { totalActivities: 2 } })
    expect(messages.some((message) => message.type === 'error')).toBe(false)
  })

  it('leaves a row a newer version wrote, and tells the page it did', async () => {
    const put = vi.fn(() => Promise.resolve())
    kept.library = {
      ...memoryDeviceLibrary(),
      lookup: async () => 'newer',
      put,
    }
    const { send } = await startWorker()

    const messages = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: null,
      saveToDevice: true,
    })

    expect(put).not.toHaveBeenCalled()
    expect(messages.at(-2)).toEqual({ type: 'deviceIssue', issue: 'notSaved', count: 0, newer: 1 })
    expect(messages.at(-1)).toMatchObject({ type: 'state', state: { totalActivities: 1 } })
  })

  it('counts a workout once when two refused copies of it were imported', async () => {
    let attempts = 0
    kept.library = {
      ...memoryDeviceLibrary(),
      put: () => {
        attempts += 1
        return Promise.reject(new Error('QuotaExceededError'))
      },
    }
    const { send } = await startWorker()

    const messages = await send({
      type: 'addFiles',
      files: [gpxFile(), fitFile()],
      settings: SETTINGS,
      sync: null,
      saveToDevice: true,
    })

    // Both copies were offered to storage and refused, yet it is one workout.
    expect(attempts).toBe(2)
    expect(messages).toContainEqual({ type: 'deviceIssue', issue: 'notSaved', count: 1 })
  })

  it('says nothing about saving when another copy of the refused workout was kept', async () => {
    const memory = memoryDeviceLibrary()
    let attempts = 0
    kept.library = {
      ...memory,
      put: (...args) =>
        ++attempts === 1 ? memory.put(...args) : Promise.reject(new Error('QuotaExceededError')),
    }
    const { send } = await startWorker()

    const messages = await send({
      type: 'addFiles',
      files: [gpxFile(), fitFile()],
      settings: SETTINGS,
      sync: null,
      saveToDevice: true,
    })

    expect(attempts).toBe(2)
    expect(messages.some((message) => message.type === 'deviceIssue')).toBe(false)
    expect(messages.at(-1)).toMatchObject({ type: 'state', state: { totalActivities: 1 } })
  })

  it('says nothing about saving when every activity of the import was kept', async () => {
    const { send } = await startWorker()

    const messages = await send(signedOutImport())

    expect(messages.some((message) => message.type === 'deviceIssue')).toBe(false)
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

describe('an analysis made while the account loads', () => {
  it('is held in this session only: nothing is listed and nothing is kept', async () => {
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: null,
    })

    expect(messages).not.toContainEqual(expect.objectContaining({ type: 'libraryActivities' }))
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'state',
        state: expect.objectContaining({ totalActivities: 1 }),
      }),
    )
    expect(await keptDevice().all()).toEqual([])
    expect(mocked.createActivity).not.toHaveBeenCalled()
  })

  it('is not counted twice once the account library loads, when the account already has the workout', async () => {
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST)])
    const { send } = await startWorker()
    await send({ type: 'addFiles', files: [fitFile()], settings: SETTINGS, sync: null })
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    const messages = await send({
      type: 'addFiles',
      files: [fitFile()],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
    })

    // The account keeps one copy of the workout, so the library still counts it once.
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'state',
        state: expect.objectContaining({ totalActivities: 1 }),
      }),
    )
  })

  it('is saved once and reported as added when a signed-out visitor is re-run after the kept library loads', async () => {
    const { send } = await startWorker()
    await send({ type: 'addFiles', files: [fitFile()], settings: SETTINGS, sync: null })
    await send({ type: 'loadDevice', settings: SETTINGS })

    const messages = await send(signedOutImport())

    expect(await keptDevice().all()).toHaveLength(1)
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'state',
        outcome: expect.objectContaining({ activities: 1, duplicates: [] }),
      }),
    )
  })
})

describe('a rejected file dropped while the account loads', () => {
  const notFit = () => new File(['not a fit'], 'not-a-fit.fit')

  it('is reported again by the signed-out re-run, after the kept library loads', async () => {
    const { send } = await startWorker()
    await send({
      type: 'addFiles',
      files: [notFit()],
      settings: SETTINGS,
      sync: null,
      provisional: true,
    })
    await send({ type: 'loadDevice', settings: SETTINGS })

    const messages = await send({
      type: 'addFiles',
      files: [notFit()],
      settings: SETTINGS,
      sync: null,
      saveToDevice: true,
    })

    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'state',
        state: expect.objectContaining({
          rejected: [expect.objectContaining({ fileName: 'not-a-fit.fit' })],
        }),
      }),
    )
  })

  it('is reported by the provisional analysis itself', async () => {
    const { send } = await startWorker()
    const messages = await send({
      type: 'addFiles',
      files: [notFit()],
      settings: SETTINGS,
      sync: null,
      provisional: true,
    })

    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'state',
        state: expect.objectContaining({
          rejected: [expect.objectContaining({ fileName: 'not-a-fit.fit' })],
        }),
      }),
    )
  })
})

describe('keeping what was analysed while the account was unknown', () => {
  const provisionalImport = (file: File = fitFile()): WorkerRequest => ({
    type: 'addFiles',
    files: [file],
    settings: SETTINGS,
    sync: null,
    provisional: true,
  })

  it('writes nothing to this browser until asked to keep it', async () => {
    const { send } = await startWorker()
    await send({ type: 'loadDevice', settings: SETTINGS })

    const messages = await send(provisionalImport())

    expect(messages.at(-1)).toMatchObject({ type: 'state', state: { totalActivities: 1 } })
    expect(await keptDevice().all()).toEqual([])
  })

  it('keeps the analysed activities as they are, without reading or analysing them again', async () => {
    const { send } = await startWorker()
    await send({ type: 'loadDevice', settings: SETTINGS })
    const analysed = await send(provisionalImport())
    const digest = (analysed.at(-1) as Extract<WorkerResponse, { type: 'state' }>).state.library[0]!

    const messages = await send({ type: 'keepProvisional', settings: SETTINGS })

    expect(await keptDevice().all()).toEqual([
      {
        workoutKey: workoutKeyOf(digest),
        digest: expect.objectContaining({ id: digest.id }),
        // Kept with the file it came from, so the workout can be added to an account later.
        file: { fileName: expect.any(String), fileHash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      },
    ])
    expect(messages).toContainEqual({
      type: 'libraryActivities',
      activities: [expect.objectContaining({ id: workoutKeyOf(digest) })],
    })
    // The session is as it was: one activity, and no progress from a second read.
    expect(messages.at(-1)).toMatchObject({ type: 'state', state: { totalActivities: 1 } })
    expect(messages.some((message) => message.type === 'progress')).toBe(false)
  })

  it('keeps nothing once the account library has loaded over them', async () => {
    mocked.listActivities.mockResolvedValue([])
    const { send } = await startWorker()
    await send({ type: 'loadDevice', settings: SETTINGS })
    await send(provisionalImport())
    await send({ type: 'loadServer', settings: SETTINGS, userId: 'u1' })

    await send({ type: 'keepProvisional', settings: SETTINGS })

    expect(await keptDevice().all()).toEqual([])
  })

  it('says how many the browser would not keep', async () => {
    kept.library = {
      ...memoryDeviceLibrary(),
      put: () => Promise.reject(new Error('QuotaExceededError')),
    }
    const { send } = await startWorker()
    await send({ type: 'loadDevice', settings: SETTINGS })
    await send(provisionalImport())

    const messages = await send({ type: 'keepProvisional', settings: SETTINGS })

    expect(messages).toContainEqual({ type: 'deviceIssue', issue: 'notSaved', count: 1 })
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
      version: 2,
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
    expect(text.startsWith('{"format":"rca-export","version":2,')).toBe(true)
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

describe('deleting a signed-in activity', () => {
  it('removes its device copy as well, so it cannot come back after sign-out', async () => {
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST)])
    mocked.deleteActivity.mockResolvedValue(undefined)
    const { send } = await startWorker()
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    await keptDevice().put(workoutKeyOf(SAMPLE_DIGEST), SAMPLE_DIGEST)

    const messages = await send({
      type: 'deleteActivity',
      id: `rec-${SAMPLE_DIGEST.id}`,
      userId: USER_ID,
      settings: SETTINGS,
    })

    expect(mocked.deleteActivity).toHaveBeenCalledWith(`rec-${SAMPLE_DIGEST.id}`, USER_ID)
    expect(await keptDevice().get(workoutKeyOf(SAMPLE_DIGEST))).toBeNull()
    expect(messages.at(-1)).toEqual(expect.objectContaining({ type: 'state' }))
  })
})

describe('a signed-in delete whose device copy cannot be removed', () => {
  it('still reports the delete as done, since the account copy is gone, and says the copy here stays', async () => {
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST)])
    mocked.deleteActivity.mockResolvedValue(undefined)
    const { send } = await startWorker()
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    await keptDevice().put(workoutKeyOf(SAMPLE_DIGEST), SAMPLE_DIGEST)
    vi.spyOn(keptDevice(), 'remove').mockRejectedValueOnce(new Error('storage refused'))

    const messages = await send({
      type: 'deleteActivity',
      id: `rec-${SAMPLE_DIGEST.id}`,
      userId: USER_ID,
      settings: SETTINGS,
    })

    expect(mocked.deleteActivity).toHaveBeenCalledWith(`rec-${SAMPLE_DIGEST.id}`, USER_ID)
    expect(messages.at(-1)).toEqual(expect.objectContaining({ type: 'state' }))
    expect(messages.some((message) => message.type === 'error')).toBe(false)
    // The copy here could come back after a sign-out, so the page is told.
    expect(messages).toContainEqual({ type: 'deviceIssue', issue: 'notForgotten' })
  })
})

/** A real multisport file from the corpus, read through a variable specifier so the browser build never resolves node:fs. */
async function corpusUpload(name: string): Promise<Uint8Array> {
  const specifier = 'node:fs'
  const fs = (await import(/* @vite-ignore */ specifier)) as {
    readFileSync: (path: URL) => Uint8Array
  }
  return new Uint8Array(
    fs.readFileSync(
      new URL(`../../../../packages/core/test-corpus/fitparse/${name}`, import.meta.url),
    ),
  )
}

describe('rebuilding a multisport leg keeps its session key', () => {
  it('rebuilds a leg under the session key its import gave it', async () => {
    const MULTISPORT = await corpusUpload('activity-large-fenxi2-multisport.fit')
    // The key the import gives this upload's legs, read from a real import of the same bytes.
    const imported = await new AnalysisSession().addFiles(
      [new File([new Uint8Array(MULTISPORT)], 'ACTIVITY.FIT')],
      SETTINGS,
    )
    const leg = imported.result?.activities.find((activity) => activity.sport === 'ride')
    if (leg?.sessionKey === undefined) throw new Error('the import gave the leg no session key')

    const original = parseActivityFile(MULTISPORT, 'ACTIVITY.FIT', undefined, {
      sessionKey: leg.sessionKey,
    })
    if (!original.ok) throw new Error('the upload was refused')
    const match = original.activities.find((activity) => activity.id === leg.id)
    if (match === undefined) throw new Error('the upload has no such leg')
    const stale = { ...digestActivity(match), modelRevision: 1 }

    mocked.downloadActivityFile.mockResolvedValueOnce(MULTISPORT)
    mocked.listActivities
      .mockResolvedValueOnce([{ ...recordFor(stale, true), fileName: 'ACTIVITY.FIT' }])
      .mockResolvedValueOnce([recordFor({ ...stale, modelRevision: MODEL_REVISION }, true)])
    const { send } = await startWorker()
    await send({ type: 'rebuildStale', settings: SETTINGS, userId: USER_ID })

    expect(mocked.createActivity).toHaveBeenCalledWith(
      expect.objectContaining({ sessionKey: leg.sessionKey }),
      'ACTIVITY.FIT',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      USER_ID,
      `rec-${stale.id}`,
    )
  })
})

describe('request numbers', () => {
  it('announces a numbered request and stamps its reply and the events it posts', async () => {
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST)])
    const { send } = await startWorker()
    const request = { type: 'loadServer', settings: SETTINGS, userId: USER_ID, requestId: 41 }
    const messages = await send(request as WorkerRequest)

    expect(messages[0]).toEqual({ type: 'started', during: 41 })
    const reply = messages.at(-1)
    expect(reply).toMatchObject({ type: 'state', replyTo: 41 })
    // Everything else it said while it ran names the same request, and none of it claims to be a reply.
    for (const event of messages.slice(1, -1)) {
      expect(event).toMatchObject({ during: 41 })
      expect(event).not.toHaveProperty('replyTo')
    }
  })

  it('carries the number on a request that fails', async () => {
    const { send } = await startWorker()
    const request = {
      type: 'deleteActivity',
      id: 'nope',
      userId: USER_ID,
      settings: SETTINGS,
      requestId: 8,
    }
    const messages = await send(request as WorkerRequest)
    expect(messages.at(-1)).toMatchObject({ type: 'error', replyTo: 8 })
  })

  it('sends an unnumbered request nothing extra', async () => {
    const { send } = await startWorker()
    const messages = await send({ type: 'setSettings', settings: SETTINGS })
    expect(messages).toHaveLength(1)
    expect(messages[0]).not.toHaveProperty('replyTo')
  })
})

describe('a reply carries its request number, and nothing follows it', () => {
  /** The reply is the one message of its kind, comes last, and names the request; the rest ran under it. */
  function expectOneReply(messages: WorkerResponse[], type: WorkerResponse['type'], id: number) {
    const reply = messages.at(-1)
    expect(reply).toMatchObject({ type, replyTo: id })
    for (const event of messages.slice(0, -1)) {
      expect(event).toMatchObject({ during: id })
      expect(event).not.toHaveProperty('replyTo')
      expect(REPLY_TYPES.has(event.type)).toBe(false)
    }
  }

  async function sendNumbered(
    send: (request: WorkerRequest) => Promise<WorkerResponse[]>,
    request: WorkerRequest,
    id: number,
  ) {
    return send({ ...request, requestId: id } as unknown as WorkerRequest)
  }

  it('numbers an export', async () => {
    mocked.listActivities.mockResolvedValue([])
    const { send } = await startWorker()
    const messages = await sendNumbered(
      send,
      {
        type: 'exportData',
        userId: USER_ID,
        account: { name: 'A', email: 'a@example.com' },
        profile: {
          massKg: 75,
          bikeMassKg: 9,
          units: 'metric',
          keepFiles: true,
          birthYear: null,
          sex: null,
          updatedAt: 1,
        },
      },
      11,
    )
    expectOneReply(messages, 'exportReady', 11)
  })

  it('numbers the splits of an activity', async () => {
    const { send } = await startWorker()
    expectOneReply(
      await sendNumbered(send, { type: 'activitySplits', id: 'nope' }, 12),
      'splits',
      12,
    )
  })

  it('numbers a route', async () => {
    const { send } = await startWorker()
    expectOneReply(
      await sendNumbered(send, { type: 'routeShape', id: 'nope', userId: USER_ID }, 13),
      'routeShape',
      13,
    )
  })

  it('numbers a rebuild', async () => {
    mocked.listActivities.mockResolvedValue([])
    const { send } = await startWorker()
    expectOneReply(
      await sendNumbered(send, { type: 'rebuildStale', settings: SETTINGS, userId: USER_ID }, 14),
      'rebuildComplete',
      14,
    )
  })
})

describe('rule R: near-copies of one workout in the worker', () => {
  /** The same workout as the first sample activity, a few seconds later: another second, so another stored row. */
  const COPY_ACTIVITY: Activity = { ...sampleActivity, startMs: sampleActivity.startMs + 4_000 }
  const copyFile = () => new File([new Uint8Array(encodeGpx(COPY_ACTIVITY))], 'copy.gpx')
  const FIT_DIGEST = digestActivity({ ...sampleActivity, id: 'a.fit' })
  const GPX_DIGEST = digestActivity({ ...COPY_ACTIVITY, id: 'copy.gpx' })
  const records = [recordFor(FIT_DIGEST), recordFor(GPX_DIGEST)]

  async function loadedAccount() {
    mocked.listActivities.mockResolvedValue(records)
    const started = await startWorker()
    const loaded = await started.send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    return { ...started, loaded }
  }

  it('lists, counts and reports the shown copy only, though both are stored', async () => {
    const { loaded } = await loadedAccount()

    const list = loaded.find((message) => message.type === 'libraryActivities')
    expect(list).toMatchObject({ activities: [{ id: records[0]!.id }] })
    // Neither has an original, and only the shown one is missed.
    expect(loaded).toContainEqual({ type: 'missingOriginals', count: 1 })
    expect(loaded.at(-1)).toMatchObject({
      type: 'state',
      state: { totalActivities: 1, hiddenDuplicates: 1 },
    })
  })

  it('stores both copies of a signed-in import, and lists one', async () => {
    mocked.listActivities.mockResolvedValue([])
    const { send } = await startWorker()
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    const messages = await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'a.fit'), copyFile()],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
    })

    expect(mocked.createActivity).toHaveBeenCalledTimes(2)
    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      saved: 2,
      state: { totalActivities: 1, hiddenDuplicates: 1 },
    })
  })

  it('deletes the whole group of copies when the one shown is deleted', async () => {
    const { send } = await loadedAccount()
    mocked.deleteActivity.mockResolvedValue(undefined)

    const messages = await send({
      type: 'deleteActivity',
      id: records[0]!.id,
      userId: USER_ID,
      settings: SETTINGS,
    })

    expect(mocked.deleteActivity.mock.calls.map(([id]) => id).sort()).toEqual(
      records.map((record) => record.id).sort(),
    )
    expect(messages).toContainEqual({ type: 'libraryActivities', activities: [] })
    expect(messages.at(-1)).toMatchObject({ type: 'state', state: { totalActivities: 0 } })
  })

  it('deletes nothing of the group, and keeps it, when the server refuses the first delete', async () => {
    const { send } = await loadedAccount()
    mocked.deleteActivity.mockRejectedValue(new ApiRequestError(503, 'unavailable', 'Try later'))

    const messages = await send({
      type: 'deleteActivity',
      id: records[0]!.id,
      userId: USER_ID,
      settings: SETTINGS,
    })

    expect(mocked.deleteActivity).toHaveBeenCalledOnce()
    expect(messages.at(-1)).toMatchObject({ type: 'error' })
  })

  it('leaves the hidden copy out of the export', async () => {
    const { send } = await loadedAccount()
    mocked.listActivities.mockImplementation(async (_since, _userId, _onUnreadable, onPage) => {
      onPage?.(records)
      return []
    })

    const messages = await send({
      type: 'exportData',
      userId: USER_ID,
      account: { name: 'Ada', email: 'ada@example.com' },
      profile: {
        massKg: 75,
        bikeMassKg: 9,
        units: 'metric',
        keepFiles: false,
        birthYear: null,
        sex: null,
        updatedAt: 1,
      },
    })

    const reply = messages.at(-1)
    if (reply?.type !== 'exportReady') throw new Error('expected an export')
    const text = await reply.file.text()
    expect(text).toContain(records[0]!.id)
    expect(text).not.toContain(records[1]!.id)
  })

  it('counts a copy only among the digests the analysis reads: a stale FIT hides nothing', async () => {
    const stale = digestActivity({ ...sampleActivity, id: 'old.fit' })
    const staleRecord = recordFor({ ...stale, modelRevision: 1 })
    const current = recordFor(GPX_DIGEST)
    mocked.listActivities.mockResolvedValue([staleRecord, current])
    const { send } = await startWorker()
    const loaded = await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    const list = loaded.find((message) => message.type === 'libraryActivities')
    // The stale one is held out of the analysis, so the current GPX is not a copy of it: both are listed.
    if (list?.type !== 'libraryActivities') throw new Error('no list')
    expect(list.activities.map((activity) => activity.id).sort()).toEqual(
      [current.id, staleRecord.id].sort(),
    )
    mocked.listActivities.mockImplementation(async (_since, _userId, _onUnreadable, onPage) => {
      onPage?.([staleRecord, current])
      return []
    })
    const exported = await send({
      type: 'exportData',
      userId: USER_ID,
      account: { name: 'Ada', email: 'ada@example.com' },
      profile: {
        massKg: 75,
        bikeMassKg: 9,
        units: 'metric',
        keepFiles: false,
        birthYear: null,
        sex: null,
        updatedAt: 1,
      },
    })
    const reply = exported.at(-1)
    if (reply?.type !== 'exportReady') throw new Error('expected an export')
    const text = await reply.file.text()
    expect(text).toContain(staleRecord.id)
    expect(text).toContain(current.id)
  })

  it('takes the members already deleted out of the list and the session when a later delete fails', async () => {
    const third = recordFor(
      digestActivity({ ...sampleActivity, id: 'c.tcx', startMs: sampleActivity.startMs + 8_000 }),
    )
    mocked.listActivities.mockResolvedValue([...records, third])
    const { send } = await startWorker()
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    mocked.deleteActivity
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new ApiRequestError(503, 'unavailable', 'Try later'))

    const messages = await send({
      type: 'deleteActivity',
      id: records[0]!.id,
      userId: USER_ID,
      settings: SETTINGS,
    })

    expect(messages.at(-1)).toMatchObject({ type: 'error' })
    // The first was deleted at the server, so it is gone from what the page lists; the others are still there.
    const list = messages.findLast((message) => message.type === 'libraryActivities')
    if (list?.type !== 'libraryActivities') throw new Error('no list')
    const listed = list.activities.map((activity) => activity.id)
    expect(listed).not.toContain(records[0]!.id)
    expect(mocked.deleteActivity).toHaveBeenCalledTimes(2)
    // And the session no longer holds it: the two left are copies of each other, one shown.
    const next = await send({ type: 'setSettings', settings: SETTINGS })
    expect(next.at(-1)).toMatchObject({ state: { totalActivities: 1, hiddenDuplicates: 1 } })
  })

  it('lists a stale FIT kept in this browser beside a current GPX: neither is a copy of the other', async () => {
    const { send } = await startWorker()
    const stale = { ...digestActivity({ ...sampleActivity, id: 'old.fit' }), modelRevision: 1 }
    await kept.library!.put(workoutKeyOf(stale), stale)
    await kept.library!.put(workoutKeyOf(GPX_DIGEST), GPX_DIGEST)

    const messages = await send({ type: 'loadDevice', settings: SETTINGS })

    const list = messages.find((message) => message.type === 'libraryActivities')
    if (list?.type !== 'libraryActivities') throw new Error('no list')
    expect(list.activities).toHaveLength(2)
  })

  it('takes the copies already removed from this browser out of the session when a later removal fails', async () => {
    const { send } = await startWorker()
    const added = await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'a.fit'), copyFile()],
      settings: SETTINGS,
      sync: null,
      saveToDevice: true,
    })
    const listed = added.filter((message) => message.type === 'libraryActivities').at(-1)
    if (listed?.type !== 'libraryActivities') throw new Error('no list')
    const library = kept.library!
    const removing = library.remove.bind(library)
    let removals = 0
    library.remove = async (key) => {
      if (++removals === 2) throw new Error('storage refused')
      return removing(key)
    }

    const messages = await send({
      type: 'deleteDeviceActivity',
      id: listed.activities[0]!.id,
      settings: SETTINGS,
    })

    expect(messages.at(-1)).toMatchObject({ type: 'error' })
    expect((await library.all()).length).toBe(1)
    const next = await send({ type: 'setSettings', settings: SETTINGS })
    // The one removed is out of the session; the one left is the only one it holds, shown.
    expect(next.at(-1)).toMatchObject({ state: { totalActivities: 1, hiddenDuplicates: 0 } })
  })

  it('lists one copy kept in this browser, and deletes the whole group with it', async () => {
    const { send } = await startWorker()

    const added = await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'a.fit'), copyFile()],
      settings: SETTINGS,
      sync: null,
      saveToDevice: true,
    })
    expect(added.at(-1)).toMatchObject({ state: { totalActivities: 1, hiddenDuplicates: 1 } })
    expect((await kept.library?.all())?.length).toBe(2)
    const listed = added.filter((message) => message.type === 'libraryActivities').at(-1)
    if (listed?.type !== 'libraryActivities') throw new Error('no list')
    expect(listed.activities).toHaveLength(1)

    const removed = await send({
      type: 'deleteDeviceActivity',
      id: listed.activities[0]!.id,
      settings: SETTINGS,
    })

    expect(await kept.library?.all()).toEqual([])
    expect(removed.at(-1)).toMatchObject({ type: 'state', state: { totalActivities: 0 } })
  })
})

describe('an import that skips files in a format the app does not read', () => {
  it('names the formats in its outcome, with the count it always gave', async () => {
    const { send } = await startWorker()
    const zip = zipSync({
      'run.fit': new Uint8Array(RUN_FILE_BYTES),
      'a.pwx': strToU8('x'),
      'b.pwx': strToU8('x'),
      'c.kml': strToU8('x'),
    })

    const messages = await send({
      ...signedOutImport(new File([new Uint8Array(zip)], 'export.zip')),
    })

    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      outcome: { rejected: 3, skippedTypes: { pwx: 2, kml: 1 } },
      state: { unsupportedFiles: 3 },
    })
  })
})

describe('files given with the export’s activities.csv', () => {
  it('are read with the sport and name the list gives, and the list is neither refused nor read as an activity', async () => {
    const { send } = await startWorker()
    const untyped = new TextDecoder()
      .decode(encodeGpx(sampleActivity))
      .replace(/<type>[^<]*<\/type>/, '')
    const list = new File(
      [
        'Activity ID,Activity Name,Activity Type,Filename\n1,Morning Run,Run,activities/run.gpx\n2,Gone,Ride,activities/gone.gpx\n',
      ],
      'activities.csv',
    )

    const messages = await send(signedOutImport(new File([untyped], 'run.gpx')))
    const withList = await send({
      ...signedOutImport(new File([untyped], 'run.gpx')),
      files: [list, new File([untyped], 'run.gpx')],
    } as WorkerRequest)

    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      outcome: { rejected: 1, needsList: true },
    })
    const reply = withList.at(-1)
    expect(reply).toMatchObject({
      type: 'state',
      outcome: { rejected: 0, listed: { named: 2, received: 1 } },
    })
    expect(reply).not.toMatchObject({ outcome: { needsList: true } })
  })
})

describe('a signed-in import saves its activities side by side', () => {
  /** A zip of short runs, a day apart, so none is a copy of another. */
  const base: Activity = sampleActivity!
  function zipOfRuns(count: number): File {
    const entries: Record<string, Uint8Array> = {}
    for (let i = 0; i < count; i++) {
      const startMs = Date.UTC(2020, 0, 1) + i * 24 * 3_600_000
      entries[`activities/${i}.fit`] = encodeFit(
        { ...base, id: `run-${i}`, startMs },
        { gps: true },
      )
    }
    return new File([zipSync(entries)], 'export.zip')
  }

  it('keeps no more than three creates open at once, saves every activity, and ends with the count', async () => {
    let live = 0
    let most = 0
    let filled: () => void = () => undefined
    const threeOpen = new Promise<void>((resolve) => (filled = resolve))
    mocked.createActivity.mockImplementation(async (digest) => {
      live++
      most = Math.max(most, live)
      if (live >= 3) filled()
      // A save stays open until three are, however slowly the files are read, so the limit is what is measured;
      // the ceiling keeps a worker that never opens a third from hanging the test.
      await Promise.race([threeOpen, new Promise((resolve) => setTimeout(resolve, 10_000))])
      await new Promise((resolve) => setTimeout(resolve, 5))
      live--
      return { record: recordFor(digest), created: true }
    })
    const { send } = await startWorker()

    const messages = await send({
      type: 'addFiles',
      files: [zipOfRuns(12)],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
    })

    expect(mocked.createActivity).toHaveBeenCalledTimes(12)
    expect(most).toBe(3)
    const reply = messages.at(-1)
    expect(reply).toMatchObject({ type: 'state', saved: 12, state: { totalActivities: 12 } })
    expect(reply).toMatchObject({ state: { syncIssues: [] } })
  })

  it('reports the activities that did not save by their reason, and the rest as saved', async () => {
    let calls = 0
    mocked.createActivity.mockImplementation(async (digest) => {
      calls++
      if (calls === 4) throw new ApiRequestError(500, 'server_error', 'Boom')
      return { record: recordFor(digest), created: true }
    })
    const { send } = await startWorker()

    const messages = await send({
      type: 'addFiles',
      files: [zipOfRuns(8)],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
    })

    expect(messages.at(-1)).toMatchObject({
      type: 'state',
      saved: 7,
      state: { totalActivities: 8, syncIssues: [{ code: 'server', count: 1 }] },
    })
  })
})

describe('the saves an earlier visit left in the outbox', () => {
  /** A row as an import cut off before its save finished leaves it. */
  function seedRow(digest: ActivityDigest, userId = USER_ID) {
    const key = workoutKeyOf(digest)
    const mine = outboxRows.get(userId) ?? new Map<string, unknown>()
    outboxRows.set(userId, mine)
    mine.set(key, {
      id: `${userId}|${key}`,
      userId,
      key,
      digestId: digest.id,
      seq: mine.size,
      digestJson: serializeDigest(digest),
      fileName: 'run.fit',
      fileHash: 'a'.repeat(64),
      attempts: 0,
    })
  }

  it('finishes them after the library loads, apart from the request, and tells the page how it ended', async () => {
    seedRow(SAMPLE_DIGEST)
    seedRow(digestActivity(secondSampleActivity))
    mocked.listActivities.mockResolvedValue([])
    const { send, posted } = await startWorker()

    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    await vi.waitFor(() =>
      expect(posted).toContainEqual(expect.objectContaining({ type: 'outbox', finished: true })),
    )

    expect(mocked.createActivity).toHaveBeenCalledTimes(2)
    expect(posted.filter((m) => m.type === 'outbox').at(-1)).toEqual({
      type: 'outbox',
      pending: 0,
      saved: 2,
      failed: 0,
      finished: true,
    })
    expect(outboxRows.get(USER_ID)?.size).toBe(0)
    // Said apart from the request: stamped with it, the page would drop it as late.
    expect(posted.filter((m) => m.type === 'outbox').every((m) => !('during' in m))).toBe(true)
  })

  it('does not send what the account already holds', async () => {
    seedRow(SAMPLE_DIGEST)
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST)])
    const { send, posted } = await startWorker()

    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    await vi.waitFor(() =>
      expect(posted).toContainEqual(expect.objectContaining({ type: 'outbox', finished: true })),
    )

    expect(mocked.createActivity).not.toHaveBeenCalled()
    expect(outboxRows.get(USER_ID)?.size).toBe(0)
  })

  it('sends nothing from a tab whose account another tab is already writing for', async () => {
    seedRow(SAMPLE_DIGEST)
    mocked.listActivities.mockResolvedValue([])
    // Another tab holds the account's writer lock.
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: string, _options: object, callback: (l: null) => unknown) =>
          callback(null),
      },
    })
    const { send, posted } = await startWorker()

    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(mocked.createActivity).not.toHaveBeenCalled()
    expect(posted.some((m) => m.type === 'outbox')).toBe(false)
    expect(outboxRows.get(USER_ID)?.size).toBe(1)
  })

  it('leaves another account’s rows alone', async () => {
    seedRow(SAMPLE_DIGEST, 'someone-else')
    mocked.listActivities.mockResolvedValue([])
    const { send, posted } = await startWorker()

    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(posted.some((m) => m.type === 'outbox')).toBe(false)
    expect(outboxRows.get('someone-else')?.size).toBe(1)
  })

  it('writes a row before an import saves an activity and removes it once the account has it', async () => {
    let during = -1
    mocked.createActivity.mockImplementation(async (digest) => {
      during = outboxRows.get(USER_ID)?.size ?? 0
      return { record: recordFor(digest), created: true }
    })
    const { send } = await startWorker()
    mocked.listActivities.mockResolvedValue([])
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'run-a.fit')],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
    })

    expect(during).toBe(1)
    expect(outboxRows.get(USER_ID)?.size).toBe(0)
  })

  it('is dropped by Remove all, every account’s rows, so a failed row is not sent on the next load', async () => {
    seedRow(SAMPLE_DIGEST)
    seedRow(digestActivity(secondSampleActivity), 'someone-else')
    const { send } = await startWorker()

    await send({ type: 'clear', forgetDevice: true })

    expect([...outboxRows.values()].every((rows) => rows.size === 0)).toBe(true)
    mocked.listActivities.mockResolvedValue([])
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocked.createActivity).not.toHaveBeenCalled()
  })

  it('sends nothing more once Remove all comes while a save waits out a Retry-After', async () => {
    seedRow(SAMPLE_DIGEST)
    seedRow(digestActivity(secondSampleActivity))
    mocked.createActivity.mockRejectedValue(
      new ApiRequestError(429, 'rate_limited', 'Slow down', 150),
    )
    mocked.listActivities.mockResolvedValue([])
    const { send } = await startWorker()
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    await vi.waitFor(() => expect(mocked.createActivity).toHaveBeenCalled())
    const sent = mocked.createActivity.mock.calls.length

    await send({ type: 'clear', forgetDevice: true })
    // Longer than the wait the server asked for: a send that was not cancelled would have been made by now.
    await new Promise((resolve) => setTimeout(resolve, 400))

    expect(mocked.createActivity).toHaveBeenCalledTimes(sent)
    expect([...outboxRows.values()].every((rows) => rows.size === 0)).toBe(true)
  })

  it('keeps the waiting saves when the page only clears the session', async () => {
    seedRow(SAMPLE_DIGEST)
    const { send } = await startWorker()

    await send({ type: 'clear', forgetDevice: false })

    expect(outboxRows.get(USER_ID)?.size).toBe(1)
  })

  it('keeps the row of an activity the account could not take, for a reload to finish', async () => {
    mocked.createActivity.mockRejectedValue(new ApiRequestError(500, 'server_error', 'Boom'))
    mocked.listActivities.mockResolvedValue([])
    const { send } = await startWorker()
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'run-a.fit')],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
    })

    expect(outboxRows.get(USER_ID)?.size).toBe(1)
  })
})

describe('what the browser kept before sign-in, offered to the account', () => {
  const FILE = { fileName: 'run.fit', fileHash: 'a'.repeat(64) }
  const SECOND_DIGEST = digestActivity(secondSampleActivity)

  async function keptOne(digest: ActivityDigest, file: typeof FILE | null = FILE) {
    if (kept.library === null) throw new Error('the worker did not open the device library')
    await kept.library.put(workoutKeyOf(digest), digest, null, file)
  }

  it('tells the page what the kept library holds, apart from the request, once the account loads', async () => {
    mocked.listActivities.mockResolvedValue([])
    const { send, posted } = await startWorker()
    await keptOne(SAMPLE_DIGEST)
    await keptOne(SECOND_DIGEST, null)

    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    await vi.waitFor(() =>
      expect(posted).toContainEqual({ type: 'deviceOffer', adoptable: 1, again: 1, held: 0 }),
    )
    expect(posted.filter((m) => m.type === 'deviceOffer').every((m) => !('during' in m))).toBe(true)
  })

  it('says nothing when the kept library is empty', async () => {
    mocked.listActivities.mockResolvedValue([])
    const { send, posted } = await startWorker()

    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(posted.some((m) => m.type === 'deviceOffer')).toBe(false)
  })

  it('adds the kept activities to the account, removes them from the kept library and reads the library again', async () => {
    mocked.listActivities.mockResolvedValue([])
    const { send, posted } = await startWorker()
    await keptOne(SAMPLE_DIGEST)
    await keptOne(SECOND_DIGEST)
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    // The account lists what was added once it is read again.
    mocked.listActivities.mockResolvedValue([recordFor(SAMPLE_DIGEST), recordFor(SECOND_DIGEST)])

    const messages = await send({ type: 'adoptDevice', userId: USER_ID, settings: SETTINGS })

    expect(mocked.createActivity).toHaveBeenCalledTimes(2)
    expect(mocked.createActivity).toHaveBeenCalledWith(
      SAMPLE_DIGEST,
      'run.fit',
      'a'.repeat(64),
      USER_ID,
    )
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: 'adoption',
        saved: 2,
        conflicts: 0,
        failed: 0,
        again: 0,
        held: 0,
      }),
    )
    expect(await kept.library?.all()).toEqual([])
    expect(messages).toContainEqual({ type: 'deviceHolds', holds: false })
    expect(messages.at(-1)).toMatchObject({ type: 'state', state: { totalActivities: 2 } })
    expect(posted.filter((m) => m.type === 'outbox')).toEqual([])
    expect(outboxRows.get(USER_ID)?.size).toBe(0)
  })

  it('finishes an Add that a reload cut short: the saved activity leaves the kept library too', async () => {
    mocked.listActivities.mockResolvedValue([])
    const { send, posted } = await startWorker()
    await keptOne(SAMPLE_DIGEST)
    await keptOne(SECOND_DIGEST)
    // An Add queued both and stopped before sending: the rows wait in the outbox, marked as kept activities.
    const mine = new Map<string, unknown>()
    outboxRows.set(USER_ID, mine)
    for (const digest of [SAMPLE_DIGEST, SECOND_DIGEST]) {
      const key = workoutKeyOf(digest)
      mine.set(key, {
        id: `${USER_ID}|${key}`,
        userId: USER_ID,
        key,
        digestId: digest.id,
        seq: mine.size,
        digestJson: serializeDigest(digest),
        fileName: 'run.fit',
        fileHash: 'a'.repeat(64),
        attempts: 0,
        fromDevice: true,
      })
    }

    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    await vi.waitFor(() =>
      expect(posted).toContainEqual(expect.objectContaining({ type: 'outbox', finished: true })),
    )

    expect(mocked.createActivity).toHaveBeenCalledTimes(2)
    expect(await kept.library?.all()).toEqual([])
  })

  it('leaves the kept copy of an activity an ordinary import saved alone', async () => {
    mocked.listActivities.mockResolvedValue([])
    const { send } = await startWorker()
    await keptOne(SAMPLE_DIGEST)
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    await send({
      type: 'addFiles',
      files: [fitFile(sampleActivity, 'run-a.fit')],
      settings: SETTINGS,
      sync: { keepFiles: false, userId: USER_ID },
    })

    expect((await kept.library?.all())?.length).toBe(1)
  })

  it('adds nothing from a tab whose account another tab is already writing for', async () => {
    mocked.listActivities.mockResolvedValue([])
    const { send } = await startWorker()
    await keptOne(SAMPLE_DIGEST)
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })
    vi.stubGlobal('navigator', {
      locks: {
        request: async (_name: string, _options: object, callback: (lock: null) => unknown) =>
          callback(null),
      },
    })

    const messages = await send({ type: 'adoptDevice', userId: USER_ID, settings: SETTINGS })

    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      message: expect.stringMatching(/Another tab/),
    })
    expect(mocked.createActivity).not.toHaveBeenCalled()
    expect((await kept.library?.all())?.length).toBe(1)
  })

  it('refuses when the account on screen is not the one asked for', async () => {
    mocked.listActivities.mockResolvedValue([])
    const { send } = await startWorker()
    await keptOne(SAMPLE_DIGEST)
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    const messages = await send({ type: 'adoptDevice', userId: 'someone-else', settings: SETTINGS })

    expect(messages.at(-1)).toMatchObject({ type: 'error' })
    expect(mocked.createActivity).not.toHaveBeenCalled()
    expect((await kept.library?.all())?.length).toBe(1)
  })

  it('removes the kept library from this browser and leaves the account on screen', async () => {
    mocked.listActivities.mockResolvedValue([recordFor(SECOND_DIGEST)])
    const { send } = await startWorker()
    await keptOne(SAMPLE_DIGEST)
    await send({ type: 'loadServer', settings: SETTINGS, userId: USER_ID })

    const messages = await send({ type: 'forgetDeviceLibrary', settings: SETTINGS })

    expect(await kept.library?.all()).toEqual([])
    expect(messages).toContainEqual({ type: 'deviceHolds', holds: false })
    expect(messages).toContainEqual({ type: 'deviceOffer', adoptable: 0, again: 0, held: 0 })
    expect(messages.at(-1)).toMatchObject({ type: 'state', state: { totalActivities: 1 } })
    expect(mocked.deleteActivity).not.toHaveBeenCalled()
  })
})

describe('a kept library changed by another tab', () => {
  it('stops an import into a library that was emptied, writes nothing, and says so', async () => {
    const { send } = await startWorker()
    await send({ type: 'loadDevice', settings: SETTINGS })
    // Another tab chooses Remove all.
    await kept.library!.clear()

    const messages = await send(signedOutImport(fitFile()))

    expect(messages).toContainEqual({ type: 'deviceIssue', issue: 'replaced' })
    const reply = messages.at(-1)
    expect(reply).toMatchObject({ type: 'state', state: { totalActivities: 0 } })
    expect(reply).not.toHaveProperty('outcome')
    expect(await kept.library!.all()).toEqual([])
  })

  it('keeps an import that nothing interrupted', async () => {
    const { send } = await startWorker()
    await send({ type: 'loadDevice', settings: SETTINGS })

    const messages = await send(signedOutImport(fitFile()))

    expect(messages.some((message) => message.type === 'deviceIssue')).toBe(false)
    expect((await kept.library!.all()).length).toBe(1)
  })

  it('reads the library again when asked to, though this tab holds it', async () => {
    const { send } = await startWorker()
    await send({ type: 'loadDevice', settings: SETTINGS })
    // Another tab keeps an activity.
    await kept.library!.put(workoutKeyOf(SAMPLE_DIGEST), SAMPLE_DIGEST)

    const unchanged = await send({ type: 'loadDevice', settings: SETTINGS })
    expect(unchanged.at(-1)).toMatchObject({ state: { totalActivities: 0 } })
    const reloaded = await send({ type: 'loadDevice', settings: SETTINGS, reload: true })
    expect(reloaded.at(-1)).toMatchObject({ state: { totalActivities: 1 } })
  })

  it('does not drop results that show here but could not be kept, when asked to read the library again', async () => {
    kept.library = refusingLibrary()
    const { send } = await startWorker()
    await send({ type: 'loadDevice', settings: SETTINGS })
    await send(signedOutImport(fitFile()))

    const reloaded = await send({ type: 'loadDevice', settings: SETTINGS, reload: true })

    expect(reloaded.at(-1)).toMatchObject({ state: { totalActivities: 1 } })
  })
})
