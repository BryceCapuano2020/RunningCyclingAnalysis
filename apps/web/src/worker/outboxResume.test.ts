import { digestActivity } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import type { ActivityRecord } from '@rca/contract'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, createActivity } from '../api/client'
import { workoutKeyOf } from './device'
import type { Outbox, OutboxRow } from './outbox'
import { MAX_ATTEMPTS } from './outbox'
import { resumeOutbox } from './outboxResume'
import type { WorkerResponse } from './protocol'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  createActivity: vi.fn(),
}))

const digests = sampleDataset().activities.slice(0, 6).map(digestActivity)

function rowFor(digestIndex: number, over: Partial<OutboxRow> = {}): OutboxRow {
  const digest = digests[digestIndex]!
  return {
    id: `u1|${workoutKeyOf(digest)}`,
    userId: 'u1',
    key: workoutKeyOf(digest),
    seq: digestIndex,
    digestJson: JSON.stringify(digest),
    fileName: `run-${digestIndex}.fit`,
    fileHash: 'a'.repeat(64),
    attempts: 0,
    ...over,
  }
}

/** An outbox in memory, recording what became of each row. */
function memoryOutbox(start: OutboxRow[]) {
  const rows = new Map(start.map((row) => [row.key, row]))
  const attempts = new Map<string, number>()
  const outbox: Outbox = {
    add: async () => undefined,
    pending: async () => [...rows.values()],
    done: async (key) => void rows.delete(key),
    failed: async (key) => {
      attempts.set(key, (attempts.get(key) ?? 0) + 1)
      return false
    },
    forget: async () => rows.clear(),
  }
  return { outbox, rows, attempts }
}

function recordOf(index: number): ActivityRecord {
  const digest = digests[index]!
  return {
    id: `rec-${index}`,
    digest,
    fileName: `run-${index}.fit`,
    hasFile: false,
    fileSize: null,
    createdAt: 1,
  }
}

function setup(rows: OutboxRow[], saved: ActivityRecord[] = []) {
  const posted: WorkerResponse[] = []
  const { outbox, rows: left, attempts } = memoryOutbox(rows)
  const savedRecords = new Map(saved.map((record) => [record.id, record]))
  const resume = resumeOutbox({
    userId: 'u1',
    outbox,
    savedRecords,
    post: (message) => posted.push(message),
  })
  return { resume, posted, left, attempts, savedRecords }
}

const last = (posted: WorkerResponse[]) => posted.at(-1)

beforeEach(() => {
  vi.mocked(createActivity).mockReset()
  vi.mocked(createActivity).mockImplementation(async (digest) => ({
    record: { ...recordOf(0), id: `rec-${digest.id}`, digest },
    created: true,
  }))
})

describe('resuming the saves an earlier visit left', () => {
  it('says nothing when the outbox is empty', async () => {
    const { resume, posted } = setup([])
    await resume.finished
    expect(posted).toEqual([])
    expect(createActivity).not.toHaveBeenCalled()
  })

  it('saves each row, removes it, and ends by saying how many were saved', async () => {
    const { resume, posted, left, savedRecords } = setup([rowFor(0), rowFor(1), rowFor(2)])
    await resume.finished

    expect(createActivity).toHaveBeenCalledTimes(3)
    expect(createActivity).toHaveBeenCalledWith(digests[0], 'run-0.fit', 'a'.repeat(64), 'u1')
    expect(left.size).toBe(0)
    expect(savedRecords.size).toBe(3)
    expect(posted[0]).toEqual({ type: 'outbox', pending: 3, saved: 0, failed: 0, finished: false })
    expect(last(posted)).toEqual({
      type: 'outbox',
      pending: 0,
      saved: 3,
      failed: 0,
      finished: true,
    })
  })

  it('does not send what the server already has, but removes its row', async () => {
    const { resume, left } = setup([rowFor(0), rowFor(1)], [recordOf(0)])
    await resume.finished
    expect(createActivity).toHaveBeenCalledTimes(1)
    expect(left.size).toBe(0)
  })

  it('lets a row go that no longer reads, and counts it as one that could not be saved', async () => {
    const { resume, posted, left } = setup([rowFor(0, { digestJson: '{"version":99}' }), rowFor(1)])
    await resume.finished
    expect(left.size).toBe(0)
    expect(last(posted)).toMatchObject({ saved: 1, failed: 1, finished: true })
  })

  it('counts a failed try against the row and keeps it for the next load', async () => {
    vi.mocked(createActivity).mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
    const { resume, posted, left, attempts } = setup([rowFor(0)])
    await resume.finished
    expect(attempts.get(workoutKeyOf(digests[0]!))).toBe(1)
    expect(left.size).toBe(1)
    expect(last(posted)).toMatchObject({ saved: 0, failed: 1, finished: true })
    expect(MAX_ATTEMPTS).toBeGreaterThan(1)
  })

  it('lets a row go that the server will never take', async () => {
    vi.mocked(createActivity).mockRejectedValue(
      new ApiRequestError(409, 'activity_conflict', 'Saved from another file'),
    )
    const { resume, left, attempts } = setup([rowFor(0)])
    await resume.finished
    expect(left.size).toBe(0)
    expect(attempts.size).toBe(0)
  })

  it('stops at a limit that would refuse the rest the same way, and leaves them for another day', async () => {
    vi.mocked(createActivity).mockRejectedValue(
      new ApiRequestError(429, 'daily_limit', 'Daily limit', 3_600_000),
    )
    const { resume, posted, left } = setup(Array.from({ length: 6 }, (_, i) => rowFor(i)))
    await resume.finished
    // Three in flight at once failed; the rest were never sent.
    expect(vi.mocked(createActivity).mock.calls.length).toBeLessThanOrEqual(3)
    expect(left.size).toBeGreaterThanOrEqual(3)
    expect(last(posted)).toMatchObject({ finished: true })
    expect((last(posted) as { pending: number }).pending).toBeGreaterThan(0)
  })

  it('stops sending when cancelled, and keeps the rows', async () => {
    const releases: (() => void)[] = []
    vi.mocked(createActivity).mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ record: recordOf(0), created: true }))
        }),
    )
    const { resume, left } = setup(Array.from({ length: 6 }, (_, i) => rowFor(i)))
    await new Promise((resolve) => setTimeout(resolve, 5))
    resume.cancel()
    for (const release of releases) release()
    await resume.finished
    expect(vi.mocked(createActivity).mock.calls.length).toBeLessThanOrEqual(3)
    expect(left.size).toBeGreaterThanOrEqual(3)
  })
})
