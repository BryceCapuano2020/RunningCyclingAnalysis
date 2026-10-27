import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS, encodeFit } from './fit'
import { encodeGpx } from './gpx/encode'
import { countImportFiles } from './import/activitiesCsv'
import { AnalysisSession } from './session'
import type { RejectedFile } from './session'
import { sampleDataset } from './synthetic'
import type { Activity, AthleteSettings } from './types'

/** A Strava export zip read by the session: its activities.csv names the activities, and routes/ holds saved routes. */

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const sample = sampleDataset().activities
const run = sample.find((activity) => activity.sport === 'run')!
const ride = sample.find((activity) => activity.sport === 'ride')!
const ROUTE = strToU8('<gpx version="1.1"><trk><trkseg></trkseg></trk></gpx>')

/** A GPX file as Strava wrote the oldest ones: a track with no type. */
function untypedGpx(activity: Activity): Uint8Array {
  const text = new TextDecoder().decode(encodeGpx(activity))
  return strToU8(text.replace(/<type>[^<]*<\/type>/, ''))
}

function list(...rows: string[]): Uint8Array {
  return strToU8(['Activity ID,Activity Name,Activity Type,Filename', ...rows].join('\n') + '\n')
}

function zipFile(entries: Record<string, Uint8Array>): File {
  return new File([new Uint8Array(zipSync(entries))], 'export.zip')
}

/** Adds the files, and returns the state with the counts the import ended on. */
async function importFiles(files: File[], limits = DEFAULT_EXTRACT_LIMITS) {
  const session = new AnalysisSession(limits)
  const progress: number[] = []
  let outcome = { activities: -1, rejected: -1, notActivities: -1 }
  let duplicates: RejectedFile[] = []
  const state = await session.addFiles(
    files,
    SETTINGS,
    (filesRead) => progress.push(filesRead),
    undefined,
    false,
    (completed) => {
      outcome = {
        activities: completed.activities,
        rejected: completed.rejected,
        notActivities: completed.notActivities,
      }
      duplicates = completed.duplicates
    },
  )
  return { state, progress, outcome, duplicates }
}

describe('AnalysisSession reading a Strava export', () => {
  it('reads a GPX file with no type as the run or ride the export list names', async () => {
    const { state, outcome } = await importFiles([
      zipFile({
        'activities/2001.gpx': untypedGpx(run),
        'activities/2002.gpx': untypedGpx({ ...ride, startMs: ride.startMs + 86_400_000 }),
        'activities.csv': list(
          '2001,Morning Run,Run,activities/2001.gpx',
          '2002,Lunch Ride,Ride,activities/2002.gpx',
        ),
      }),
    ])

    expect(state.result?.activities.map((a) => a.sport).sort()).toEqual(['ride', 'run'])
    expect(state.rejected).toEqual([])
    expect(outcome).toEqual({ activities: 2, rejected: 0, notActivities: 0 })
  })

  it('leaves the saved routes out: not read, not rejected, not in the progress total, and counted apart', async () => {
    const files = [
      zipFile({
        'routes/1.gpx': ROUTE,
        'activities/1001.fit': encodeFit(run, { gps: true }),
        'routes/2.gpx': ROUTE,
        'routes/3.gpx': ROUTE,
        'activities.csv': list('1001,Morning Run,Run,activities/1001.fit'),
      }),
    ]
    const { state, progress, outcome } = await importFiles(files)

    expect(state.result?.activities).toHaveLength(1)
    expect(state.rejected).toEqual([])
    expect(outcome).toEqual({ activities: 1, rejected: 0, notActivities: 3 })
    expect(progress).toEqual([1])
    expect(await countImportFiles(files)).toBe(1)
  })

  it('keeps the routes of a zip with no list, as any other activity file', async () => {
    const { state, outcome } = await importFiles([zipFile({ 'routes/1.gpx': ROUTE })])

    expect(state.rejected.map((file) => file.fileName)).toEqual(['routes/1.gpx'])
    expect(outcome.notActivities).toBe(0)
  })

  it.each([
    ['a malformed list', strToU8('Activity Name,Filename\nRun,"activities/1001.fit\n')],
    ['a list that names no file', list(',Manual entry,Run,')],
    ['a list with no file column', strToU8('Activity Name\nRun\n')],
  ])('keeps the routes when the export has %s', async (_name, csv) => {
    const { state, outcome } = await importFiles([
      zipFile({ 'routes/1.gpx': ROUTE, 'activities.csv': csv }),
    ])

    expect(state.rejected.map((file) => file.fileName)).toEqual(['routes/1.gpx'])
    expect(outcome.notActivities).toBe(0)
  })

  it('keeps the saved routes out of the cap on activity files', async () => {
    const entries: Record<string, Uint8Array> = {
      'activities/1001.fit': encodeFit(run, { gps: true }),
      'activities.csv': list('1001,Morning Run,Run,activities/1001.fit'),
    }
    for (let i = 1; i <= 5; i++) entries[`routes/${i}.gpx`] = ROUTE
    const { state, outcome } = await importFiles([zipFile(entries)], {
      ...DEFAULT_EXTRACT_LIMITS,
      maxFitFiles: 1,
    })

    expect(state.result?.activities).toHaveLength(1)
    expect(state.rejected).toEqual([])
    expect(outcome).toEqual({ activities: 1, rejected: 0, notActivities: 5 })
  })

  it('reports a refused sport with the type the export list gives', async () => {
    const { state } = await importFiles([
      zipFile({
        'activities/2001.gpx': untypedGpx(run),
        'activities/2002.gpx': untypedGpx(ride),
        'activities.csv': list(
          '2001,Evening Walk,Walk,activities/2001.gpx',
          '2002,Lunch Ride,E-Bike Ride,activities/2002.gpx',
        ),
      }),
    ])

    expect(
      state.rejected.map(({ fileName, code, detail }) => ({ fileName, code, detail })),
    ).toEqual([
      { fileName: 'activities/2001.gpx', code: 'unsupported-sport', detail: 'Walk' },
      { fileName: 'activities/2002.gpx', code: 'e-bike', detail: undefined },
    ])
  })
})

