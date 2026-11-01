import { digestActivity, serializeDigest } from '@rca/core/digest'
import { REVISIONS, withRevisionTable } from '@rca/core/digest/revisions'
import { hashedDigestId, minimisedForUpload } from '@rca/core/import/minimise'
import { sampleDataset } from '@rca/core/synthetic'
import type { ActivityRecord } from '@rca/contract'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, createActivity } from '../api/client'
import { memoryDeviceLibrary } from '../test/deviceLibrary.fake'
import { adoptDevice, followUpAdopted, planAdoption, standingOf } from './adoption'
import { workoutKeyOf } from './device'
import type { DeviceLibrary } from './deviceLibrary'
import type { Outbox, OutboxRow } from './outbox'
import { SendingKeys } from './sendingKeys'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  createActivity: vi.fn(),
}))

const digests = sampleDataset().activities.slice(0, 6).map(digestActivity)
const HASH = 'a'.repeat(64)
const keyOf = (index: number) => workoutKeyOf(digests[index]!)

async function keep(library: DeviceLibrary, index: number, file = true) {
  await library.put(
    keyOf(index),
    digests[index]!,
    null,
    file ? { fileName: `run-${index}.fit`, fileHash: HASH } : null,
  )
}

function recordOf(index: number): ActivityRecord {
  return {
    id: `rec-${index}`,
    digest: digests[index]!,
    fileName: `run-${index}.fit`,
    hasFile: false,
    fileSize: null,
    createdAt: 1,
  }
}

