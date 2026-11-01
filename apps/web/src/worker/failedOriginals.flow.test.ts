import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, createActivity, deleteActivity, uploadFile } from '../api/client'
import { deleteSavedGroup } from './deleteGroup'
import type { DeleteGroupContext } from './deleteGroup'
import { accountSaver } from './accountSave'
import type { AccountSaveContext } from './accountSave'
import { workoutKeyOf } from './device'
import { FailedOriginals } from './failedOriginals'
import { SendingKeys } from './sendingKeys'
import { startResume } from './startResume'
import type { ResumeParts } from './startResume'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  createActivity: vi.fn(),
  uploadFile: vi.fn(),
  deleteActivity: vi.fn(),
}))
vi.mock('./heldIndex', () => ({ forgetHeldKeys: vi.fn(async () => undefined) }))
// Nothing is waiting in the outbox: the activity's summary was saved, only its original failed.
vi.mock('./outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./outbox')>()),
  openOutbox: () => ({
    add: async () => undefined,
    done: async () => undefined,
    failed: async () => false,
    pending: async () => [],
    forget: async () => undefined,
  }),
}))

const digest = digestActivity(sampleDataset().activities[0]!)
const key = workoutKeyOf(digest)
const record: ActivityRecord = {
  id: 'rec-1',
  digest,
  fileName: 'run.fit',
  hasFile: false,
  fileSize: null,
  createdAt: 1,
}
const item = { digest, fileName: 'run.fit', fileHash: 'hash', bytes: new Uint8Array([1, 2, 3]) }

function setup() {
  const failedOriginals = new FailedOriginals()
  const missingOriginals = new Set<string>()
  const savedRecords = new Map<string, ActivityRecord>()
  const ctx: AccountSaveContext = {
    sync: { keepFiles: true, userId: 'u1' },
    savedRecords,
    missingOriginals,
    routes: { remember: vi.fn() },
    onSaved: vi.fn(),
    onPaused: vi.fn(),
    onStopped: vi.fn(),
    failedOriginals,
  }
  const markSaved = vi.fn()
  const parts: ResumeParts = {
    session: { markSaved, hiddenIds: () => new Set() },
    deviceLibrary: {} as ResumeParts['deviceLibrary'],
    savedRecords,
    missingOriginals,
    failedOriginals,
    sending: new SendingKeys(),
    workbench: { remove: vi.fn() },
  }
  return { ctx, parts, markSaved, failedOriginals, missingOriginals }
}

beforeEach(() => {
  vi.stubGlobal('self', { postMessage: vi.fn() })
  vi.mocked(createActivity).mockReset()
  vi.mocked(uploadFile).mockReset()
  vi.mocked(createActivity).mockResolvedValue({ record, created: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('an original whose upload failed, and Try again now', () => {
  it('sends it again, and the activity is no longer unsaved nor missing its original', async () => {
    const { ctx, parts, markSaved, failedOriginals, missingOriginals } = setup()
    vi.mocked(uploadFile).mockRejectedValue(new ApiRequestError(500, 'server_error', 'Broke'))
    const save = accountSaver(ctx)
    await save(item)
    expect(await save.finish?.(new Set())).toEqual([{ key, code: 'original-held' }])
    expect(failedOriginals.size).toBe(1)
    expect(missingOriginals.has(key)).toBe(true)

    // Still failing: the original stays for the next try.
    await startResume(parts, 'u1', true).finished
    expect(uploadFile).toHaveBeenCalledTimes(2)
    expect(markSaved).not.toHaveBeenCalled()

    vi.mocked(uploadFile).mockResolvedValue({ ...record, hasFile: true })
    await startResume(parts, 'u1', true).finished

    expect(uploadFile).toHaveBeenCalledTimes(3)
    expect(markSaved).toHaveBeenCalledWith(key)
    expect(missingOriginals.has(key)).toBe(false)
    expect(failedOriginals.size).toBe(0)
  })

  it('is not sent by a library load, which asks for the rows only', async () => {
    const { ctx, parts } = setup()
    vi.mocked(uploadFile).mockRejectedValue(new ApiRequestError(500, 'server_error', 'Broke'))
    const save = accountSaver(ctx)
    await save(item)
    await save.finish?.(new Set())
    vi.mocked(uploadFile).mockClear()

    await startResume(parts, 'u1').finished

    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('says to add the file again when the original cannot be held', async () => {
    const { ctx } = setup()
    ctx.failedOriginals = new FailedOriginals(1)
    vi.mocked(uploadFile).mockRejectedValue(new ApiRequestError(500, 'server_error', 'Broke'))
    const save = accountSaver(ctx)
    await save(item)

    expect(await save.finish?.(new Set())).toEqual([{ key, code: 'original-unsent' }])
  })

  it('does not hold an original the server refused for good', async () => {
    const { ctx, failedOriginals } = setup()
    vi.mocked(uploadFile).mockRejectedValue(
      new ApiRequestError(403, 'storage_quota', 'Storage is full'),
    )
    const save = accountSaver(ctx)
    await save(item)

    expect(await save.finish?.(new Set())).toEqual([{ key, code: 'storage-quota' }])
    expect(failedOriginals.size).toBe(0)
  })

  it('goes with the activity when it is deleted, and is not sent to an id that is gone', async () => {
    const { ctx, parts, failedOriginals, missingOriginals } = setup()
    vi.mocked(uploadFile).mockRejectedValue(new ApiRequestError(500, 'server_error', 'Broke'))
    const save = accountSaver(ctx)
    await save(item)
    await save.finish?.(new Set())
    expect(failedOriginals.size).toBe(1)

    vi.mocked(deleteActivity).mockResolvedValue(undefined)
    const deleting = {
      session: { removeActivity: vi.fn(() => ({})) },
      savedRecords: ctx.savedRecords,
      unmatchedOriginals: new Set<string>(),
      missingOriginals,
      failedOriginals,
      routes: { forget: vi.fn() },
      workbench: { remove: vi.fn(async () => true) },
      device: { dropKept: vi.fn(async () => undefined) },
      post: vi.fn(),
      reportLibrary: vi.fn(),
    } as unknown as DeleteGroupContext
    await deleteSavedGroup(deleting, record, 'u1', {} as never)
    expect(failedOriginals.size).toBe(0)

    vi.mocked(uploadFile).mockClear()
    await startResume(parts, 'u1', true).finished
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('lets go of one whose record is gone from the library, without sending it', async () => {
    const { ctx, parts, failedOriginals } = setup()
    vi.mocked(uploadFile).mockRejectedValue(new ApiRequestError(500, 'server_error', 'Broke'))
    const save = accountSaver(ctx)
    await save(item)
    await save.finish?.(new Set())
    ctx.savedRecords.clear()
    vi.mocked(uploadFile).mockClear()

    await startResume(parts, 'u1', true).finished

    expect(uploadFile).not.toHaveBeenCalled()
    expect(failedOriginals.size).toBe(0)
  })
})
