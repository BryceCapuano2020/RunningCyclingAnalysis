import { digestActivity } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import { SyncFailure } from '@rca/core/session'
import type { ActivityRecord } from '@rca/contract'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, createActivity, uploadFile } from '../api/client'
import { accountSaver } from './accountSave'
import { SAVE_CONCURRENCY } from './saveLimits'
import type { AccountSaveContext } from './accountSave'
import { workoutKeyOf } from './device'
import type { Outbox } from './outbox'
import { SendingKeys } from './sendingKeys'

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

    // The save itself succeeds: the original is held until the import is read, and fails then, saying why.
    await save(item)
    const failures = await save.finish?.(new Set())

    expect(failures).toEqual([{ key: workoutKeyOf(digest), code: 'network' }])
  })

  it('keeps the original of the shown copy, and none for a copy the analysis hides', async () => {
    const save = accountSaver(context(true))
    await save(item)

    const failures = await save.finish?.(new Set([digest.id]))

    expect(failures).toEqual([])
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('uploads the shown copy once the import is read, not as it is saved', async () => {
    const ctx = context(true)
    const save = accountSaver(ctx)
    await save(item)
    expect(uploadFile).not.toHaveBeenCalled()

    await save.finish?.(new Set())

    expect(uploadFile).toHaveBeenCalledOnce()
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

/** A call the test settles by hand, and a count of how many are open at once. */
function gated() {
  const open: (() => void)[] = []
  let live = 0
  let most = 0
  const enter = () => {
    live++
    most = Math.max(most, live)
    return new Promise<void>((resolve) =>
      open.push(() => {
        live--
        resolve()
      }),
    )
  }
  return { open, most: () => most, enter }
}

const queued = { ...item, queueable: true }
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('saving several activities at once', () => {
  it('saves a new activity in the background, and answers with a save the import can wait for', async () => {
    const ctx = context(false)
    const save = accountSaver(ctx)

    const sent = await save(queued)

    expect(sent).toBeDefined()
    await sent!.done
    expect(ctx.onSaved).toHaveBeenCalledOnce()
  })

  it('saves one that is not queueable before it answers, as before', async () => {
    const ctx = context(false)
    const save = accountSaver(ctx)

    expect(await save(item)).toBeUndefined()
    expect(ctx.onSaved).toHaveBeenCalledOnce()
  })

  it('has at most three creates open at once, and the rest wait their turn', async () => {
    const creates = gated()
    vi.mocked(createActivity).mockImplementation(async () => {
      await creates.enter()
      return { record, created: true }
    })
    const save = accountSaver(context(false))

    const sends = Array.from({ length: 6 }, (_, i) => save({ ...queued, fileName: `run-${i}.fit` }))
    await tick()
    expect(creates.open).toHaveLength(3)
    // Letting one go starts the next in line.
    creates.open[0]!()
    await tick()
    expect(creates.open).toHaveLength(4)

    for (let i = 0; i < 6; i++) {
      await tick()
      creates.open[i]?.()
    }
    const saves = await Promise.all(sends)
    await Promise.all(saves.map((sent) => sent?.done))
    expect(creates.most()).toBe(3)
  })

  it('has at most two uploads open at once, whatever the creates are doing', async () => {
    const uploads = gated()
    vi.mocked(uploadFile).mockImplementation(async () => {
      await uploads.enter()
      return { ...record, hasFile: true, fileSize: 1 }
    })
    const save = accountSaver(context(true))

    const sends = Array.from({ length: 5 }, () => save(queued))
    await tick()
    await tick()
    expect(uploads.open.length).toBeLessThanOrEqual(2)
    for (let i = 0; i < 5; i++) {
      await tick()
      uploads.open[i]?.()
    }
    const saves = await Promise.all(sends)
    await Promise.all(saves.map((sent) => sent?.done))
    // The originals are uploaded once the import is read, two at a time.
    const finished = save.finish?.(new Set())
    for (let i = 0; i < 5; i++) {
      await tick()
      uploads.open[i]?.()
    }
    await finished
    expect(uploads.most()).toBe(2)
  })

  it('holds back the next file while six saves are in flight', async () => {
    const creates = gated()
    vi.mocked(createActivity).mockImplementation(async () => {
      await creates.enter()
      return { record, created: true }
    })
    const save = accountSaver(context(false))
    const answered: number[] = []
    const sends = Array.from({ length: 8 }, (_, i) => save(queued).then(() => answered.push(i)))

    await tick()
    await tick()
    expect(answered).toHaveLength(6)
    for (let i = 0; i < 8; i++) {
      await tick()
      creates.open[i]?.()
    }
    await Promise.all(sends)
    expect(answered).toHaveLength(8)
  })

  it('holds back the next file while the files in flight are large, but always lets one in', async () => {
    const creates = gated()
    vi.mocked(createActivity).mockImplementation(async () => {
      await creates.enter()
      return { record, created: true }
    })
    const save = accountSaver(context(false))
    const big = { ...queued, bytes: new Uint8Array(40 * 1024 * 1024) }
    const answered: number[] = []

    const sends = [0, 1, 2].map((i) => save(big).then(() => answered.push(i)))
    await tick()
    await tick()
    // The first is in; the second would take them past 48 MiB, so it waits.
    expect(answered).toEqual([0])
    creates.open[0]!()
    await tick()
    await tick()
    expect(answered).toEqual([0, 1])
    for (let i = 1; i < 3; i++) {
      await tick()
      creates.open[i]?.()
    }
    await Promise.all(sends)
  })

  it('reports a failure through the save, against that activity alone, and stops the rest when it ends the saves', async () => {
    vi.mocked(createActivity)
      .mockResolvedValueOnce({ record, created: true })
      .mockRejectedValueOnce(new ApiRequestError(409, 'activity_limit', 'Library is full'))
    const ctx = context(false)
    const save = accountSaver(ctx)

    const first = await save(queued)
    const second = await save(queued)
    await expect(first!.done).resolves.toBeUndefined()
    await expect(second!.done).rejects.toBeInstanceOf(SyncFailure)
    expect(ctx.onSaved).toHaveBeenCalledOnce()
  })

  it('stops sending when the rate limit holds: slow refusals of twenty files cost the first tries and one more', async () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
    vi.mocked(createActivity).mockImplementation(async () => {
      await sleep(15)
      throw new ApiRequestError(429, 'rate_limited', 'Slow down', 1)
    })
    const ctx = context(false)
    const save = accountSaver(ctx)

    const saves: Promise<unknown>[] = []
    for (let i = 0; i < 20; i++) {
      const sent = await save({ ...queued, fileName: `run-${i}.fit` })
      saves.push(sent!.done.catch((error: unknown) => error))
    }
    const failures = await Promise.all(saves)

    // The first tries, then one save waits the limit out and tries once more; no other save is sent.
    expect(vi.mocked(createActivity).mock.calls.length).toBeLessThanOrEqual(2 + SAVE_CONCURRENCY)
    expect(failures).toHaveLength(20)
    for (const failure of failures) expect(failure).toMatchObject({ code: 'rate-limited' })
    expect(ctx.onPaused).toHaveBeenCalledOnce()
    expect(ctx.onStopped).toHaveBeenCalledOnce()
    expect(ctx.onStopped).toHaveBeenCalledWith('rate-limited')
  })

  it('sends nothing more once another failure has ended the saves, and gives the saves left the same cause', async () => {
    vi.mocked(createActivity).mockRejectedValue(
      new ApiRequestError(403, 'activity_quota', 'Library is full'),
    )
    const ctx = context(false)
    const save = accountSaver(ctx)

    const failures: unknown[] = []
    for (let i = 0; i < 12; i++) {
      const sent = await save({ ...queued, fileName: `run-${i}.fit` })
      failures.push(await sent!.done.catch((error: unknown) => error))
    }

    // One save at a time here, so the first refusal is known before the second is sent.
    expect(createActivity).toHaveBeenCalledOnce()
    for (const failure of failures) expect(failure).toMatchObject({ code: 'activity-quota' })
    expect(ctx.onStopped).toHaveBeenCalledOnce()
  })

  it('tries an upload again once when the upload slots are full, after the Retry-After', async () => {
    vi.mocked(uploadFile)
      .mockRejectedValueOnce(new ApiRequestError(429, 'upload_in_progress', 'Busy', 1))
      .mockResolvedValueOnce({ ...record, hasFile: true, fileSize: 1 })
    const ctx = context(true)
    const save = accountSaver(ctx)

    await save(item)
    await save.finish?.(new Set())

    expect(uploadFile).toHaveBeenCalledTimes(2)
    expect(ctx.onSaved).toHaveBeenCalledOnce()
  })
})

describe('uploading an original under a rate limit', () => {
  const refused = () => new ApiRequestError(429, 'rate_limited', 'Slow down', 1)

  it('waits the Retry-After and sends the same original again, with no file added again', async () => {
    vi.mocked(uploadFile)
      .mockRejectedValueOnce(refused())
      .mockResolvedValueOnce({ ...record, hasFile: true, fileSize: 1 })
    const ctx = context(true)
    const save = accountSaver(ctx)

    await save(item)
    const failures = await save.finish?.(new Set())

    expect(failures).toEqual([])
    expect(uploadFile).toHaveBeenCalledTimes(2)
    expect(ctx.onPaused).toHaveBeenCalledOnce()
    expect(ctx.onStopped).not.toHaveBeenCalled()
    expect(ctx.missingOriginals.has(workoutKeyOf(digest))).toBe(false)
  })

  it('stops after the one more try when the limit holds, and says so for every original left', async () => {
    vi.mocked(uploadFile).mockRejectedValue(refused())
    const ctx = context(true)
    const save = accountSaver(ctx)
    const other = {
      ...item,
      digest: { ...digest, id: 'other', startMs: digest.startMs + 3_600_000 },
    }
    vi.mocked(createActivity).mockResolvedValueOnce({ record, created: true })
    vi.mocked(createActivity).mockResolvedValueOnce({
      record: { ...record, id: 'rec-2', digest: other.digest },
      created: true,
    })

    await save(item)
    await save(other)
    const failures = await save.finish?.(new Set())

    // The two first tries, then one upload waits and tries once more; the other follows how that ends and is not sent again.
    expect(uploadFile).toHaveBeenCalledTimes(3)
    expect(failures).toHaveLength(2)
    for (const failure of failures ?? []) expect(failure.code).toBe('rate-limited')
    expect(ctx.onStopped).toHaveBeenCalledWith('rate-limited')
  })
})

describe('saving through the outbox', () => {
  function recordingOutbox() {
    const calls: string[] = []
    const outbox: Outbox = {
      add: async (added) => void calls.push(`add:${added.fileName}`),
      done: async (key, digestId) => void calls.push(`done:${key}:${digestId}`),
      failed: async () => false,
      pending: async () => [],
      forget: async () => undefined,
    }
    return { outbox, calls }
  }
  const withOutbox = (outbox: Outbox, keepFiles = false): AccountSaveContext => ({
    ...context(keepFiles),
    outbox,
  })

  it('writes the row before the save begins and removes it once the server has the activity', async () => {
    const { outbox, calls } = recordingOutbox()
    vi.mocked(createActivity).mockImplementation(async () => {
      calls.push('create')
      return { record, created: true }
    })

    await accountSaver(withOutbox(outbox))(item)

    expect(calls).toEqual(['add:run.fit', 'create', `done:${workoutKeyOf(digest)}:${digest.id}`])
  })

  it('removes the row when only the original file failed to upload: the digest is saved', async () => {
    const { outbox, calls } = recordingOutbox()
    vi.mocked(uploadFile).mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))

    await accountSaver(withOutbox(outbox, true))(item).catch(() => undefined)

    expect(calls).toContain(`done:${workoutKeyOf(digest)}:${digest.id}`)
  })

  it('keeps the row when the digest could not be saved, for a reload to finish', async () => {
    const { outbox, calls } = recordingOutbox()
    vi.mocked(createActivity).mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))

    await accountSaver(withOutbox(outbox))(item).catch(() => undefined)

    expect(calls).toEqual(['add:run.fit'])
  })

  it('lets the row go when the server will never take the activity', async () => {
    const { outbox, calls } = recordingOutbox()
    vi.mocked(createActivity).mockRejectedValue(
      new ApiRequestError(409, 'activity_conflict', 'Saved from another file'),
    )

    await accountSaver(withOutbox(outbox))(item).catch(() => undefined)

    expect(calls).toEqual(['add:run.fit', `done:${workoutKeyOf(digest)}:${digest.id}`])
  })

  it('removes only the row of the digest it sent, so a file added again keeps its own', async () => {
    const { outbox, calls } = recordingOutbox()
    await accountSaver(withOutbox(outbox))(item)
    expect(calls.at(-1)).toBe(`done:${workoutKeyOf(digest)}:${digest.id}`)
  })

  it('waits for a send of the same workout that is under way, such as the outbox resume’s', async () => {
    const sending = new SendingKeys()
    let release: () => void = () => undefined
    const resuming = sending.run(
      workoutKeyOf(digest),
      () => new Promise<void>((r) => (release = r)),
    )
    const saved = accountSaver({ ...context(false), sending })(item)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(createActivity).not.toHaveBeenCalled()

    release()
    await resuming
    await saved
    expect(createActivity).toHaveBeenCalledOnce()
  })

  it('saves as before where there is no outbox', async () => {
    const ctx = context(false)
    await accountSaver(ctx)(item)
    expect(ctx.onSaved).toHaveBeenCalledOnce()
  })
})

