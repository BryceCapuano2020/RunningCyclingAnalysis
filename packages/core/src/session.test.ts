import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { encodeFit } from './fit'
import { digestActivity } from './digest'
import { AnalysisSession } from './session'
import type { SyncItem } from './session'
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
      { fileName: 'notes.txt', reason: 'Unsupported file format' },
    ])
  })

  it('reports a corrupt .fit.gz as rejected for decompression, not as no FIT files', async () => {
    const session = new AnalysisSession()
    const corrupt = new File([new Uint8Array([1, 2, 3, 4, 5])], 'bad.fit.gz')
    const state = await session.addFiles([corrupt, fitFile('ride.fit', ride)], SETTINGS)

    expect(state.result?.activities).toHaveLength(1)
    expect(state.rejected).toEqual([
      { fileName: 'bad.fit.gz', reason: 'Could not decompress this file' },
    ])
  })

  it('reports a corrupt .fit.gz inside a zip under its path and keeps the other files in it', async () => {
    const session = new AnalysisSession()
    const bytes = zipSync({
      'activities/1.fit': encodeFit(run, { gps: true }),
      'activities/2.fit.gz': new Uint8Array([9, 9, 9, 9]),
    })
    const state = await session.addFiles([new File([bytes], 'export.zip')], SETTINGS)

    expect(state.result?.activities).toHaveLength(1)
    expect(state.rejected).toEqual([
      { fileName: 'activities/2.fit.gz', reason: 'Could not decompress this file' },
    ])
  })

  it('reports a truncated .fit.gz when it is the only file', async () => {
    const session = new AnalysisSession()
    const truncated = gzipSync(encodeFit(ride, { gps: true })).slice(0, 40)
    const state = await session.addFiles([new File([truncated], 'cut.fit.gz')], SETTINGS)

    expect(state.result).toBeNull()
    expect(state.rejected).toEqual([
      { fileName: 'cut.fit.gz', reason: 'Could not decompress this file' },
    ])
  })

  it('clears a rejection when a valid file later arrives under the same name', async () => {
    const session = new AnalysisSession()
    const broken = await session.addFiles(
      [new File([new Uint8Array([1, 2, 3, 4, 5])], 'bad.fit.gz')],
      SETTINGS,
    )
    expect(broken.rejected).toEqual([
      { fileName: 'bad.fit.gz', reason: 'Could not decompress this file' },
    ])

    const fixed = await session.addFiles(
      [new File([gzipSync(encodeFit(ride, { gps: true }))], 'bad.fit.gz')],
      SETTINGS,
    )
    expect(fixed.rejected).toEqual([])
    expect(fixed.result?.activities).toHaveLength(1)
  })

  it('clears a Not a FIT rejection when the same name is later read as a FIT file', async () => {
    const session = new AnalysisSession()
    const junk = await session.addFiles([textFile('ride.fit', 'plainly not a FIT file')], SETTINGS)
    expect(junk.rejected).toEqual([{ fileName: 'ride.fit', reason: 'Not a FIT file' }])

    const fixed = await session.addFiles([fitFile('ride.fit', ride)], SETTINGS)
    expect(fixed.rejected).toEqual([])
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
      totalActivities: 0,
      outdatedActivities: 0,
      incompatibleActivities: 0,
      rangeDays: null,
      syncFailures: 0,
    })
  })

  it('setRange analyses only activities within the period of the newest one', () => {
    const session = new AnalysisSession()
    session.loadSample(SETTINGS)
    const state = session.setRange(42, SETTINGS)

    const newest = Math.max(...sample.map((activity) => activity.startMs))
    const cutoff = newest - 42 * 86_400_000
    const inside = sample.filter((activity) => activity.startMs >= cutoff)
    expect(inside.length).toBeGreaterThan(0)
    expect(inside.length).toBeLessThan(sample.length)
    expect(state.result?.activities).toHaveLength(inside.length)
    expect(state.result?.activities.every((activity) => activity.startMs >= cutoff)).toBe(true)
    expect(state.totalActivities).toBe(sample.length)
    expect(state.rangeDays).toBe(42)
  })

  it('setRange(null) restores every activity', () => {
    const session = new AnalysisSession()
    session.loadSample(SETTINGS)
    session.setRange(42, SETTINGS)
    const state = session.setRange(null, SETTINGS)

    expect(state.result?.activities).toHaveLength(sample.length)
    expect(state.totalActivities).toBe(sample.length)
    expect(state.rangeDays).toBeNull()
  })

  it('setRange with nothing loaded gives no result and no activities', () => {
    const session = new AnalysisSession()
    expect(session.setRange(42, SETTINGS)).toEqual({
      result: null,
      rejected: [],
      unsupportedFiles: 0,
      isSample: false,
      totalActivities: 0,
      outdatedActivities: 0,
      incompatibleActivities: 0,
      rangeDays: 42,
      syncFailures: 0,
    })
  })

  it('excludes stale stored digests and clears their count when the original file is re-imported', async () => {
    const session = new AnalysisSession()
    const current = digestActivity(run)
    const stale = { ...current, modelRevision: 1 }
    const loaded = session.loadDigests([stale], SETTINGS)
    expect(loaded.result).toBeNull()
    expect(loaded.totalActivities).toBe(0)
    expect(loaded.outdatedActivities).toBe(1)
    expect(loaded.incompatibleActivities).toBe(0)

    const refreshed = await session.addFiles([fitFile('run.fit', run)], SETTINGS)
    expect(refreshed.result?.activities).toHaveLength(1)
    expect(refreshed.totalActivities).toBe(1)
    expect(refreshed.outdatedActivities).toBe(0)
    expect(refreshed.incompatibleActivities).toBe(0)
  })

  it('tolerates but excludes digests from a newer model revision until the file is re-imported', async () => {
    const session = new AnalysisSession()
    const future = { ...digestActivity(run), modelRevision: 3 }
    const state = session.loadDigests([future], SETTINGS)
    expect(state.result).toBeNull()
    expect(state.totalActivities).toBe(0)
    expect(state.outdatedActivities).toBe(0)
    expect(state.incompatibleActivities).toBe(1)

    const refreshed = await session.addFiles([fitFile('run.fit', run)], SETTINGS)
    expect(refreshed.result?.activities).toHaveLength(1)
    expect(refreshed.incompatibleActivities).toBe(0)
  })

  it('keeps future-revision activities out of a mixed library analysis', () => {
    const session = new AnalysisSession()
    const current = digestActivity(run)
    const future = { ...digestActivity(ride), modelRevision: 3 }
    const state = session.loadDigests([current, future], SETTINGS)

    expect(state.result?.activities).toHaveLength(1)
    expect(state.totalActivities).toBe(1)
    expect(state.incompatibleActivities).toBe(1)
    expect(state.outdatedActivities).toBe(0)
  })

  it('importing the same garbage file twice does not double-count it as rejected', async () => {
    const session = new AnalysisSession()
    const junk = (): File => textFile('junk.fit', 'this is plainly not a FIT file')
    const sameCall = await session.addFiles([junk(), junk()], SETTINGS)
    expect(sameCall.rejected).toEqual([{ fileName: 'junk.fit', reason: 'Not a FIT file' }])

    const laterCall = await session.addFiles([junk()], SETTINGS)
    expect(laterCall.rejected).toHaveLength(1)
  })

  it('importing the same zip twice does not double-count its unsupported files', async () => {
    const session = new AnalysisSession()
    const sameCall = await session.addFiles([exportZip(), exportZip()], SETTINGS)
    expect(sameCall.unsupportedFiles).toBe(1)
    expect(sameCall.result?.activities).toHaveLength(2)

    const laterCall = await session.addFiles([exportZip()], SETTINGS)
    expect(laterCall.unsupportedFiles).toBe(1)
    expect(laterCall.result?.activities).toHaveLength(2)
  })

  it('clear leaves the session ready for new files and exits sample mode', async () => {
    const session = new AnalysisSession()
    session.loadSample(SETTINGS)
    session.clear()
    const state = await session.addFiles([fitFile('ride.fit', ride)], SETTINGS)

    expect(state.isSample).toBe(false)
    expect(state.result?.activities).toHaveLength(1)
  })

  it('loadDigests replaces the library with the stored digests and keeps nothing local', async () => {
    const session = new AnalysisSession()
    session.loadSample(SETTINGS)
    await session.addFiles([exportZip()], SETTINGS)
    const state = session.loadDigests([digestActivity(ride)], SETTINGS)

    expect(state.result?.activities.map((activity) => activity.sport)).toEqual(['ride'])
    expect(state.totalActivities).toBe(1)
    expect(state.isSample).toBe(false)
    expect(state.rejected).toEqual([])
    expect(state.unsupportedFiles).toBe(0)
    expect(state.syncFailures).toBe(0)
  })

  it('loadDigests with no digests gives no result', () => {
    const session = new AnalysisSession()
    const state = session.loadDigests([], SETTINGS)
    expect(state.result).toBeNull()
    expect(state.totalActivities).toBe(0)
  })

  it('loadDigests keeps a digest and a file import of the same workout as one activity', async () => {
    const session = new AnalysisSession()
    session.loadDigests([digestActivity(run)], SETTINGS)
    const state = await session.addFiles([fitFile('run.fit', run)], SETTINGS)

    expect(state.totalActivities).toBe(1)
    expect(state.result?.activities).toHaveLength(1)
  })

  it('loadDigests keeps the period setting', () => {
    const session = new AnalysisSession()
    session.setRange(42, SETTINGS)
    const state = session.loadDigests(sampleDataset().activities.map(digestActivity), SETTINGS)
    expect(state.rangeDays).toBe(42)
    expect(state.result?.activities.length).toBeLessThan(sample.length)
  })

  it('calls the sink once per new activity with its digest, file name, hash and bytes', async () => {
    const session = new AnalysisSession()
    const items: SyncItem[] = []
    const state = await session.addFiles(
      [fitFile('run.fit', run), exportZip()],
      SETTINGS,
      undefined,
      async (item) => {
        items.push(item)
      },
    )

    expect(state.syncFailures).toBe(0)
    // The zip's first entry is the same run as run.fit, so only the ride is new.
    expect(items.map((item) => item.fileName)).toEqual(['run.fit', 'activities/2.fit'])
    expect(items.map((item) => item.digest.sport)).toEqual(['run', 'ride'])

    const runBytes = new Uint8Array(encodeFit(run, { gps: true }))
    const rideBytes = new Uint8Array(encodeFit(ride, { gps: true }))
    expect(items[0]?.bytes).toEqual(runBytes)
    expect(items[1]?.bytes).toEqual(rideBytes)
    expect(items[0]?.fileHash).toBe(await sha256Hex(runBytes))
    expect(items[1]?.fileHash).toBe(await sha256Hex(rideBytes))
    expect(items[0]?.fileHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not call the sink for a duplicate of an activity already saved', async () => {
    const session = new AnalysisSession()
    let calls = 0
    const sink = async () => {
      calls++
    }
    await session.addFiles([fitFile('run.fit', run)], SETTINGS, undefined, sink)
    const again = await session.addFiles([fitFile('run copy.fit', run)], SETTINGS, undefined, sink)

    expect(calls).toBe(1)
    expect(again.result?.activities).toHaveLength(1)
  })

  it('counts a failed sink call without failing the import', async () => {
    const session = new AnalysisSession()
    const state = await session.addFiles(
      [fitFile('run.fit', run), fitFile('ride.fit', ride)],
      SETTINGS,
      undefined,
      async (item) => {
        if (item.digest.sport === 'run') throw new Error('offline')
      },
    )

    expect(state.syncFailures).toBe(1)
    expect(state.result?.activities.map((activity) => activity.sport).sort()).toEqual([
      'ride',
      'run',
    ])
    expect(state.rejected).toEqual([])
  })

  it('retries a failed save when the same file is imported again, and clears the count on success', async () => {
    const session = new AnalysisSession()
    const failed = await session.addFiles([fitFile('run.fit', run)], SETTINGS, undefined, () =>
      Promise.reject(new Error('offline')),
    )
    expect(failed.syncFailures).toBe(1)

    const seen: string[] = []
    const retried = await session.addFiles(
      [fitFile('run.fit', run)],
      SETTINGS,
      undefined,
      async (item) => {
        seen.push(item.digest.id)
      },
    )
    expect(seen).toHaveLength(1)
    expect(retried.syncFailures).toBe(0)
    expect(retried.result?.activities).toHaveLength(1)
  })

  it('keeps a failed save counted when a later import without a sink does not touch it', async () => {
    const session = new AnalysisSession()
    await session.addFiles([fitFile('run.fit', run)], SETTINGS, undefined, () =>
      Promise.reject(new Error('offline')),
    )
    const state = await session.addFiles([fitFile('ride.fit', ride)], SETTINGS)
    expect(state.syncFailures).toBe(1)
  })

  it('clear forgets failed saves', async () => {
    const session = new AnalysisSession()
    await session.addFiles([fitFile('run.fit', run)], SETTINGS, undefined, () =>
      Promise.reject(new Error('offline')),
    )
    expect(session.clear().syncFailures).toBe(0)
  })

  it('clear resets the selected range before the next library is loaded', () => {
    const session = new AnalysisSession()
    session.loadSample(SETTINGS)
    session.setRange(42, SETTINGS)
    const cleared = session.clear()
    expect(cleared.rangeDays).toBeNull()

    const next = session.loadSample(SETTINGS)
    expect(next.rangeDays).toBeNull()
    expect(next.result?.activities).toHaveLength(sample.length)
  })

  it('does not call the sink when the file cannot be read', async () => {
    const session = new AnalysisSession()
    let calls = 0
    const state = await session.addFiles(
      [textFile('junk.fit', 'not a FIT file, not even close')],
      SETTINGS,
      undefined,
      async () => {
        calls++
      },
    )
    expect(calls).toBe(0)
    expect(state.rejected).toEqual([{ fileName: 'junk.fit', reason: 'Not a FIT file' }])
  })
})

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