/**
 * What a zip's activity files become when its activities.csv names some of them. A saved route is an
 * empty GPX, so one that is read shows in `rejected` as empty, and one that is left out does not.
 */
describe('which files of an export its list leaves out', () => {
  const rideLater = { ...ride, startMs: ride.startMs + 86_400_000 }

  async function read(entries: Record<string, Uint8Array>) {
    const files = [zipFile(entries)]
    const { state, outcome, progress } = await importFiles(files)
    const total = await countImportFiles(files)
    return {
      read: state.rejected.map((file) => file.fileName).sort(),
      activities: state.result?.activities.length ?? 0,
      notActivities: outcome.notActivities,
      // The progress total agrees with the files the import read.
      agrees: total === (progress.at(-1) ?? 0),
    }
  }

  it('leaves out routes/ in the layout Strava writes, with the list and files in a wrapper folder or not', async () => {
    for (const root of ['', 'Strava Export/']) {
      const result = await read({
        [`${root}activities/1001.fit.gz`]: gzipSync(encodeFit(run, { gps: true })),
        [`${root}routes/1.gpx`]: ROUTE,
        [`${root}routes/2.gpx`]: ROUTE,
        [`${root}media/photo.jpg`]: strToU8('jpeg'),
        [`${root}activities.csv`]: list('1001,Morning Run,Run,activities/1001.fit.gz'),
      })

      expect(result).toEqual({ read: [], activities: 1, notActivities: 2, agrees: true })
    }
  })

  it('reads a file the list does not name when it sits beside one it does, as a partial list leaves it', async () => {
    const result = await read({
      'activities/1001.fit': encodeFit(run, { gps: true }),
      'activities/1002.fit': encodeFit(rideLater, { gps: true }),
      'activities/1003.gpx': ROUTE,
      'routes/1.gpx': ROUTE,
      'activities.csv': list('1001,Morning Run,Run,activities/1001.fit'),
    })

    expect(result).toEqual({
      read: ['activities/1003.gpx'],
      activities: 2,
      notActivities: 1,
      agrees: true,
    })
  })

  it('leaves out any folder with no listed file in it, as it does routes/', async () => {
    const result = await read({
      'activities/1001.fit': encodeFit(run, { gps: true }),
      'activities.csv': list('1001,Morning Run,Run,activities/1001.fit'),
      'rides/2.gpx': ROUTE,
      'extra.gpx': ROUTE,
    })

    expect(result).toEqual({ read: [], activities: 1, notActivities: 2, agrees: true })
  })

  it('reads everything when two exports sit side by side, each with its own list', async () => {
    const result = await read({
      'a/activities/1001.fit': encodeFit(run, { gps: true }),
      'a/routes/1.gpx': ROUTE,
      'a/activities.csv': list('1001,Morning Run,Run,activities/1001.fit'),
      'b/activities/2001.fit': encodeFit(rideLater, { gps: true }),
      'b/routes/1.gpx': ROUTE,
      'b/activities.csv': list('2001,Lunch Ride,Ride,activities/2001.fit'),
    })

    expect(result).toEqual({
      read: ['a/routes/1.gpx', 'b/routes/1.gpx'],
      activities: 2,
      notActivities: 0,
      agrees: true,
    })
  })

  it('reads everything when the list sits outside the folder that holds the files', async () => {
    const result = await read({
      'activities.csv': list('1001,Morning Run,Run,activities/1001.fit'),
      'Strava Export/activities/1001.fit': encodeFit(run, { gps: true }),
      'Strava Export/routes/1.gpx': ROUTE,
    })

    expect(result).toEqual({
      read: ['Strava Export/routes/1.gpx'],
      activities: 1,
      notActivities: 0,
      agrees: true,
    })
  })

  it('reads everything when the file names are written another way than the list writes them', async () => {
    const result = await read({
      'activities.csv': list('1001,Morning Run,Run,activities/Morning Run.fit'),
      'activities/Morning%20Run.fit': encodeFit(run, { gps: true }),
      'routes/1.gpx': ROUTE,
    })

    expect(result).toEqual({
      read: ['routes/1.gpx'],
      activities: 1,
      notActivities: 0,
      agrees: true,
    })
  })

  it('reads a file written another way beside one that is named, because they share a folder', async () => {
    const result = await read({
      'activities.csv': list('1001,Morning Run,Run,activities/1001.fit'),
      'activities/1001.fit': encodeFit(run, { gps: true }),
      'activities/Lunch%20Ride.fit': encodeFit(rideLater, { gps: true }),
      'routes/1.gpx': ROUTE,
    })

    expect(result).toEqual({ read: [], activities: 2, notActivities: 1, agrees: true })
  })
})
