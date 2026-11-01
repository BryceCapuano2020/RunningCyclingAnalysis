import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { encodeFit } from '@rca/core/fit'
import { parseActivityFile } from '@rca/core/import'
import { hashedFileName } from '@rca/core/import/minimise'
import { sampleDataset } from '@rca/core/synthetic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { originalActivity } from './originalActivity'

// The gate on: the current model revision is 7, so a file read is given an id made from a hash of its name.
vi.mock('@rca/core/digest/modelRevision', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@rca/core/digest/modelRevision')>()),
  MODEL_REVISION: 7,
}))
vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  downloadActivityFile: vi.fn(),
}))

const run = sampleDataset().activities.find((activity) => activity.sport === 'run')!

/** A saved activity as the account holds it, with the file name and id it was saved under. */
function saved(fileName: string, idName: string): ActivityRecord {
  const digest = { ...digestActivity(run), id: `${run.startMs}-${idName}`, name: 'My own title' }
  return { id: 'a1', digest, fileName, hasFile: true, fileSize: 1, createdAt: 0 }
}

describe('an original read again with the gate on', () => {
  it('is read under a hashed id by the importer, which is why the record’s own id is put back', () => {
    const parsed = parseActivityFile(
      new Uint8Array(encodeFit(run, { gps: true })),
      'activities/123.fit',
    )
    if (!parsed.ok) throw new Error(parsed.reason)
    expect(parsed.activities[0]?.id).toBe(`${run.startMs}-${hashedFileName('activities/123.fit')}`)
  })

  beforeEach(() => {
    vi.mocked(client.downloadActivityFile).mockResolvedValue(
      new Uint8Array(encodeFit(run, { gps: true })),
    )
  })

  it('keeps the id, name and title of an activity saved before, under its plain file name', async () => {
    const record = saved('activities/123.fit', 'activities/123.fit')
    const { activity } = await originalActivity(record, 'u1', record.digest.id)
    expect(activity?.id).toBe(record.digest.id)
    expect(activity?.id).toContain('activities/123.fit')
    expect(activity?.name).toBe('My own title')
    // So the rebuilt digest, and the trace read back, are of the activity as it is saved.
    expect(digestActivity(activity!).id).toBe(record.digest.id)
  })

  it('finds an activity saved with a hashed name, by its id or without one', async () => {
    const hashed = hashedFileName('activities/123.fit')
    const record = saved(hashed, hashed)
    const byId = await originalActivity(record, 'u1', record.digest.id)
    expect(byId.activity?.id).toBe(record.digest.id)
    const without = await originalActivity(record, 'u1')
    expect(without.activity?.id).toBe(record.digest.id)
  })

  it('finds an activity whose stored id is plain when asked for it by that id', async () => {
    const record = saved('activities/123.fit', 'activities/123.fit')
    const { activity } = await originalActivity(record, 'u1', `${run.startMs}-activities/123.fit`)
    expect(activity).toBeDefined()
  })
})
