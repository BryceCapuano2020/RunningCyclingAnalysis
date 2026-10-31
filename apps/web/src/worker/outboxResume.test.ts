import { digestActivity, serializeDigest } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import type { ActivityRecord } from '@rca/contract'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, createActivity } from '../api/client'
import { workoutKeyOf } from './device'
import type { Outbox, OutboxRow } from './outbox'
import { MAX_ATTEMPTS } from './outbox'
import { resumeOutbox } from './outboxResume'
import { SendingKeys } from './sendingKeys'
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
    digestId: digest.id,
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
    done: async (key, digestId) => {
      if (digestId === undefined || rows.get(key)?.digestId === digestId) rows.delete(key)
    },
    failed: async (key, digestId) => {
      if (digestId !== undefined && rows.get(key)?.digestId !== digestId) return false
      const tried = (attempts.get(key) ?? 0) + 1
      attempts.set(key, tried)
      if (tried >= MAX_ATTEMPTS) {
        rows.delete(key)
        return true
      }
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

function setup(
  rows: OutboxRow[],
  saved: ActivityRecord[] = [],
  sending: SendingKeys = new SendingKeys(),
) {
  const posted: WorkerResponse[] = []
  const { outbox, rows: left, attempts } = memoryOutbox(rows)
  const savedRecords = new Map(saved.map((record) => [record.id, record]))
  const resume = resumeOutbox({
    userId: 'u1',
    outbox,
    savedRecords,
    sending,
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

  it('counts a refusal against the row and keeps it for the next load', async () => {
    vi.mocked(createActivity).mockRejectedValue(new ApiRequestError(500, 'server_error', 'Boom'))
    const { resume, posted, left, attempts } = setup([rowFor(0)])
    await resume.finished
    expect(attempts.get(workoutKeyOf(digests[0]!))).toBe(1)
    expect(left.size).toBe(1)
    // Still waiting, not let go: it has a few tries yet.
    expect(last(posted)).toEqual({
      type: 'outbox',
      pending: 1,
      saved: 0,
      failed: 0,
      finished: true,
    })
  })

  it('lets a row go once the refusals reach the limit, and says it could not be saved', async () => {
    vi.mocked(createActivity).mockRejectedValue(new ApiRequestError(500, 'server_error', 'Boom'))
    const { resume, posted, left, attempts } = setup([rowFor(0, { attempts: 0 })])
    attempts.set(workoutKeyOf(digests[0]!), MAX_ATTEMPTS - 1)
    await resume.finished
    expect(left.size).toBe(0)
    expect(last(posted)).toMatchObject({ pending: 0, failed: 1, finished: true })
  })

  it('does not count a lost connection against the row, however many loads it spans', async () => {
    vi.mocked(createActivity).mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
    for (let load = 0; load < MAX_ATTEMPTS + 2; load++) {
      const { resume, left, attempts } = setup([rowFor(0)])
      await resume.finished
      expect(attempts.size).toBe(0)
      expect(left.size).toBe(1)
    }
  })

  it('does not count a stop against the rows: a limit that holds keeps them as they are', async () => {
    vi.mocked(createActivity).mockRejectedValue(
      new ApiRequestError(429, 'rate_limited', 'Slow down', 1),
    )
    const { resume, posted, left, attempts } = setup(Array.from({ length: 4 }, (_, i) => rowFor(i)))
    await resume.finished
    expect(attempts.size).toBe(0)
    expect(left.size).toBe(4)
    expect(last(posted)).toEqual({
      type: 'outbox',
      pending: 4,
      saved: 0,
      failed: 0,
      finished: true,
    })
  })

  it('does not count a signed-out account or a full library against the rows', async () => {
    for (const [status, code] of [
      [401, 'unauthorized'],
      [403, 'activity_quota'],
    ] as const) {
      vi.mocked(createActivity).mockRejectedValue(new ApiRequestError(status, code, 'No'))
      const { resume, left, attempts } = setup([rowFor(0), rowFor(1)])
      await resume.finished
      expect(attempts.size).toBe(0)
      expect(left.size).toBe(2)
    }
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

  it('sends nothing after a cancel that came while a row waited out a Retry-After', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(createActivity).mockRejectedValue(
        new ApiRequestError(429, 'rate_limited', 'Slow down', 5_000),
      )
      const { resume, left, attempts } = setup([rowFor(0), rowFor(1), rowFor(2)])
      await vi.advanceTimersByTimeAsync(10)
      const sent = vi.mocked(createActivity).mock.calls.length
      expect(sent).toBeGreaterThan(0)

      // Remove all comes while the limit is being waited out.
      resume.cancel()
      await vi.advanceTimersByTimeAsync(60_000)
      await resume.finished

      expect(vi.mocked(createActivity)).toHaveBeenCalledTimes(sent)
      // Nothing was refused by the server for good: the rows are untouched.
      expect(attempts.size).toBe(0)
      expect(left.size).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('lets a row from an older analysis go without sending it, and counts it as one that could not be saved', async () => {
    const old = serializeDigest({ ...digests[0]!, modelRevision: 1 })
    const { resume, posted, left } = setup([rowFor(0, { digestJson: old }), rowFor(1)])
    await resume.finished
    expect(createActivity).toHaveBeenCalledTimes(1)
    expect(left.size).toBe(0)
    expect(last(posted)).toMatchObject({ saved: 1, failed: 1, finished: true })
  })

  it('leaves a row a newer version wrote exactly as it is', async () => {
    const newer = serializeDigest({ ...digests[0]!, modelRevision: 9999 })
    const { resume, left, attempts } = setup([rowFor(0, { digestJson: newer })])
    await resume.finished
    expect(createActivity).not.toHaveBeenCalled()
    expect(left.size).toBe(1)
    expect(attempts.size).toBe(0)
  })

  it('leaves a row to the import that is sending the same workout', async () => {
    const sending = new SendingKeys()
    let release: () => void = () => undefined
    const importing = sending.run(
      workoutKeyOf(digests[0]!),
      () => new Promise<void>((resolve) => (release = resolve)),
    )
    const { resume, left } = setup([rowFor(0), rowFor(1)], [], sending)
    await resume.finished

    expect(createActivity).toHaveBeenCalledTimes(1)
    expect(createActivity).toHaveBeenCalledWith(
      digests[1],
      expect.any(String),
      expect.any(String),
      'u1',
    )
    // Its row is the import's to settle.
    expect([...left.keys()]).toEqual([workoutKeyOf(digests[0]!)])
    release()
    await importing
  })

  it('removes only the row it sent: a file added again meanwhile keeps its own', async () => {
    const { outbox, rows } = memoryOutbox([rowFor(0)])
    vi.mocked(createActivity).mockImplementation(async (digest) => {
      // The workout's file is added again while the first save is on its way: its row replaces the first.
      rows.set(workoutKeyOf(digest), rowFor(0, { digestId: 'a-better-copy' }))
      return { record: recordOf(0), created: true }
    })
    const resume = resumeOutbox({
      userId: 'u1',
      outbox,
      savedRecords: new Map(),
      sending: new SendingKeys(),
      post: () => undefined,
    })
    await resume.finished
    expect(rows.get(workoutKeyOf(digests[0]!))?.digestId).toBe('a-better-copy')
  })
})
