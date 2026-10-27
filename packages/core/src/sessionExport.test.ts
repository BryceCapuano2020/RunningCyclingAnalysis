import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS, encodeFit } from './fit'
import { encodeGpx } from './gpx/encode'
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
  // The progress total the page is told before any file is read.
  const total = await session.countFiles(files)
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
  return { state, progress, outcome, duplicates, total }
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
    const { state, progress, outcome, total } = await importFiles(files)

    expect(state.result?.activities).toHaveLength(1)
    expect(state.rejected).toEqual([])
    expect(outcome).toEqual({ activities: 1, rejected: 0, notActivities: 3 })
    expect(progress).toEqual([1])
    expect(total).toBe(1)
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

  it('marks a refused sport that the export list named, so a page can show its label as it is', async () => {
    const { state } = await importFiles([
      zipFile({
        'activities/2001.gpx': untypedGpx(run),
        'activities.csv': list('2001,Paddle,Kayaking,activities/2001.gpx'),
      }),
    ])

    expect(state.rejected).toEqual([
      expect.objectContaining({ code: 'unsupported-sport', detail: 'Kayaking', listed: true }),
    ])
  })
})

/**
 * What a zip's activity files become when its activities.csv names some of them. A saved route is an
 * empty GPX, so one that is read shows in `read` as an empty file, and one that is left out does not.
 */
describe('which files of an export its list leaves out', () => {
  const rideLater = { ...ride, startMs: ride.startMs + 86_400_000 }

  async function read(entries: Record<string, Uint8Array>) {
    const files = [zipFile(entries)]
    const { state, outcome, progress, total } = await importFiles(files)
    return {
      read: state.rejected.map((file) => file.fileName).sort(),
      activities: state.result?.activities.length ?? 0,
      rejected: outcome.rejected,
      notActivities: outcome.notActivities,
      unsupported: state.unsupportedFiles,
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

      expect(result).toEqual({
        read: [],
        activities: 1,
        rejected: 0,
        notActivities: 2,
        unsupported: 0,
        agrees: true,
      })
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
      rejected: 1,
      notActivities: 1,
      unsupported: 0,
      agrees: true,
    })
  })

  it('reads a file in a folder below a listed one, and leaves out the sibling folder', async () => {
    const result = await read({
      'activities/1001.fit': encodeFit(run, { gps: true }),
      'activities/2019/1002.gpx': ROUTE,
      'activities/2019/old/1003.gpx': ROUTE,
      'routes/1.gpx': ROUTE,
      'activities.csv': list('1001,Morning Run,Run,activities/1001.fit'),
    })

    expect(result).toEqual({
      read: ['activities/2019/1002.gpx', 'activities/2019/old/1003.gpx'],
      activities: 1,
      rejected: 2,
      notActivities: 1,
      unsupported: 0,
      agrees: true,
    })
  })

  it('reads every folder when a listed file sits at the root of the zip', async () => {
    const result = await read({
      '1001.fit': encodeFit(run, { gps: true }),
      'routes/1.gpx': ROUTE,
      'other/2.gpx': ROUTE,
      'activities.csv': list('1001,Morning Run,Run,1001.fit'),
    })

    expect(result).toEqual({
      read: ['other/2.gpx', 'routes/1.gpx'],
      activities: 1,
      rejected: 2,
      notActivities: 0,
      unsupported: 0,
      agrees: true,
    })
  })

  it('reads a listed row written with . and a file beside a listed row whose file the zip lacks', async () => {
    const result = await read({
      'export/activities.csv': list(
        '1001,Morning Run,Run,activities/1001.fit.gz',
        '1003,Hike,Run,./old/3.gpx',
        '1005,Hike,Run,new/5.gpx',
      ),
      'export/activities/1001.fit.gz': gzipSync(encodeFit(run, { gps: true })),
      'export/old/3.gpx': ROUTE,
      'export/old/4.gpx': ROUTE,
      'export/new/6.gpx': ROUTE,
      'export/routes/1.gpx': ROUTE,
    })

    expect(result).toEqual({
      read: ['export/new/6.gpx', 'export/old/3.gpx', 'export/old/4.gpx'],
      activities: 1,
      rejected: 3,
      notActivities: 1,
      unsupported: 0,
      agrees: true,
    })
  })

  it('counts a KML, PWX or HRM file in a folder the list leaves out as not an activity, and not as rejected', async () => {
    const result = await read({
      'activities/1001.fit': encodeFit(run, { gps: true }),
      'routes/1.kml': strToU8('kml'),
      'routes/2.pwx': strToU8('pwx'),
      'routes/3.hrm.gz': gzipSync(strToU8('hrm')),
      'activities.csv': list('1001,Morning Run,Run,activities/1001.fit'),
    })

    expect(result).toEqual({
      read: [],
      activities: 1,
      rejected: 0,
      notActivities: 3,
      unsupported: 0,
      agrees: true,
    })
  })

  it('still counts a KML file in a listed folder as a format the app does not read', async () => {
    const result = await read({
      'activities/1001.fit': encodeFit(run, { gps: true }),
      'activities/2.kml': strToU8('kml'),
      'activities.csv': list('1001,Morning Run,Run,activities/1001.fit'),
    })

    expect(result).toEqual({
      read: [],
      activities: 1,
      rejected: 1,
      notActivities: 0,
      unsupported: 1,
      agrees: true,
    })
  })

  it('leaves out any folder with no listed file in it or above it, as it does routes/', async () => {
    const result = await read({
      'activities/1001.fit': encodeFit(run, { gps: true }),
      'activities.csv': list('1001,Morning Run,Run,activities/1001.fit'),
      'rides/2.gpx': ROUTE,
      'extra.gpx': ROUTE,
    })

    expect(result).toEqual({
      read: [],
      activities: 1,
      rejected: 0,
      notActivities: 2,
      unsupported: 0,
      agrees: true,
    })
  })

  it('leaves out routes/ of an export zipped with backslashes, with the list in a wrapper folder', async () => {
    const result = await read({
      'export\\activities.csv': list('1001,Morning Run,Run,activities/1001.fit'),
      'export\\activities\\1001.fit': encodeFit(run, { gps: true }),
      'export\\routes\\1.gpx': ROUTE,
    })

    expect(result).toEqual({
      read: [],
      activities: 1,
      rejected: 0,
      notActivities: 1,
      unsupported: 0,
      agrees: true,
    })
  })

  it('does not cover the zip with a row that is not a file, or that climbs above its root', async () => {
    const result = await read({
      'activities/1001.fit': encodeFit(run, { gps: true }),
      'routes/1.gpx': ROUTE,
      'rides/2.gpx': ROUTE,
      'activities.csv': list(
        '1001,Morning Run,Run,activities/1001.fit',
        '1002,Hike,Hike,../routes/1.gpx',
        '1003,Hike,Hike,.',
        '1004,Hike,Hike,./',
        '1005,Hike,Hike,activities/old/..',
      ),
    })

    expect(result).toEqual({
      read: [],
      activities: 1,
      rejected: 0,
      notActivities: 2,
      unsupported: 0,
      agrees: true,
    })
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
      rejected: 2,
      notActivities: 0,
      unsupported: 0,
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
      rejected: 1,
      notActivities: 0,
      unsupported: 0,
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
      rejected: 1,
      notActivities: 0,
      unsupported: 0,
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

    expect(result).toEqual({
      read: [],
      activities: 2,
      rejected: 0,
      notActivities: 1,
      unsupported: 0,
      agrees: true,
    })
  })
})

