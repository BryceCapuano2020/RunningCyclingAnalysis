import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, uploadFile } from '../api/client'
import { workoutKeyOf } from './device'
import { FailedOriginals } from './failedOriginals'
import type { RetryContext } from './failedOriginals'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  uploadFile: vi.fn(),
}))

const [first, second, third] = sampleDataset().activities.map(digestActivity)

function recordOf(digest: typeof first): ActivityRecord {
  return {
    id: `rec-${digest!.id}`,
    digest,
    fileName: 'f.fit',
    hasFile: false,
    fileSize: null,
    createdAt: 1,
  } as ActivityRecord
}

function context(over: Partial<RetryContext> = {}): RetryContext {
  return {
    userId: 'u1',
    savedRecords: new Map(),
    missingOriginals: new Set(),
    hiddenIds: () => new Set(),
    cancelled: () => false,
    post: vi.fn(),
    ...over,
  }
}

const bytes = new Uint8Array(10)

beforeEach(() => {
  vi.mocked(uploadFile).mockReset()
})

describe('originals whose upload failed', () => {
  it('holds one for a failure that passes, and not for one that does not', () => {
    const held = new FailedOriginals()
    expect(held.keep('u1', recordOf(first), bytes, 'server')).toBe(true)
    expect(held.keep('u1', recordOf(second), bytes, 'storage-quota')).toBe(false)
    expect(held.size).toBe(1)
  })

  it('refuses one past its byte budget, so the athlete is told to add the file again', () => {
    const held = new FailedOriginals(15)
    expect(held.keep('u1', recordOf(first), bytes, 'network')).toBe(true)
    expect(held.keep('u1', recordOf(second), bytes, 'network')).toBe(false)
    held.drop(workoutKeyOf(first!))
    expect(held.keep('u1', recordOf(second), bytes, 'network')).toBe(true)
  })

  it('uploads each again, records the stored copy and says the original is no longer missing', async () => {
    const held = new FailedOriginals()
    const record = recordOf(first)
    held.keep('u1', record, bytes, 'server')
    vi.mocked(uploadFile).mockResolvedValue({ ...record, hasFile: true })
    const ctx = context({ missingOriginals: new Set([workoutKeyOf(first!)]) })

    const settled = await held.retry(ctx)

    expect(settled).toEqual([workoutKeyOf(first!)])
    expect(uploadFile).toHaveBeenCalledWith(record.id, bytes, 'u1')
    expect(ctx.savedRecords.get(record.id)?.hasFile).toBe(true)
    expect(ctx.missingOriginals.size).toBe(0)
    expect(ctx.post).toHaveBeenCalledWith({ type: 'missingOriginals', count: 0 })
    expect(held.size).toBe(0)
  })

  it('keeps one that fails again, for the next try', async () => {
    const held = new FailedOriginals()
    held.keep('u1', recordOf(first), bytes, 'server')
    vi.mocked(uploadFile).mockRejectedValue(new ApiRequestError(500, 'server_error', 'Broke'))

    expect(await held.retry(context())).toEqual([])
    expect(held.size).toBe(1)

    vi.mocked(uploadFile).mockResolvedValue({ ...recordOf(first), hasFile: true })
    expect(await held.retry(context())).toHaveLength(1)
  })

  it('lets go of one whose copy the analysis hides, and of one held for another account', async () => {
    const held = new FailedOriginals()
    held.keep('u1', recordOf(first), bytes, 'server')
    held.keep('u2', recordOf(second), bytes, 'server')

    const settled = await held.retry(context({ hiddenIds: () => new Set([first!.id]) }))

    expect(settled).toEqual([workoutKeyOf(first!)])
    expect(uploadFile).not.toHaveBeenCalled()
    expect(held.size).toBe(0)
  })

  it('sends nothing once the resume is cancelled', async () => {
    const held = new FailedOriginals()
    held.keep('u1', recordOf(first), bytes, 'server')

    await held.retry(context({ cancelled: () => true }))

    expect(uploadFile).not.toHaveBeenCalled()
    expect(held.size).toBe(1)
  })

  it('stops at a refusal that would repeat for every other', async () => {
    const held = new FailedOriginals()
    held.keep('u1', recordOf(first), bytes, 'server')
    held.keep('u1', recordOf(second), bytes, 'server')
    held.keep('u1', recordOf(third), bytes, 'server')
    vi.mocked(uploadFile).mockRejectedValue(new ApiRequestError(401, 'unauthorized', 'Out'))

    await held.retry(context())

    // Two uploads run at once; the third is not sent after they are refused.
    expect(uploadFile).toHaveBeenCalledTimes(2)
    expect(held.size).toBe(3)
  })
})
