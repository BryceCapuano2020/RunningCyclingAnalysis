import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS, encodeFit } from './fit'
import type { ExtractLimits } from './fit'
import { buildFit, secondly } from './fit/fitTestFiles'
import { AnalysisSession } from './session'
import type { RejectedFile } from './session'
import { sampleDataset } from './synthetic'
import type { AthleteSettings } from './types'

/** A Garmin Connect export zip read by the session: summaries in DI-Connect-Fitness, activity files in zips. */

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const DAY_MS = 86_400_000
const sample = sampleDataset().activities
const run = sample.find((activity) => activity.sport === 'run')!
const ride = sample.find((activity) => activity.sport === 'ride')!
const SUMMARIES = 'DI_CONNECT/DI-Connect-Fitness/athlete@example.com_0_summarizedActivities.json'
const UPLOADS = 'DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip'

function swim(startMs: number): Uint8Array {
  return new Uint8Array(
    buildFit({
      sessions: [
        {
          sport: 'swimming',
          startMs,
          durationS: 120,
          records: secondly(startMs, 120, { speed: 1 }),
        },
      ],
    }),
  )
}

/** The summary file Garmin writes: a list holding an object with the list of activities. */
function summaries(...activities: { name: string; startMs: number; type?: string }[]): Uint8Array {
  return strToU8(
    JSON.stringify([
      {
        summarizedActivitiesExport: activities.map(({ name, startMs, type }, i) => ({
          activityId: 1_000_000 + i,
          name,
          activityType: type ?? 'running',
          beginTimestamp: startMs,
          startTimeGmt: startMs,
        })),
      },
    ]),
  )
}

function zipBytes(entries: Record<string, Uint8Array>): Uint8Array<ArrayBuffer> {
  return new Uint8Array(zipSync(entries))
}

function zipFile(entries: Record<string, Uint8Array>, name = 'export.zip'): File {
  return new File([zipBytes(entries)], name)
}

/** A Garmin export: the summaries, and the uploaded activity files in a zip of their own. */
function garminExport(
  uploaded: Record<string, Uint8Array>,
  list: Uint8Array = summaries(
    { name: 'Lakeside Run', startMs: run.startMs + 800 },
    { name: 'Hill Ride', startMs: ride.startMs - 1200 },
  ),
): File {
  return zipFile({
    [SUMMARIES]: list,
    [UPLOADS]: zipBytes(uploaded),
    'DI_CONNECT/DI-Connect-User/user_profile.json': strToU8('{}'),
    'DI_CONNECT/DI-Connect-Wellness/athlete@example.com_sleepData.json': strToU8('[]'),
  })
}

const UPLOADED = {
  'athlete@example.com_5101.fit': encodeFit(run, { gps: true }),
  'athlete@example.com_5102.fit': encodeFit(ride, { gps: true }),
}

async function importFiles(files: File[], limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS) {
  const session = new AnalysisSession(limits)
  let outcome = { activities: -1, filesAdded: -1, rejected: -1, notActivities: -1 }
  let duplicates: RejectedFile[] = []
  const state = await session.addFiles(files, SETTINGS, undefined, undefined, false, (done) => {
    outcome = {
      activities: done.activities,
      filesAdded: done.filesAdded,
      rejected: done.rejected,
      notActivities: done.notActivities,
    }
    duplicates = done.duplicates
  })
  return { state, outcome, duplicates }
}