describe('saving a file for a workout the account holds from an older analysis', () => {
  const older: ActivityRecord = {
    ...record,
    id: 'rec-old',
    digest: {
      ...digest,
      id: `${digest.startMs}-activities/55.fit`,
      name: 'My own title',
      modelRevision: 5,
    },
    fileName: 'activities/55.fit',
  }
  const newer = {
    ...item,
    digest: { ...digest, id: `${digest.startMs}-rca-0123456789abcdef.fit`, name: 'Morning Run' },
    fileName: 'run.fit',
  }

  it('upgrades that row under its id, file name and title, so the title is kept', async () => {
    const ctx = { ...context(false), savedRecords: new Map([[older.id, older]]) }
    await accountSaver(ctx)(newer)
    expect(createActivity).toHaveBeenCalledWith(
      expect.objectContaining({ id: older.digest.id, name: 'My own title' }),
      'activities/55.fit',
      'hash',
      'u1',
      'rec-old',
    )
  })

  it('creates as before when the account holds no row for the workout, or one that is current', async () => {
    await accountSaver(context(false))(newer)
    expect(createActivity).toHaveBeenLastCalledWith(newer.digest, 'run.fit', 'hash', 'u1')
    const current = { ...older, digest: { ...older.digest, modelRevision: digest.modelRevision } }
    const ctx = { ...context(false), savedRecords: new Map([[current.id, current]]) }
    await accountSaver(ctx)(newer)
    expect(createActivity).toHaveBeenLastCalledWith(newer.digest, 'run.fit', 'hash', 'u1')
  })
})
