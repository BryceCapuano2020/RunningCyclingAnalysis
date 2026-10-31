import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { encodeFit } from './fit'
import { AnalysisSession } from './session'
import type { ImportCompletion } from './sessionHooks'
import { sampleDataset } from './synthetic'
import type { AthleteSettings } from './types'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const run = sampleDataset().activities.find((activity) => activity.sport === 'run')!
const TEXT = strToU8('not an activity')

async function completionOf(files: File[]): Promise<ImportCompletion> {
  let completion: ImportCompletion | null = null
  await new AnalysisSession().addFiles(files, SETTINGS, undefined, undefined, false, (done) => {
    completion = done
  })
  if (completion === null) throw new Error('the import did not complete')
  return completion
}

describe('an import that skips activity files in a format the app does not read', () => {
  it('names the formats by extension, with how many of each', async () => {
    const zip = new File(
      [
        new Uint8Array(
          zipSync({
            'a.fit': encodeFit(run, { gps: true }),
            'b.pwx': TEXT,
            'c.pwx': TEXT,
            'routes/d.kml': TEXT,
          }),
        ),
      ],
      'export.zip',
    )
    const completion = await completionOf([zip, new File([TEXT], 'e.hrm')])

    expect(completion.skippedTypes).toEqual({ pwx: 2, kml: 1, hrm: 1 })
    // They are counted as refused, as before; the names are what is new.
    expect(completion.rejected).toBe(4)
  })

  it('leaves the field out when nothing was skipped, so an import’s outcome is as it was', async () => {
    const completion = await completionOf([
      new File([new Uint8Array(encodeFit(run, { gps: true }))], 'a.fit'),
    ])
    expect('skippedTypes' in completion).toBe(false)
  })
})