describe('AnalysisSession reading a Garmin Connect export', () => {
  it('reads the activities in the nested zip and names them from the summaries by start time', async () => {
    const { state, outcome } = await importFiles([garminExport(UPLOADED)])

    const names = Object.fromEntries(
      state.result!.activities.map((activity) => [activity.sport, activity.name]),
    )
    expect(names).toEqual({ run: 'Lakeside Run', ride: 'Hill Ride' })
    expect(state.rejected).toEqual([])
    expect(outcome).toEqual({ activities: 2, filesAdded: 2, rejected: 0, notActivities: 0 })
  })

  it('names an activity the summaries do not list from its start and sport, and ignores a far start', async () => {
    const list = summaries(
      { name: 'Lakeside Run', startMs: run.startMs + 60_000 },
      { name: 'Hill Ride', startMs: ride.startMs },
    )
    const { state } = await importFiles([garminExport(UPLOADED, list)])

    const names = Object.fromEntries(
      state.result!.activities.map((activity) => [activity.sport, activity.name]),
    )
    expect(names.ride).toBe('Hill Ride')
    expect(names.run).toMatch(/ Run$/)
    expect(names.run).not.toBe('Lakeside Run')
  })

  it('reads the summaries of every file, whichever name Garmin gives the folder of the uploads', async () => {
    const file = zipFile({
      'DI_CONNECT/DI-Connect-Fitness/athlete@example.com_0_summarizedActivities.json': summaries({
        name: 'Lakeside Run',
        startMs: run.startMs,
      }),
      'DI_CONNECT/DI-Connect-Fitness/athlete@example.com_1_summarizedActivities.json': summaries({
        name: 'Hill Ride',
        startMs: ride.startMs,
      }),
      'DI_CONNECT/DI-Connect-Fitness-Uploaded-Files/UploadedFiles_0-_Part1.zip': zipBytes(UPLOADED),
    })
    const { state } = await importFiles([file])

    expect(state.result!.activities.map((activity) => activity.name).sort()).toEqual([
      'Hill Ride',
      'Lakeside Run',
    ])
  })

  it('names a file by the summary of its own sport when two start together, and by none when it cannot tell', async () => {
    const together = summaries(
      { name: 'Wrong sport', startMs: run.startMs + 100, type: 'cycling' },
      { name: 'Lakeside Run', startMs: run.startMs + 700, type: 'trail_running' },
      { name: 'Hill Ride', startMs: ride.startMs, type: 'road_biking' },
      { name: 'Twin ride', startMs: ride.startMs + 200, type: 'road_biking' },
    )
    const { state } = await importFiles([garminExport(UPLOADED, together)])

    const names = Object.fromEntries(
      state.result!.activities.map((activity) => [activity.sport, activity.name]),
    )
    expect(names.run).toBe('Lakeside Run')
    // Two rides start together, with different names: not guessed, so the ride is named as any other.
    expect(names.ride).toMatch(/ Ride$/)
  })

  it('still imports every activity when the summaries are unreadable', async () => {
    const { state, outcome } = await importFiles([garminExport(UPLOADED, strToU8('{ not json'))])

    expect(state.result!.activities).toHaveLength(2)
    expect(outcome.activities).toBe(2)
  })

  it('counts what it skipped, and says why: other sports, damaged files, copies and non-activity files', async () => {
    const file = zipFile({
      [SUMMARIES]: summaries({ name: 'Lakeside Run', startMs: run.startMs }),
      [UPLOADS]: zipBytes({
        ...UPLOADED,
        'athlete@example.com_5103.fit': swim(run.startMs + 3 * DAY_MS),
        'athlete@example.com_5104.fit': strToU8('this is not a fit file'),
        // The same run again, as Garmin keeps a file once for each device that uploaded it.
        'athlete@example.com_5105.fit': encodeFit(run, { gps: true }),
        'athlete@example.com_5106.json': strToU8('{}'),
      }),
      'DI_CONNECT/DI-Connect-Social/picture.jpg': strToU8('not a picture'),
    })
    const { state, outcome, duplicates } = await importFiles([file])

    expect(state.result!.activities).toHaveLength(2)
    expect(state.rejected.map((rejected) => [rejected.fileName, rejected.code])).toEqual([
      [`${UPLOADS}/athlete@example.com_5103.fit`, 'unsupported-sport'],
      [`${UPLOADS}/athlete@example.com_5104.fit`, 'corrupt'],
    ])
    expect(duplicates.map((copy) => copy.code)).toEqual(['duplicate'])
    // Two files added, a swim and a damaged file refused, a copy; the json and the picture are no activities.
    expect(outcome).toEqual({ activities: 3, filesAdded: 2, rejected: 2, notActivities: 0 })
  })

  it('has no file total before the nested zips are read, and counts the files read as they come', async () => {
    const session = new AnalysisSession()
    const file = garminExport(UPLOADED)
    const progress: number[] = []
    // The page shows the count alone for an unknown total, so it cannot stall short of one.
    expect(await session.countFiles([file])).toBeNull()
    await session.addFiles([file], SETTINGS, (filesRead) => progress.push(filesRead))

    expect(progress).toEqual([1, 2])
  })

  it('reads a zip of uploaded files dropped on its own, as it did before', async () => {
    const { state } = await importFiles([zipFile(UPLOADED, 'UploadedFiles_0-_Part1.zip')])

    expect(state.result!.activities).toHaveLength(2)
  })

  it('does not look for Garmin summaries in a Strava export', async () => {
    const file = zipFile({
      'activities/1001.fit': encodeFit(run, { gps: true }),
      'activities.csv': strToU8('Activity Name,Filename\nStrava Run,activities/1001.fit\n'),
      [SUMMARIES]: summaries({ name: 'Garmin Run', startMs: run.startMs }),
    })
    const { state } = await importFiles([file])

    expect(state.result!.activities.map((activity) => activity.name)).toEqual(['Strava Run'])
  })
})

