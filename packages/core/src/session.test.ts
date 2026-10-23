import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { encodeFit } from './fit'
import { encodeGpx } from './gpx/encode'
import { encodeTcx } from './tcx/encode'
import { digestActivity } from './digest'
import { MODEL_REVISION } from './digest/modelRevision'
import { parseActivityFile } from './import'
import { AnalysisSession, SyncFailure } from './session'
import type { RejectedFile, SyncIssueCode, SyncItem } from './session'
import { DEFAULT_ATHLETE, generateActivity, sampleDataset } from './synthetic'
import type { Activity, ActivityDigest, AthleteSettings, Sport } from './types'

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

/** The same workout two days later, so that it is not a duplicate of the original. */
function later(activity: Activity): Activity {
  return { ...activity, startMs: activity.startMs + 2 * 24 * 3_600_000 }
}

/** A zip with two FIT files (one gzipped), one KML file and one non-activity file. */
function exportZip(): File {
  const bytes = zipSync({
    'activities/1.fit': encodeFit(run, { gps: true }),
    'activities/2.fit.gz': gzipSync(encodeFit(ride, { gps: true })),
    'activities/3.kml': strToU8('<kml/>'),
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

  it('loads the FIT files from a zip and counts the KML file as unsupported', async () => {
    const session = new AnalysisSession()
    const state = await session.addFiles([exportZip()], SETTINGS)

    expect(state.result?.activities).toHaveLength(2)
    expect(state.unsupportedFiles).toBe(1)
    expect(state.rejected).toEqual([])
  })

  it('loads the FIT, GPX and TCX files inside one zip as three activities', async () => {
    const session = new AnalysisSession()
    const bytes = zipSync({
      'activities/1.fit': encodeFit(run, { gps: true }),
      'activities/2.gpx.gz': gzipSync(encodeGpx(ride)),
      'activities/3.tcx': encodeTcx(later(run), { gps: true }),
    })
    const state = await session.addFiles([new File([bytes], 'export.zip')], SETTINGS)

    expect(state.result?.activities.map((activity) => activity.sport).sort()).toEqual([
      'ride',
      'run',
      'run',
    ])
    expect(state.rejected).toEqual([])
    expect(state.unsupportedFiles).toBe(0)
  })

  it('reads a Strava-shaped export zip as it is: gzipped FIT and GPX files in activities/', async () => {
    const session = new AnalysisSession()
    const bytes = zipSync({
      'activities/1001.fit.gz': gzipSync(encodeFit(run, { gps: true })),
      'activities/1002.gpx.gz': gzipSync(encodeGpx(ride)),
      'activities.csv': strToU8('Activity ID,Activity Name\n1001,Morning Run\n'),
    })
    const state = await session.addFiles([new File([bytes], 'export.zip')], SETTINGS)

    expect(state.result?.activities.map((activity) => activity.sport).sort()).toEqual([
      'ride',
      'run',
    ])
    expect(state.rejected).toEqual([])
  })

  it('loads a GPX file and a TCX file given on their own', async () => {
    const session = new AnalysisSession()
    const state = await session.addFiles(
      [
        new File([new Uint8Array(encodeGpx(ride))], 'ride.gpx'),
        new File([new Uint8Array(encodeTcx(later(run)))], 'run.tcx'),
      ],
      SETTINGS,
    )

    expect(state.result?.activities.map((activity) => activity.sport).sort()).toEqual([
      'ride',
      'run',
    ])
    expect(state.rejected).toEqual([])
  })

  it('rejects a GPX file with no activity records, under its own name', async () => {
    const session = new AnalysisSession()
    const state = await session.addFiles(
      [textFile('empty.gpx', '<gpx version="1.1"></gpx>'), fitFile('ride.fit', ride)],
      SETTINGS,
    )

    expect(state.result?.activities).toHaveLength(1)
    expect(state.rejected).toEqual([
      { fileName: 'empty.gpx', reason: 'File contains no activity records' },
    ])
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

  it('reports the digests an import adds, leaving out copies it skips and what it replaces', async () => {
    const session = new AnalysisSession()
    const added: ActivityDigest[][] = []
    const record = (outcome: { added: ActivityDigest[] }) => {
      added.push(outcome.added)
    }
    const import_ = (files: File[]) =>
      session.addFiles(files, SETTINGS, undefined, undefined, false, record)

    await import_([fitFile('run.fit', run), fitFile('run copy.fit', run)])
    await import_([fitFile('run again.fit', run)])
    await import_([fitFile('ride.fit', later(ride))])

    expect(added.map((digests) => digests.map((digest) => digest.sport))).toEqual([
      ['run'],
      [],
      ['ride'],
    ])
  })

  it('reports progress for an activity file that cannot be read, so the count reaches the total', async () => {
    const session = new AnalysisSession()
    const progress: number[] = []
    await session.addFiles(
      [fitFile('run.fit', run), new File([new Uint8Array([9, 9, 9, 9])], 'broken.fit.gz')],
      SETTINGS,
      (count) => progress.push(count),
    )
    expect(progress).toEqual([1, 2])
  })

  it('reaches the count of activity files an archive lists, even for an entry it lost unread', async () => {
    const session = new AnalysisSession()
    const bytes = zipSync(
      {
        'activities/1.fit': encodeFit(run, { gps: true }),
        'activities/2.fit': encodeFit(ride, { gps: true }),
        'activities/3.fit': encodeFit(later(run), { gps: true }),
      },
      { level: 0 },
    )
    // Break the second local header's signature, so the archive skips that entry without reporting it.
    const locals: number[] = []
    for (let i = 0; i + 3 < bytes.length; i++) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 3 && bytes[i + 3] === 4) {
        locals.push(i)
      }
    }
    bytes[locals[1]! + 2] = 0
    const progress: number[] = []
    await session.addFiles([new File([bytes], 'mid.zip')], SETTINGS, (count) =>
      progress.push(count),
    )

    expect(progress.at(-1)).toBe(3)
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
      { fileName: 'empty.zip', reason: 'No supported activity files found (FIT, GPX or TCX)' },
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
    // One run file, two FIT files inside the zip, one ride file. The KML file is not counted.
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
      hiddenDuplicates: 0,
      rangeDays: null,
      syncIssues: [],
      trend: [],
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
      hiddenDuplicates: 0,
      rangeDays: 42,
      syncIssues: [],
      trend: [],
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

  it('treats revision 3 digests, from before air density followed altitude, as outdated', async () => {
    const session = new AnalysisSession()
    const previous = { ...digestActivity(run), modelRevision: 3 }
    const loaded = session.loadDigests([previous], SETTINGS)
    expect(loaded.result).toBeNull()
    expect(loaded.outdatedActivities).toBe(1)
    expect(loaded.incompatibleActivities).toBe(0)
    const refreshed = await session.addFiles([fitFile('run.fit', run)], SETTINGS)
    expect(refreshed.outdatedActivities).toBe(0)
  })

  it('tolerates but excludes digests from a newer model revision until the file is re-imported', async () => {
    const session = new AnalysisSession()
    const future = { ...digestActivity(run), modelRevision: MODEL_REVISION + 1 }
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
    const future = { ...digestActivity(ride), modelRevision: MODEL_REVISION + 1 }
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
    expect(state.syncIssues).toEqual([])
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

    expect(state.syncIssues).toEqual([])
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

  it('can sync an existing duplicate when original-file retention is enabled', async () => {
    const session = new AnalysisSession()
    const first = await session.addFiles([fitFile('run.fit', run)], SETTINGS)
    const synced: SyncItem[] = []
    const again = await session.addFiles(
      [fitFile('run again.fit', run)],
      SETTINGS,
      undefined,
      async (item) => {
        synced.push(item)
      },
      true,
    )

    expect(synced).toHaveLength(1)
    expect(synced[0]?.digest.id).toBe(first.result?.activities[0]?.id)
    expect(synced[0]?.digest.startMs).toBe(first.result?.activities[0]?.startMs)
    expect(synced[0]?.digest.sport).toBe(first.result?.activities[0]?.sport)
    expect(synced[0]?.fileName).toBe('run again.fit')
    expect(synced[0]?.fileHash).toMatch(/^[0-9a-f]{64}$/)
    expect(again.result?.activities).toHaveLength(1)
    expect(again.syncIssues).toEqual([])
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

    expect(state.syncIssues).toEqual([{ code: 'server', count: 1 }])
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
    expect(failed.syncIssues).toEqual([{ code: 'server', count: 1 }])

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
    expect(retried.syncIssues).toEqual([])
    expect(retried.result?.activities).toHaveLength(1)
  })

  it('keeps a failed save counted when a later import without a sink does not touch it', async () => {
    const session = new AnalysisSession()
    await session.addFiles([fitFile('run.fit', run)], SETTINGS, undefined, () =>
      Promise.reject(new Error('offline')),
    )
    const state = await session.addFiles([fitFile('ride.fit', ride)], SETTINGS)
    expect(state.syncIssues).toEqual([{ code: 'server', count: 1 }])
  })

  it('clear forgets failed saves', async () => {
    const session = new AnalysisSession()
    await session.addFiles([fitFile('run.fit', run)], SETTINGS, undefined, () =>
      Promise.reject(new Error('offline')),
    )
    expect(session.clear().syncIssues).toEqual([])
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

  it('stops calling the sink after a sign-out but still analyses the rest of the import', async () => {
    const session = new AnalysisSession()
    const attempted: Sport[] = []
    const state = await session.addFiles(
      [fitFile('run.fit', run), fitFile('ride.fit', ride)],
      SETTINGS,
      undefined,
      async (item) => {
        attempted.push(item.digest.sport)
        throw new SyncFailure('signed-out', 'Sign in required')
      },
    )

    expect(attempted).toEqual(['run'])
    expect(state.syncIssues).toEqual([{ code: 'signed-out', count: 2 }])
    expect(state.result?.activities.map((activity) => activity.sport).sort()).toEqual([
      'ride',
      'run',
    ])
  })

  it('stops calling the sink after an account change', async () => {
    const session = new AnalysisSession()
    let calls = 0
    const state = await session.addFiles(
      [fitFile('run.fit', run), fitFile('ride.fit', ride)],
      SETTINGS,
      undefined,
      async () => {
        calls++
        throw new SyncFailure('account-changed', 'Reload')
      },
    )

    expect(calls).toBe(1)
    expect(state.syncIssues).toEqual([{ code: 'account-changed', count: 2 }])
  })

  it('keeps saving the rest of the import after a rate limit or a network failure', async () => {
    const session = new AnalysisSession()
    const attempted: Sport[] = []
    const state = await session.addFiles(
      [fitFile('run.fit', run), fitFile('ride.fit', ride)],
      SETTINGS,
      undefined,
      async (item) => {
        attempted.push(item.digest.sport)
        if (item.digest.sport === 'run') throw new SyncFailure('rate-limited', 'Daily limit')
        throw new SyncFailure('network', 'Offline')
      },
    )

    expect(attempted).toEqual(['run', 'ride'])
    expect(state.syncIssues).toEqual([
      { code: 'rate-limited', count: 1 },
      { code: 'network', count: 1 },
    ])
  })

  it.each<SyncIssueCode>(['digest-quota', 'database-full'])(
    'stops calling the sink after a %s failure, since every further save would fail the same way',
    async (code) => {
      const session = new AnalysisSession()
      const attempted: Sport[] = []
      const state = await session.addFiles(
        [fitFile('run.fit', run), fitFile('ride.fit', ride)],
        SETTINGS,
        undefined,
        async (item) => {
          attempted.push(item.digest.sport)
          throw new SyncFailure(code, 'Full')
        },
      )

      expect(attempted).toEqual(['run'])
      expect(state.syncIssues).toEqual([{ code, count: 2 }])
    },
  )

  it('keeps saving the rest of the import after one activity conflicts with a saved copy', async () => {
    const session = new AnalysisSession()
    const attempted: Sport[] = []
    const state = await session.addFiles(
      [fitFile('run.fit', run), fitFile('ride.fit', ride)],
      SETTINGS,
      undefined,
      async (item) => {
        attempted.push(item.digest.sport)
        if (item.digest.sport === 'run') throw new SyncFailure('activity-conflict', 'Different')
      },
    )

    expect(attempted).toEqual(['run', 'ride'])
    expect(state.syncIssues).toEqual([{ code: 'activity-conflict', count: 1 }])
  })

  it('counts a failure that is not a SyncFailure as a server failure', async () => {
    const session = new AnalysisSession()
    const state = await session.addFiles([fitFile('run.fit', run)], SETTINGS, undefined, () =>
      Promise.reject(new Error('boom')),
    )
    expect(state.syncIssues).toEqual([{ code: 'server', count: 1 }])
  })

  it('keeps sync issues across a library reload until the activities are saved', async () => {
    const session = new AnalysisSession()
    await session.addFiles([fitFile('run.fit', run)], SETTINGS, undefined, () =>
      Promise.reject(new SyncFailure('network', 'Offline')),
    )

    const reloaded = session.loadDigests([digestActivity(ride)], SETTINGS)
    expect(reloaded.syncIssues).toEqual([{ code: 'network', count: 1 }])

    const saved = await session.addFiles([fitFile('run.fit', run)], SETTINGS, undefined, () =>
      Promise.resolve(),
    )
    expect(saved.syncIssues).toEqual([])
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

/** The activity starting `ms` later, as GPS lag makes a GPX or TCX copy start after its FIT. */
function shifted(activity: Activity, ms: number): Activity {
  return { ...activity, startMs: activity.startMs + ms }
}

/** A run of `durationS` seconds from the synthetic generator. */
function runOf(startMs: number, durationS: number): Activity {
  return generateActivity(
    DEFAULT_ATHLETE,
    {
      id: `run-${durationS}`,
      name: 'Run',
      sport: 'run',
      startMs,
      durationS,
      effort: 'easy',
      terrain: 'flat',
    },
    7,
  )
}

/** The digest a library holds after a GPX or TCX file was imported earlier. */
function digestOf(bytes: Uint8Array, fileName: string): ActivityDigest {
  const parsed = parseActivityFile(bytes, fileName)
  if (!parsed.ok) throw new Error(parsed.reason)
  const [activity] = parsed.activities
  if (activity === undefined) throw new Error(`${fileName} has no activity`)
  return digestActivity(activity)
}

describe('the same workout in more than one format', () => {
  it('analyses the FIT when a GPX copy that starts a few seconds later comes first in the zip', async () => {
    const session = new AnalysisSession()
    const bytes = zipSync({
      'activities/1.gpx.gz': gzipSync(encodeGpx(shifted(run, 4_000))),
      'activities/1.fit.gz': gzipSync(encodeFit(run, { gps: true })),
    })
    const state = await session.addFiles([new File([bytes], 'export.zip')], SETTINGS)

    expect(state.result?.activities).toHaveLength(1)
    expect(state.result?.activities[0]?.id).toContain('1.fit')
    expect(state.hiddenDuplicates).toBe(1)
  })

  it('counts the workout once in the trend, as the analysis does', async () => {
    const session = new AnalysisSession()
    const bytes = zipSync({
      'activities/1.gpx.gz': gzipSync(encodeGpx(shifted(run, 4_000))),
      'activities/1.fit.gz': gzipSync(encodeFit(run, { gps: true })),
    })
    const state = await session.addFiles([new File([bytes], 'export.zip')], SETTINGS)

    expect(state.trend.at(-1)?.runCount).toBe(1)
  })

  it('counts a workout as added once, whichever copy of it an import is given first', async () => {
    const addedSports = async (files: File[]) => {
      const session = new AnalysisSession()
      let sports: string[] = []
      await session.addFiles(files, SETTINGS, undefined, undefined, false, (outcome) => {
        sports = outcome.added.map((digest) => digest.sport)
      })
      return sports
    }
    const gpx = new File([new Uint8Array(encodeGpx(shifted(run, 2_000)))], 'run.gpx')
    const fit = fitFile('run.fit', run)

    expect(await addedSports([gpx, fit])).toEqual(['run'])
    expect(await addedSports([fit, gpx])).toEqual(['run'])
  })

  it('skips a GPX copy that arrives after its FIT in the same zip, and does not sync it', async () => {
    const session = new AnalysisSession()
    const bytes = zipSync({
      'activities/1.fit.gz': gzipSync(encodeFit(run, { gps: true })),
      'activities/1.gpx.gz': gzipSync(encodeGpx(shifted(run, 4_000))),
    })
    const synced: string[] = []
    let duplicates: RejectedFile[] = []
    const state = await session.addFiles(
      [new File([bytes], 'export.zip')],
      SETTINGS,
      undefined,
      async (item) => {
        synced.push(item.fileName)
      },
      false,
      (outcome) => {
        duplicates = outcome.duplicates
      },
    )

    expect(state.result?.activities).toHaveLength(1)
    expect(state.result?.activities[0]?.id).toContain('1.fit')
    expect(state.hiddenDuplicates).toBe(0)
    expect(synced).toEqual(['activities/1.fit'])
    expect(duplicates).toEqual([
      { fileName: 'activities/1.gpx', reason: 'Same workout as activities/1.fit' },
    ])
  })

  it('prefers a TCX copy over a GPX copy of the same workout when there is no FIT', async () => {
    const session = new AnalysisSession()
    const bytes = zipSync({
      'a.gpx': encodeGpx(shifted(run, 4_000)),
      'b.tcx': encodeTcx(shifted(run, 2_000), { gps: true }),
    })
    const state = await session.addFiles([new File([bytes], 'export.zip')], SETTINGS)

    expect(state.result?.activities).toHaveLength(1)
    expect(state.result?.activities[0]?.id).toContain('b.tcx')
  })

  it('counts a FIT imported after a saved GPX copy once, and hides the GPX copy', async () => {
    const session = new AnalysisSession()
    session.loadDigests([digestOf(encodeGpx(shifted(run, 4_000)), 'run.gpx')], SETTINGS)
    const state = await session.addFiles([fitFile('run.fit', run)], SETTINGS)

    expect(state.result?.activities).toHaveLength(1)
    expect(state.result?.activities[0]?.id).toContain('run.fit')
    expect(state.hiddenDuplicates).toBe(1)
  })

  it('skips a GPX imported after a saved FIT copy of the same workout, and does not sync it', async () => {
    const session = new AnalysisSession()
    const fit = digestOf(new Uint8Array(encodeFit(run, { gps: true })), 'run.fit')
    session.loadDigests([fit], SETTINGS)
    let synced = 0
    const state = await session.addFiles(
      [new File([new Uint8Array(encodeGpx(shifted(run, 4_000)))], 'run.gpx')],
      SETTINGS,
      undefined,
      async () => {
        synced++
      },
    )

    expect(state.result?.activities).toHaveLength(1)
    expect(state.result?.activities[0]?.id).toContain('run.fit')
    expect(state.hiddenDuplicates).toBe(0)
    expect(synced).toBe(0)
  })

  it('saves a higher-ranked copy that arrives after a saved GPX, and hides the GPX', async () => {
    const session = new AnalysisSession()
    session.loadDigests([digestOf(encodeGpx(shifted(run, 4_000)), 'run.gpx')], SETTINGS)
    let synced = 0
    const state = await session.addFiles(
      [fitFile('run.fit', run)],
      SETTINGS,
      undefined,
      async () => {
        synced++
      },
    )

    expect(state.result?.activities[0]?.id).toContain('run.fit')
    expect(state.hiddenDuplicates).toBe(1)
    expect(synced).toBe(1)
  })

  it('uses the FIT when a saved GPX copy starts in the same second', async () => {
    const session = new AnalysisSession()
    session.loadDigests([digestOf(encodeGpx(run), 'run.gpx')], SETTINGS)
    const state = await session.addFiles([fitFile('run.fit', run)], SETTINGS)

    expect(state.result?.activities).toHaveLength(1)
    expect(state.result?.activities[0]?.id).toContain('run.fit')
    expect(state.hiddenDuplicates).toBe(0)
  })

  it('keeps two runs 50 s apart when one lasts 10 minutes and the other 60', async () => {
    const session = new AnalysisSession()
    const state = await session.addFiles(
      [
        fitFile('short.fit', runOf(run.startMs, 600)),
        fitFile('long.fit', runOf(run.startMs + 50_000, 3600)),
      ],
      SETTINGS,
    )

    expect(state.result?.activities).toHaveLength(2)
    expect(state.hiddenDuplicates).toBe(0)
  })

  it('counts two FITs of a near-duplicate workout once, and saves both copies', async () => {
    const session = new AnalysisSession()
    let synced = 0
    const state = await session.addFiles(
      [fitFile('run.fit', run), fitFile('run again.fit', shifted(run, 2_000))],
      SETTINGS,
      undefined,
      async () => {
        synced++
      },
    )

    expect(state.result?.activities).toHaveLength(1)
    expect(state.hiddenDuplicates).toBe(1)
    expect(synced).toBe(2)
  })
})

/** The same activity as a bike computer or watch without a heart-rate strap records it. */
function withoutHeartRate(activity: Activity): Activity {
  return { ...activity, heartRate: new Float64Array(activity.n).fill(NaN), hasHeartRate: false }
}

describe('near-duplicate copies of one workout in the same format', () => {
  it('keeps the copy with heart-rate data, whichever arrives first', async () => {
    const bare = fitFile('bare.fit', shifted(withoutHeartRate(run), 2_000))
    const strap = fitFile('strap.fit', run)
    for (const files of [
      [bare, strap],
      [strap, bare],
    ]) {
      const session = new AnalysisSession()
      const state = await session.addFiles(files, SETTINGS)
      expect(state.result?.activities).toHaveLength(1)
      expect(state.result?.activities[0]?.id).toContain('strap.fit')
    }
  })

  it('keeps the longer of two copies that differ by under a minute', async () => {
    const session = new AnalysisSession()
    const state = await session.addFiles(
      [
        fitFile('short.fit', runOf(run.startMs, 590)),
        fitFile('long.fit', runOf(run.startMs + 2_000, 600)),
      ],
      SETTINGS,
    )

    expect(state.result?.activities).toHaveLength(1)
    expect(state.result?.activities[0]?.id).toContain('long.fit')
  })

  it('keeps the smaller id among stored copies that are equally rich', () => {
    const a = digestOf(new Uint8Array(encodeFit(run, { gps: true })), 'a run.fit')
    const b = digestOf(new Uint8Array(encodeFit(shifted(run, 2_000), { gps: true })), 'b run.fit')
    for (const stored of [
      [a, b],
      [b, a],
    ]) {
      const session = new AnalysisSession()
      const state = session.loadDigests(stored, SETTINGS)
      expect(state.result?.activities.map((activity) => activity.id)).toEqual([
        [a.id, b.id].sort()[0],
      ])
    }
  })

  it('does not save a poorer copy that arrives after a richer one', async () => {
    const session = new AnalysisSession()
    const bare = fitFile('bare.fit', shifted(withoutHeartRate(run), 2_000))
    let synced = 0
    const state = await session.addFiles(
      [fitFile('strap.fit', run), bare],
      SETTINGS,
      undefined,
      async () => {
        synced++
      },
    )

    expect(state.result?.activities).toHaveLength(1)
    expect(synced).toBe(1)
  })
})

describe('transitive near-duplicates and the visible count', () => {
  it('hides a GPX copy linked to a FIT only through a TCX copy, keeping only the FIT', async () => {
    const session = new AnalysisSession()
    const state = await session.addFiles(
      [
        new File([new Uint8Array(encodeGpx(shifted(run, 100_000)))], 'gpx.gpx'),
        new File([new Uint8Array(encodeTcx(shifted(run, 50_000), { gps: true }))], 'tcx.tcx'),
        fitFile('fit.fit', run),
      ],
      SETTINGS,
    )

    expect(state.result?.activities).toHaveLength(1)
    expect(state.result?.activities[0]?.id).toContain('fit.fit')
    expect(state.hiddenDuplicates).toBe(2)
  })

  it('counts only the visible copies in totalActivities', async () => {
    const session = new AnalysisSession()
    const state = await session.addFiles(
      [
        new File([new Uint8Array(encodeGpx(shifted(run, 4_000)))], 'run.gpx'),
        fitFile('run.fit', run),
      ],
      SETTINGS,
    )

    expect(state.hiddenDuplicates).toBe(1)
    expect(state.totalActivities).toBe(1)
  })
})

describe('athlete settings', () => {
  it('rejects a body mass or bike mass that is not a positive finite number', () => {
    const session = new AnalysisSession()
    for (const massKg of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => session.setSettings({ massKg, bikeMassKg: 9 })).toThrow(RangeError)
    }
    expect(() => session.setSettings({ massKg: 75, bikeMassKg: 0 })).toThrow(RangeError)
  })

  it('rejects zero body mass for a library analysis', async () => {
    const session = new AnalysisSession()
    await expect(
      session.addFiles([fitFile('run.fit', run)], { massKg: 0, bikeMassKg: 9 }),
    ).rejects.toThrow(RangeError)
  })

  it('clear works after settings were given', () => {
    const session = new AnalysisSession()
    session.setSettings(SETTINGS)
    expect(session.clear().result).toBeNull()
  })
})

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
