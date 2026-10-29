import { digestActivity } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import { SyncFailure } from '@rca/core/session'
import type { ActivityRecord } from '@rca/contract'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, createActivity, uploadFile } from '../api/client'
import { accountSaver } from './accountSave'
import type { AccountSaveContext } from './accountSave'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  createActivity: vi.fn(),
  uploadFile: vi.fn(),
}))

const digest = digestActivity(sampleDataset().activities[0]!)
const record: ActivityRecord = {
  id: 'rec-1',
  digest,
  fileName: 'run.fit',
  hasFile: false,
  fileSize: null,
  createdAt: 1,
}
const item = { digest, fileName: 'run.fit', fileHash: 'hash', bytes: new Uint8Array([1]) }

function context(keepFiles: boolean): AccountSaveContext {
  return {
    sync: { keepFiles, userId: 'u1' },
    savedRecords: new Map(),
    missingOriginals: new Set(),
    routes: { remember: vi.fn() },
    onSaved: vi.fn(),
    onPaused: vi.fn(),
    onStopped: vi.fn(),
  }
}

beforeEach(() => {
  vi.mocked(createActivity).mockReset()
  vi.mocked(uploadFile).mockReset()
  vi.mocked(createActivity).mockResolvedValue({ record, created: true })
})

describe('saving an activity to the account', () => {
  it('marks a failed original upload as one that came after the digest was saved', async () => {
    vi.mocked(uploadFile).mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
    const save = accountSaver(context(true))

    const failure = await save(item).then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(SyncFailure)
    expect(failure).toMatchObject({ code: 'network', digestSaved: true })
  })

  it('does not mark a failed digest save, which is what says the network is down', async () => {
    vi.mocked(createActivity).mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
    const save = accountSaver(context(true))

    const failure = await save(item).then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toMatchObject({ code: 'network', digestSaved: false })
    expect(uploadFile).not.toHaveBeenCalled()
  })
})