describe('a Garmin Connect export keeps every zip guard', () => {
  const small = (limits: Partial<ExtractLimits>): ExtractLimits => ({
    ...DEFAULT_EXTRACT_LIMITS,
    ...limits,
  })

  it('counts the entries of the nested zip toward the archive entry limit', async () => {
    // The summaries are the first entry, the nested zip the second, its two files the third and fourth.
    const { state } = await importFiles([garminExport(UPLOADED)], small({ maxArchiveEntries: 3 }))

    expect(state.rejected.map((file) => file.reason)).toEqual(['Archive exceeds the 3-entry limit'])
    expect(state.result!.activities).toHaveLength(1)
  })

  it('counts the activity files of the nested zip toward the activity file limit', async () => {
    const { state } = await importFiles([garminExport(UPLOADED)], small({ maxFitFiles: 1 }))

    expect(state.result!.activities).toHaveLength(1)
    expect(state.rejected.map((file) => file.reason)).toEqual([
      expect.stringContaining('1-activity-file limit'),
    ])
  })

  it('shares one decompressed-bytes budget between the summaries, the nested zip and its files', async () => {
    const whole = await importFiles([garminExport(UPLOADED)])
    expect(whole.state.rejected).toEqual([])
    // Room for the summaries and the first file, but not for the second.
    const summaryBytes = summaries(
      { name: 'Lakeside Run', startMs: 1 },
      { name: 'Hill Ride', startMs: 1 },
    ).length
    const first = encodeFit(run, { gps: true }).length
    const budget = summaryBytes + zipBytes(UPLOADED).length + first + 100
    const { state } = await importFiles(
      [garminExport(UPLOADED)],
      small({ maxTotalDecompressedBytes: budget }),
    )

    expect(state.result!.activities.length).toBeLessThan(2)
    expect(state.rejected.some((file) => file.reason.includes('expands to more than'))).toBe(true)
  })

  it('refuses a zip nested more than two levels down', async () => {
    const deepest = zipBytes({
      'athlete@example.com_5101.fit': UPLOADED['athlete@example.com_5101.fit'],
    })
    const middle = zipBytes({ 'Inner.zip': deepest })
    const file = zipFile({
      [UPLOADS]: zipBytes({ 'Middle.zip': middle }),
    })
    const { state } = await importFiles([file])

    expect(state.result).toBeNull()
    expect(state.rejected.map((rejected) => rejected.reason)).toContain(
      'Nested archives are too deep',
    )
  })

  it('reads a nested zip larger than one archive entry may be, since it is not held whole', async () => {
    const nested = new Uint8Array(zipSync(UPLOADED, { level: 0 }))
    const biggestFile = Math.max(...Object.values(UPLOADED).map((bytes) => bytes.length))
    const file = zipFile({ [SUMMARIES]: summaries(), [UPLOADS]: nested })
    // The limit holds each file, not the zip around them, and the buffer holds one file at a time.
    const limits = small({ maxEntryBytes: biggestFile + 1, maxBufferedBytes: biggestFile * 3 })
    const { state } = await importFiles([file], limits)

    expect(nested.length).toBeGreaterThan(limits.maxEntryBytes)
    expect(state.rejected).toEqual([])
    expect(state.result!.activities).toHaveLength(2)
  })

  it('still refuses an activity file larger than one archive entry may be', async () => {
    const { state } = await importFiles(
      [garminExport(UPLOADED)],
      small({
        maxEntryBytes: Math.min(...Object.values(UPLOADED).map((bytes) => bytes.length)) - 1,
      }),
    )

    expect(state.rejected.map((rejected) => rejected.code)).toEqual(['too-large', 'too-large'])
  })
})
