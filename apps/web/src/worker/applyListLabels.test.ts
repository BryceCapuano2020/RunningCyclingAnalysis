import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { hashedFileName } from '@rca/core/import/minimise'
import { sampleDataset } from '@rca/core/synthetic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { ApiRequestError } from '../api/client'
import { applyListLabels } from './applyListLabels'
import { ATHLETE_LABELS_ENABLED } from './labelsConfig'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  patchLabels: vi.fn(),
  listActivities: vi.fn(),
}))

const mocked = vi.mocked(client)
const run = sampleDataset().activities.find((activity) => activity.sport === 'run')!

/** A saved record of the run, read from the file named `activities/<n>.fit`. */
function record(n: number, athleteType?: 'walk' | 'hike' | 'ski' | 'other'): ActivityRecord {
  const digest = digestActivity({ ...run, id: `${run.startMs + n * 1000}-activities/${n}.fit` })
  return {
    id: `rec${n}`,
    digest: { ...digest, startMs: run.startMs + n * 1000, ...(athleteType ? { athleteType } : {}) },
    fileName: `activities/${n}.fit`,
    hasFile: true,
    fileSize: 1,
    createdAt: 1,
  }
}

const held = (count: number) =>
  new Map(Array.from({ length: count }, (_, i) => [`rec${i}`, record(i)]))
/** The record as the account holds it once the hike label is on. */
function asHike(r: ActivityRecord): ActivityRecord {
  return { ...r, digest: { ...r.digest, athleteType: 'hike' } }
}
const hikes = (count: number) =>
  new Map(Array.from({ length: count }, (_, i) => [`activities/${i}.fit`, 'Hike']))
const taken = { applied: 0, skipped: 0, refused: 0, missed: [] }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the labels switch', () => {
  it('is off: nothing labels a saved activity until the endpoint has run against remote D1', () => {
    expect(ATHLETE_LABELS_ENABLED).toBe(false)
  })
})

describe('applyListLabels', () => {
  it('sends the labels the list gives in requests of at most 200, then reads the library again', async () => {
    mocked.patchLabels.mockResolvedValue(taken)
    const after = [...held(250).values()].map(asHike)
    mocked.listActivities.mockResolvedValue(after)
    const reloaded: ActivityRecord[][] = []
    const applied = await applyListLabels(held(250), hikes(250), 'u1', (r) => reloaded.push(r))

    expect(mocked.patchLabels.mock.calls.map(([labels]) => labels.length)).toEqual([200, 50])
    expect(mocked.patchLabels.mock.calls[0]?.[0][0]).toEqual({
      id: 'rec0',
      revision: record(0).digest.modelRevision,
      from: null,
      athleteType: 'hike',
    })
    expect(mocked.patchLabels.mock.calls[0]?.[1]).toBe('u1')
    expect(applied).toHaveLength(250)
    expect(reloaded).toEqual([after])
  })

  it('labels a workout saved with a hashed file name from the list’s plain name, and one saved before with its own', async () => {
    mocked.patchLabels.mockResolvedValue(taken)
    mocked.listActivities.mockResolvedValue([])
    const hashed = await hashedFileName('activities/1.fit', 'u1')
    const saved = record(1)
    const records = new Map([
      ['rec0', record(0)],
      ['rec1', { ...saved, digest: { ...saved.digest, id: `${saved.digest.startMs}-${hashed}` } }],
    ])
    const applied = await applyListLabels(records, hikes(2), 'u1', () => undefined)
    expect(mocked.patchLabels.mock.calls[0]?.[0].map((change) => change.id)).toEqual([
      'rec0',
      'rec1',
    ])
    expect(applied).toEqual([])
  })

  it('counts as applied only the labels the account now holds, whatever the answers said', async () => {
    mocked.patchLabels.mockResolvedValue(taken)
    mocked.listActivities.mockResolvedValue([
      { ...record(0), digest: { ...record(0).digest, athleteType: 'hike' as const } },
      record(1),
    ])
    const applied = await applyListLabels(held(2), hikes(2), 'u1', () => undefined)
    expect(applied.map((p) => p.id)).toEqual(['rec0'])
  })

  it('tries a row a rebuild moved once more at its new revision, if it holds no label', async () => {
    mocked.patchLabels
      .mockResolvedValueOnce({
        ...taken,
        missed: [
          { id: 'rec0', revision: 7, athleteType: null },
          { id: 'rec1', revision: 7, athleteType: 'ski' },
        ],
      })
      .mockResolvedValueOnce(taken)
    mocked.listActivities.mockResolvedValue([])
    await applyListLabels(held(2), hikes(2), 'u1', () => undefined)

    expect(mocked.patchLabels).toHaveBeenCalledTimes(2)
    // The athlete’s own label, set meanwhile, is not written over.
    expect(mocked.patchLabels.mock.calls[1]?.[0]).toEqual([
      { id: 'rec0', revision: 7, from: null, athleteType: 'hike' },
    ])
  })

  it('does nothing for a list with no type in the table, a library already labelled, or no list', async () => {
    const labelled = new Map([['rec0', record(0, 'walk')]])
    expect(await applyListLabels(labelled, hikes(1), 'u1', () => undefined)).toEqual([])
    expect(
      await applyListLabels(held(2), new Map([['activities/0.fit', 'Run']]), 'u1', () => undefined),
    ).toEqual([])
    expect(await applyListLabels(held(2), new Map(), 'u1', () => undefined)).toEqual([])
    expect(mocked.patchLabels).not.toHaveBeenCalled()
  })

  it('reads the library back and returns the labels already applied when a later request fails', async () => {
    mocked.patchLabels
      .mockResolvedValueOnce(taken)
      .mockRejectedValueOnce(new ApiRequestError(0, 'network_error', 'Offline'))
    // The first request’s 200 labels stand; the second’s 50 did not reach the account.
    const after = [...held(250).values()].map((r, i) => (i < 200 ? asHike(r) : r))
    mocked.listActivities.mockResolvedValue(after)
    const reload = vi.fn()
    const applied = await applyListLabels(held(250), hikes(250), 'u1', reload)

    expect(mocked.patchLabels).toHaveBeenCalledTimes(2)
    expect(reload).toHaveBeenCalledWith(after)
    expect(applied).toHaveLength(200)
    expect(applied.every((p) => Number(p.id.slice(3)) < 200)).toBe(true)
  })

  it('returns nothing when the first request fails and the library shows no label', async () => {
    mocked.patchLabels.mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
    mocked.listActivities.mockResolvedValue([...held(2).values()])
    const reload = vi.fn()
    expect(await applyListLabels(held(2), hikes(2), 'u1', reload)).toEqual([])
    expect(reload).toHaveBeenCalledOnce()
  })

  it('costs the import nothing when the account cannot be read back: no labels are claimed', async () => {
    mocked.patchLabels.mockResolvedValue(taken)
    mocked.listActivities.mockRejectedValue(new ApiRequestError(0, 'network_error', 'Offline'))
    const reload = vi.fn()
    expect(await applyListLabels(held(2), hikes(2), 'u1', reload)).toEqual([])
    expect(reload).not.toHaveBeenCalled()
  })
})
