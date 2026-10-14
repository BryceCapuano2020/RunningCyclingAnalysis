import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { encodeFit } from './fit'
import { AnalysisSession } from './session'
import { sampleDataset } from './synthetic'
import type { Activity, AthleteSettings, Sport } from './types'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

const sample = sampleDataset().activities

function firstOf(sport: Sport): Activity {
  const found = sample.find((activity) => activity.sport === sport)
  if (found === undefined) throw new Error(`The sample has no ${sport} activity`)
  return found
}

const run = firstOf('run')
const ride = firstOf('ride')

function fitFile(name: string, activity: Activity): File {
  return new File([new Uint8Array(encodeFit(activity, { gps: true }))], name)
}

function textFile(name: string, text: string): File {
  return new File([new TextEncoder().encode(text)], name)
}

/** A zip with two FIT files (one gzipped), one GPX file and one non-activity file. */
function exportZip(): File {
  const bytes = zipSync({
    'activities/1.fit': encodeFit(run, { gps: true }),
    'activities/2.fit.gz': gzipSync(encodeFit(ride, { gps: true })),
    'activities/3.gpx.gz': gzipSync(strToU8('<gpx version="1.1"/>')),
    'activities.csv': strToU8('Activity ID,Activity Name\n1,Morning Run\n'),
  })
  return new File([bytes], 'export.zip')
}

describe('AnalysisSession', () => {
  it('loads each FIT file as an activity and reports nothing rejected', async () => {
    const session = new AnalysisSession()
    const state = await session.addFiles(
      [fitFile('run.fit', run), fitFile('ride.fit', ride)],
      SETTINGS,
    )

    expect(state.result?.activities.map((activity) => activity.sport).sort()).toEqual([
      'ride',
      'run',
    ])
    expect(state.rejected).toEqual([])
    expect(state.unsupportedFiles).toBe(0)
    expect(state.isSample).toBe(false)
  })

  it('loads the FIT files from a zip and counts the GPX file as unsupported', async () => {
    const session = new AnalysisSession()
    const state = await session.addFiles([exportZip()], SETTINGS)

    expect(state.result?.activities).toHaveLength(2)
    expect(state.unsupportedFiles).toBe(1)
    expect(state.rejected).toEqual([])
  })

  it('de-duplicates the same workout supplied twice in one call or across calls', async () => {
    const session = new AnalysisSession()
    const once = await session.addFiles(
      [fitFile('run.fit', run), fitFile('run copy.fit', run)],
      SETTINGS,
    )
    expect(once.result?.activities).toHaveLength(1)

    const again = await session.addFiles([fitFile('run again.fit', run)], SETTINGS)
    expect(again.result?.activities).toHaveLength(1)
  })

  it('reports a garbage file as rejected with its reason and still loads the others', async () => {
    const session = new AnalysisSession()
    const state = await session.addFiles(
      [textFile('junk.fit', 'this is plainly not a FIT file'), fitFile('ride.fit', ride)],
      SETTINGS,
    )

    expect(state.result?.activities).toHaveLength(1)
    expect(state.rejected).toEqual([{ fileName: 'junk.fit', reason: 'Not a FIT file' }])
  })

  it('reports a source with no FIT content as No FIT files found', async () => {
    const session = new AnalysisSession()
    const emptyZip = new File([zipSync({ 'readme.txt': strToU8('nothing here') })], 'empty.zip')
    const state = await session.addFiles([emptyZip, textFile('notes.txt', 'hello')], SETTINGS)

    expect(state.result).toBeNull()
    expect(state.rejected).toEqual([
      { fileName: 'empty.zip', reason: 'No FIT files found' },
      { fileName: 'notes.txt', reason: 'No FIT files found' },
    ])
  })

  it('calls onProgress once per FIT file with an increasing count', async () => {
    const session = new AnalysisSession()
    const counts: number[] = []
    await session.addFiles(
      [fitFile('run.fit', run), exportZip(), fitFile('ride.fit', ride)],
      SETTINGS,
      (filesRead) => {
        counts.push(filesRead)
      },
    )
    // One run file, two FIT files inside the zip, one ride file. The GPX is not counted.
    expect(counts).toEqual([1, 2, 3, 4])
  })

  it('loadSample replaces the session with the sample and flags it', () => {
    const session = new AnalysisSession()
    const state = session.loadSample(SETTINGS)

    expect(state.isSample).toBe(true)
    expect(state.result?.activities).toHaveLength(sample.length)
    expect(state.rejected).toEqual([])
  })

  it('adding real files after the sample replaces the sample', async () => {
    const session = new AnalysisSession()
    session.loadSample(SETTINGS)
    const state = await session.addFiles([fitFile('run.fit', run)], SETTINGS)

    expect(state.isSample).toBe(false)
    expect(state.result?.activities).toHaveLength(1)
  })

  it('setSettings re-analyses with the new body weight and changes ride metabolic values', async () => {
    const session = new AnalysisSession()
    const before = await session.addFiles(
      [fitFile('run.fit', run), fitFile('ride.fit', ride)],
      SETTINGS,
    )
    const after = session.setSettings({ massKg: 90, bikeMassKg: 9 })

    const beforeCurve = before.result?.rideMetabolicCurve ?? []
    const afterCurve = after.result?.rideMetabolicCurve ?? []
    const index = beforeCurve.findIndex((point) => Number.isFinite(point.value))
    expect(index).toBeGreaterThanOrEqual(0)
    const beforeW = beforeCurve[index]?.value ?? Number.NaN
    const afterW = afterCurve[index]?.value ?? Number.NaN
    // Metabolic W/kg is power divided by body mass, so 75 kg to 90 kg scales it by 75/90.
    expect(afterW / beforeW).toBeCloseTo(75 / 90, 6)
    expect(after.result?.comparison).not.toEqual(before.result?.comparison)
    expect(after.rejected).toEqual(before.rejected)
  })

  it('clear resets every field', async () => {
    const session = new AnalysisSession()
    await session.addFiles(
      [
        exportZip(),
        textFile('junk.fit', 'not a FIT file, not even close'),
        fitFile('run.fit', run),
      ],
      SETTINGS,
    )

    expect(session.clear()).toEqual({
      result: null,
      rejected: [],
      unsupportedFiles: 0,
      isSample: false,
    })
  })

  it('clear leaves the session ready for new files and exits sample mode', async () => {
    const session = new AnalysisSession()
    session.loadSample(SETTINGS)
    session.clear()
    const state = await session.addFiles([fitFile('ride.fit', ride)], SETTINGS)

    expect(state.isSample).toBe(false)
    expect(state.result?.activities).toHaveLength(1)
  })
})