/** An outbox in memory that keeps what is added to it. */
function memoryOutbox() {
  const rows = new Map<string, OutboxRow>()
  let seq = 0
  const outbox: Outbox = {
    add: async ({ digest, fileName, fileHash, fromDevice }) => {
      const key = workoutKeyOf(digest)
      rows.set(key, {
        id: `u1|${key}`,
        userId: 'u1',
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
    pending: async () => [...rows.values()].sort((a, b) => a.seq - b.seq),
    done: async (key, digestId) => {
      if (digestId === undefined || rows.get(key)?.digestId === digestId) rows.delete(key)
    },
    failed: async () => false,
    forget: async () => rows.clear(),
  }
  return { outbox, rows }
}

beforeEach(() => {
  vi.mocked(createActivity).mockReset()
  vi.mocked(createActivity).mockImplementation(async (digest) => ({
    record: { ...recordOf(0), id: `rec-${digest.id}`, digest },
    created: true,
  }))
})

describe('what the kept library offers the account', () => {
  it('sorts the kept activities into those to add, those needing their file again, and those held', async () => {
    const library = memoryDeviceLibrary()
    await keep(library, 0)
    await keep(library, 1, false)
    await library.put(keyOf(2), { ...digests[2]!, modelRevision: 1 }, null, {
      fileName: 'old.fit',
      fileHash: HASH,
    })
    await keep(library, 3)
    const plan = planAdoption(await library.all(), new Set([keyOf(3)]))

    expect(plan.adoptable.map((entry) => entry.workoutKey)).toEqual([keyOf(0)])
    expect(plan.again).toBe(2)
    expect(plan.held).toBe(1)
  })

  it('adds what the current model reads beside its own, and asks for the file again only when it is stale', async () => {
    const eight = { revision: 8, kind: 'additive', adds: [], changes: [], affects: [] } as const
    const library = memoryDeviceLibrary()
    await library.put(keyOf(0), { ...digests[0]!, modelRevision: 8 }, null, {
      fileName: 'a.fit',
      fileHash: HASH,
    })
    // Revision 7 is compatible once 8 is additive; revision 1 never was.
    await library.put(keyOf(1), { ...digests[1]!, modelRevision: 7 }, null, {
      fileName: 'b.fit',
      fileHash: HASH,
    })
    await library.put(keyOf(2), { ...digests[2]!, modelRevision: 1 }, null, {
      fileName: 'c.fit',
      fileHash: HASH,
    })
    const entries = await library.all()

    const plan = withRevisionTable([...REVISIONS, eight], () => planAdoption(entries, new Set()))

    expect(plan.adoptable.map((entry) => entry.workoutKey).sort()).toEqual(
      [keyOf(0), keyOf(1)].sort(),
    )
    expect(plan.again).toBe(1)
  })

  it('reads the offer from the library against the account, and whether it holds anything', async () => {
    const library = memoryDeviceLibrary()
    await keep(library, 0)
    await keep(library, 1)

    const standing = await standingOf(library, new Map([['rec-1', recordOf(1)]]))

    expect(standing).toEqual({ offer: { adoptable: 1, again: 0, held: 1 }, holds: true })
  })

  it('offers nothing on a guess when the library cannot be read', async () => {
    const library = { ...memoryDeviceLibrary(), all: () => Promise.reject(new Error('no storage')) }
    expect(await standingOf(library, new Map())).toBeNull()
  })
})

describe('adding what the kept library holds to the account', () => {
  function setup() {
    const library = memoryDeviceLibrary()
    const { outbox, rows } = memoryOutbox()
    const savedRecords = new Map<string, ActivityRecord>()
    const adopted: string[] = []
    const run = () =>
      adoptDevice({
        userId: 'u1',
        library,
        outbox,
        savedRecords,
        sending: new SendingKeys(),
        post: () => undefined,
        adopted: async (id) => void adopted.push(id),
      })
    return { library, rows, savedRecords, adopted, run }
  }

  it('saves each adoptable activity with its file name and hash, then removes the kept row', async () => {
    const { library, rows, adopted, run } = setup()
    await keep(library, 0)
    await keep(library, 1)

    const result = await run()

    expect(createActivity).toHaveBeenCalledTimes(2)
    expect(createActivity).toHaveBeenCalledWith(digests[0], 'run-0.fit', HASH, 'u1')
    expect(result).toMatchObject({ saved: 2, conflicts: 0, failed: 0, again: 0, held: 0 })
    expect(await library.all()).toEqual([])
    expect(rows.size).toBe(0)
    expect(adopted.sort()).toEqual([digests[0]!.id, digests[1]!.id].sort())
  })

  it('adds a labelled activity with its label, and removes the kept row', async () => {
    const { library, rows, adopted, run } = setup()
    await keep(library, 0)
    await library.setLabel(keyOf(0), digests[0]!.id, { from: null, athleteType: 'hike' })

    const result = await run()

    expect(createActivity).toHaveBeenCalledTimes(1)
    expect(createActivity).toHaveBeenCalledWith(
      expect.objectContaining({ id: digests[0]!.id, athleteType: 'hike' }),
      'run-0.fit',
      HASH,
      'u1',
    )
    expect(result).toMatchObject({ saved: 1, conflicts: 0, failed: 0 })
    expect(await library.all()).toEqual([])
    expect(rows.size).toBe(0)
    expect(adopted).toEqual([digests[0]!.id])
  })

  it('goes through the outbox first, newest first', async () => {
    const { library, rows, run } = setup()
    await keep(library, 0)
    await keep(library, 1)
    await keep(library, 2)
    vi.mocked(createActivity).mockImplementation(async () => {
      // A save that never ends in this test: only the order the rows were queued in is looked at.
      return new Promise(() => undefined)
    })

    void run()
    await vi.waitFor(() => expect(rows.size).toBe(3))

    const started = [...rows.values()].map((row) =>
      digests.findIndex((d) => workoutKeyOf(d) === row.key),
    )
    const byStart = [0, 1, 2].sort((a, b) => digests[b]!.startMs - digests[a]!.startMs)
    expect(started).toEqual(byStart)
  })

  it('leaves what needs its file again, and what the account holds, where they are', async () => {
    const { library, savedRecords, run } = setup()
    await keep(library, 0)
    await keep(library, 1, false)
    await keep(library, 2)
    savedRecords.set('rec-2', recordOf(2))

    const result = await run()

    expect(result).toMatchObject({ saved: 1, again: 1, held: 1, failed: 0 })
    expect((await library.all()).map((entry) => entry.workoutKey).sort()).toEqual(
      [keyOf(1), keyOf(2)].sort(),
    )
  })

  it('counts a workout the account holds another file for, and keeps its row', async () => {
    const { library, run } = setup()
    await keep(library, 0)
    await keep(library, 1)
    vi.mocked(createActivity).mockImplementation(async (digest) => {
      if (digest.id === digests[0]!.id)
        throw new ApiRequestError(409, 'activity_conflict', 'Saved from another file')
      return { record: { ...recordOf(1), id: `rec-${digest.id}`, digest }, created: true }
    })

    const result = await run()

    expect(result).toMatchObject({ saved: 1, conflicts: 1, failed: 0 })
    expect((await library.all()).map((entry) => entry.workoutKey)).toEqual([keyOf(0)])
  })

  it('keeps a row whose save failed, and counts it', async () => {
    const { library, run } = setup()
    await keep(library, 0)
    vi.mocked(createActivity).mockRejectedValue(
      new ApiRequestError(500, 'server_error', 'Server error'),
    )

    const result = await run()

    expect(result).toMatchObject({ saved: 0, conflicts: 0, failed: 1 })
    expect((await library.all()).length).toBe(1)
  })

  it('does not remove a row another save replaced while its copy was being added', async () => {
    const { library, run } = setup()
    await keep(library, 0)
    vi.mocked(createActivity).mockImplementation(async (digest) => {
      // The workout is kept again under a different digest while the save is on its way.
      await library.put(keyOf(0), { ...digests[0]!, id: `${digests[0]!.id}-again` }, null, {
        fileName: 'again.fit',
        fileHash: 'b'.repeat(64),
      })
      return { record: { ...recordOf(0), digest }, created: true }
    })

    const result = await run()

    expect(result.saved).toBe(1)
    expect((await library.all()).map((entry) => entry.digest.id)).toEqual([
      `${digests[0]!.id}-again`,
    ])
  })

  it('adds nothing, and takes its rows back, when another tab emptied the kept library meanwhile', async () => {
    const { library, rows, run } = setup()
    await keep(library, 0)
    await keep(library, 1)
    const reading = library.all.bind(library)
    // Another tab chooses Remove all after this one read what is kept.
    library.all = async () => {
      const read = await reading()
      await library.clear()
      return read
    }

    const result = await run()

    expect(createActivity).not.toHaveBeenCalled()
    expect(result).toMatchObject({ saved: 0, conflicts: 0, failed: 2 })
    expect(rows.size).toBe(0)
  })

  it('stops at a limit and says why, leaving the rest kept', async () => {
    const { library, run } = setup()
    await keep(library, 0)
    await keep(library, 1)
    vi.mocked(createActivity).mockRejectedValue(
      new ApiRequestError(429, 'daily_limit', 'Daily limit', 3_600_000),
    )

    const result = await run()

    expect(result.stopped).toBe('daily-limit')
    expect(result.saved).toBe(0)
    expect(result.failed).toBe(2)
    expect((await library.all()).length).toBe(2)
  })
})

describe('following up a save that was cut short', () => {
  const rowFor = (index: number, over: Partial<OutboxRow> = {}): OutboxRow => ({
    id: `u1|${keyOf(index)}`,
    userId: 'u1',
    key: keyOf(index),
    digestId: digests[index]!.id,
    seq: 0,
    digestJson: serializeDigest(digests[index]!),
    fileName: 'run.fit',
    fileHash: HASH,
    attempts: 0,
    fromDevice: true,
    ...over,
  })

  async function run(
    row: OutboxRow,
    outcome: 'saved' | 'held' | 'kept',
    held: ActivityRecord[] = [],
  ) {
    const library = memoryDeviceLibrary()
    await keep(library, 0)
    const adopted: string[] = []
    await followUpAdopted(
      {
        library,
        savedRecords: new Map(held.map((record) => [record.id, record])),
        adopted: async (id) => void adopted.push(id),
      },
      row,
      outcome,
    )
    return { left: await library.all(), adopted }
  }

  it('removes the kept copy of a saved activity, and what else was kept for it', async () => {
    const { left, adopted } = await run(rowFor(0), 'saved')
    expect(left).toEqual([])
    expect(adopted).toEqual([digests[0]!.id])
  })

  it('removes it when the account already holds this very file', async () => {
    const { left } = await run(rowFor(0), 'held', [recordOf(0)])
    expect(left).toEqual([])
  })

  it('removes it when the file was imported under a hashed name and the account holds it under the same', async () => {
    // From revision 7 the id is made from a hash of the file name at import, so the kept digest, the row and what the
    // account holds are one id (import/minimise.ts); a replaced or sent digest is never renamed on the way.
    const hashed = { ...digests[0]!, id: hashedDigestId(digests[0]!.id) }
    const library = memoryDeviceLibrary()
    await library.put(keyOf(0), hashed, null, { fileName: 'run.fit', fileHash: HASH })
    const row = { ...rowFor(0), digestId: hashed.id, digestJson: serializeDigest(hashed) }
    const sent = minimisedForUpload(hashed, 'run.fit', { titles: false }).digest
    expect(sent.id).toBe(hashed.id)
    await followUpAdopted(
      {
        library,
        savedRecords: new Map([['rec0', { ...recordOf(0), digest: sent }]]),
      },
      row,
      'held',
    )
    expect(await library.all()).toEqual([])
  })

  it('removes it when the account row was saved before under the plain name and the kept one since under its hash', async () => {
    const plainId = `${digests[0]!.startMs}-run.fit`
    const hashed = { ...digests[0]!, id: hashedDigestId(plainId) }
    const library = memoryDeviceLibrary()
    await library.put(keyOf(0), hashed, null, { fileName: 'run.fit', fileHash: HASH })
    const row = { ...rowFor(0), digestId: hashed.id, digestJson: serializeDigest(hashed) }
    const older = { ...recordOf(0), digest: { ...digests[0]!, id: plainId, modelRevision: 5 } }
    await followUpAdopted({ library, savedRecords: new Map([['rec0', older]]) }, row, 'held')
    expect(await library.all()).toEqual([])
  })

  it('leaves it when the account holds another file for the workout', async () => {
    const other = { ...recordOf(0), digest: { ...digests[0]!, id: 'another-file' } }
    const { left } = await run(rowFor(0), 'held', [other])
    expect(left.length).toBe(1)
  })

  it('leaves it when the save did not end', async () => {
    expect((await run(rowFor(0), 'kept')).left.length).toBe(1)
  })

  it('leaves the kept copy of an activity an ordinary import saved', async () => {
    const { left } = await run(rowFor(0, { fromDevice: undefined }), 'saved')
    expect(left.length).toBe(1)
  })

  it('leaves a kept copy that was replaced since', async () => {
    const { left } = await run(rowFor(0, { digestId: 'replaced' }), 'saved')
    expect(left.length).toBe(1)
  })
})
