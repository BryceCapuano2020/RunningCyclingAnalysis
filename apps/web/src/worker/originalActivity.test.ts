import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { encodeFit } from '@rca/core/fit'
import { sampleDataset } from '@rca/core/synthetic'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from '../api/client'
import { originalActivity } from './originalActivity'

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  downloadActivityFile: vi.fn(),
}))

const run = sampleDataset().activities.find((activity) => activity.sport === 'run')!

function recordOf(race: boolean): ActivityRecord {
  const digest = digestActivity(race ? { ...run, race: true } : run)
  return { id: 'a1', digest, fileName: 'run.fit', hasFile: true, fileSize: 1, createdAt: 0 }
}

describe('a saved activity read again from its original file', () => {
  beforeEach(() => {
    vi.mocked(client.downloadActivityFile).mockResolvedValue(
      new Uint8Array(encodeFit(run, { gps: true })),
    )
  })

  it('keeps the race tag its digest has, since the file does not carry it', async () => {
    const { activity } = await originalActivity(recordOf(true), 'u1')

    expect(activity?.race).toBe(true)
    expect(digestActivity(activity!).race).toBe(true)
  })

  it('adds no tag to an activity that had none', async () => {
    const { activity } = await originalActivity(recordOf(false), 'u1')

    expect(activity).toBeDefined()
    expect(activity).not.toHaveProperty('race')
  })
})