describe('AnalysisSession reading the sport an export list gives', () => {
  it('refuses a file the list calls an e-bike ride, whatever sport the file names', async () => {
    const { state, outcome } = await importFiles([
      zipFile({
        'activities/1001.fit': encodeFit(ride, { gps: true }),
        'activities/1002.gpx': strToU8(
          new TextDecoder().decode(encodeGpx({ ...ride, startMs: ride.startMs + 86_400_000 })),
        ),
        'activities/1003.fit': encodeFit(run, { gps: true }),
        'activities.csv': list(
          '1001,Lunch Ride,E-Bike Ride,activities/1001.fit',
          '1002,Lunch Ride,E-Mountain Bike Ride,activities/1002.gpx',
          '1003,Morning Run,Run,activities/1003.fit',
        ),
      }),
    ])

    expect(state.rejected.map(({ fileName, code }) => ({ fileName, code }))).toEqual([
      { fileName: 'activities/1001.fit', code: 'e-bike' },
      { fileName: 'activities/1002.gpx', code: 'e-bike' },
    ])
    expect(outcome).toEqual({ activities: 1, rejected: 2, notActivities: 0 })
  })

  it('counts the files of an archive by the limits the import reads it with', async () => {
    const entries: Record<string, Uint8Array> = {
      'activities.csv': list('1,Walk,Walk,activities/1.gpx'),
      'activities/1.gpx': ROUTE,
    }
    for (let i = 1; i <= 4; i++) entries[`routes/${i}.gpx`] = ROUTE
    // The directory holds more entries than the limits accept, so extraction stops and the files it
    // did not reach are not counted as read.
    const limits = { ...DEFAULT_EXTRACT_LIMITS, maxArchiveEntries: 4 }
    const { progress, total } = await importFiles([zipFile(entries)], limits)

    expect(progress.at(-1)).toBe(4)
    // The total is counted by the same limits, so it is unknown rather than a count the import cannot reach.
    expect(total).toBeNull()
  })
})
