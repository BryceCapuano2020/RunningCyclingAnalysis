import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { encodeFit } from '@rca/core/fit'
import { AnalysisSession } from '@rca/core/session'
import { sampleDataset } from '@rca/core/synthetic'
import type { ActivityDigest } from '@rca/core/types'
import { gzipSync, strToU8, zipSync } from 'fflate'
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

describe('a rebuild after an import from an export', () => {
  /** Imports the zip, and returns the digest saved for its one activity with the original file's bytes. */
  async function imported(zip: Uint8Array): Promise<{ digest: ActivityDigest; bytes: Uint8Array }> {
    const saved: Array<{ digest: ActivityDigest; bytes: Uint8Array }> = []
    await new AnalysisSession().addFiles(
      [new File([new Uint8Array(zip)], 'export.zip')],
      { massKg: 75, bikeMassKg: 9 },
      undefined,
      async ({ digest, bytes }) => {
        saved.push({ digest, bytes })
      },
    )
    expect(saved).toHaveLength(1)
    return saved[0]!
  }

  async function rebuilt({ digest, bytes }: { digest: ActivityDigest; bytes: Uint8Array }) {
    vi.mocked(client.downloadActivityFile).mockResolvedValue(new Uint8Array(bytes))
    const record = { id: 'a1', digest, fileName: 'x.fit', hasFile: true, fileSize: 1, createdAt: 0 }
    const { activity } = await originalActivity(record, 'u1')
    return digestActivity(activity!)
  }

  it('keeps the name and the race tag a Strava export gave', async () => {
    const csv =
      'Activity Name,Activity Type,Filename,Competition\nCity 10K,Run,activities/1.fit.gz,1.0\n'
    const saved = await imported(
      zipSync({
        'activities/1.fit.gz': gzipSync(encodeFit(run, { gps: true })),
        'activities.csv': strToU8(csv),
      }),
    )
    expect(saved.digest.name).toBe('City 10K')

    const again = await rebuilt(saved)
    expect(again.name).toBe('City 10K')
    expect(again.race).toBe(true)
  })

  it('keeps the name a Garmin export gave', async () => {
    const summaries = JSON.stringify([
      { summarizedActivitiesExport: [{ name: 'Green Lake Loop', startTimeGmt: run.startMs }] },
    ])
    const saved = await imported(
      zipSync({
        'DI_CONNECT/DI-Connect-Fitness/a_0_summarizedActivities.json': strToU8(summaries),
        'DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip': zipSync({
          'a_1.fit': encodeFit(run, { gps: true }),
        }),
      }),
    )
    expect(saved.digest.name).toBe('Green Lake Loop')

    const again = await rebuilt(saved)
    expect(again.name).toBe('Green Lake Loop')
    expect(again).not.toHaveProperty('race')
  })
})
