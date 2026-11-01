import { digestActivity } from '@rca/core/digest'
import { hashedFileName } from '@rca/core/import/minimise'
import { AnalysisSession } from '@rca/core/session'
import { sampleDataset } from '@rca/core/synthetic'
import { describe, expect, it } from 'vitest'
import { memoryDeviceLibrary } from '../test/deviceLibrary.fake'
import { deviceLabels } from './deviceLabels'

/** Labelling the kept library from an export's list, whichever form of the file name the kept workout holds. */

const SETTINGS = { massKg: 75, bikeMassKg: 9 }
const run = sampleDataset().activities.find((activity) => activity.sport === 'run')!
const HIKES = new Map([['activities/1.fit', 'Hike']])

async function labelledWith(fileName: string) {
  const library = memoryDeviceLibrary()
  await library.put('run-1', digestActivity({ ...run, id: `${run.startMs}-${fileName}` }))
  const device = { epochNow: () => null, report: async () => undefined }
  const done = await deviceLabels(new AnalysisSession(), library, device).apply(HIKES, SETTINGS)
  return { done, kept: await library.get('run-1') }
}

describe('labelling the kept library from the list', () => {
  it('labels a workout kept under the list’s own file name', async () => {
    const { done, kept } = await labelledWith('activities/1.fit')
    expect(done.labelled).toHaveLength(1)
    expect(kept?.athleteType).toBe('hike')
  })

  it('labels a workout kept under the hash of that name', async () => {
    const { done, kept } = await labelledWith(hashedFileName('activities/1.fit'))
    expect(done.labelled).toHaveLength(1)
    expect(kept?.athleteType).toBe('hike')
  })

  it('leaves a workout the list does not name', async () => {
    const { done, kept } = await labelledWith(hashedFileName('activities/2.fit'))
    expect(done.labelled).toEqual([])
    expect(kept).not.toHaveProperty('athleteType')
  })
})
