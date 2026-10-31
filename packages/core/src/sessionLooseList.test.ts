import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { encodeFit } from './fit'
import { encodeGpx } from './gpx/encode'
import { isCompanion, takeCompanion } from './import/looseList'
import { AnalysisSession } from './session'
import type { ImportCompletion } from './sessionHooks'
import { sampleDataset } from './synthetic'
import type { Activity, AthleteSettings } from './types'

/** An export's activities.csv given by itself beside the loose files it names. */

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const activities = sampleDataset().activities
const run = activities.find((activity) => activity.sport === 'run')!
const ride = {
  ...activities.find((activity) => activity.sport === 'ride')!,
  startMs: run.startMs + 864e5,
}

/** A GPX file as Strava wrote the oldest ones: a track with no type. */
function untypedGpx(activity: Activity, name: string): File {
  const text = new TextDecoder().decode(encodeGpx(activity)).replace(/<type>[^<]*<\/type>/, '')
  return new File([text], name)
}

function csv(name: string, ...rows: string[]): File {
  return new File(
    [['Activity ID,Activity Name,Activity Type,Filename', ...rows].join('\n') + '\n'],
    name,
  )
}

async function importFiles(files: File[]) {
  const session = new AnalysisSession()
  let completion: ImportCompletion | null = null
  const state = await session.addFiles(files, SETTINGS, undefined, undefined, false, (done) => {
    completion = done
  })
  if (completion === null) throw new Error('the import did not complete')
  return {
    state,
    completion: completion as ImportCompletion,
    total: await session.countFiles(files),
  }
}

describe('an activities.csv given loose', () => {
  it('gives the loose files their sport and their names, and is itself neither read nor refused', async () => {
    const { state, completion } = await importFiles([
      csv(
        'activities.csv',
        '2001,Morning Run,Run,activities/2001.gpx',
        '2002,Lunch Ride,Ride,activities/2002.gpx',
      ),
      untypedGpx(run, '2001.gpx'),
      untypedGpx(ride, '2002.gpx'),
    ])

    expect(state.result?.activities.map((a) => a.sport).sort()).toEqual(['ride', 'run'])
    expect(state.rejected).toEqual([])
    expect(completion.rejected).toBe(0)
    expect(completion.needsList).toBeUndefined()
    expect(completion.listed).toEqual({ named: 2, received: 2 })
  })

  it('is found in any folder, in any case, and whichever order the files come in', async () => {
    const { state, completion } = await importFiles([
      untypedGpx(run, '2001.gpx'),
      csv('Export/Activities.CSV', '2001,Morning Run,Run,activities/2001.gpx'),
    ])

    expect(state.result?.activities).toHaveLength(1)
    expect(completion.listed).toEqual({ named: 1, received: 1 })
  })

  it('says how many of the files it names were given', async () => {
    const { completion } = await importFiles([
      csv(
        'activities.csv',
        '2001,Morning Run,Run,activities/2001.gpx',
        '2002,Lunch Ride,Ride,activities/2002.gpx',
        '2003,Evening Run,Run,activities/2003.gpx',
      ),
      untypedGpx(run, '2001.gpx'),
    ])

    expect(completion.listed).toEqual({ named: 3, received: 1 })
  })

  it('does not count in the progress total', async () => {
    const { total } = await importFiles([
      csv('activities.csv', '2001,Morning Run,Run,activities/2001.gpx'),
      new File([new Uint8Array(encodeFit(run, { gps: true }))], 'a.fit'),
    ])
    expect(total).toBe(1)
  })

  it('leaves the files of a zip to the zip’s own list', async () => {
    const zip = new File(
      [new Uint8Array(zipSync({ 'a.fit': encodeFit(run, { gps: true }) }))],
      'export.zip',
    )
    const { state, completion } = await importFiles([
      zip,
      csv('activities.csv', '1,Other,Ride,a.fit'),
    ])

    expect(state.result?.activities.map((a) => a.sport)).toEqual(['run'])
    // The zip's file is one the list names, so it is in the import; its sport still comes from the zip's own list.
    expect(completion.listed).toEqual({ named: 1, received: 1 })
  })

  it('names nothing when it is malformed, and the files are read as they were', async () => {
    const bad = new File(['Activity Name,Filename\nRun,"x.gpx\n'], 'activities.csv')
    const { state, completion } = await importFiles([bad, untypedGpx(run, '2001.gpx')])

    expect(state.rejected.map((file) => file.code)).toEqual(['no-sport'])
    expect(completion.listed).toBeUndefined()
    // Nothing a list could have given is missing now, since there is none that reads; the advice is for none given.
    expect(completion.needsList).toBeUndefined()
  })
})

describe('loose files that need their sport, with no list', () => {
  it('are refused, and the import says a list from the same export would give it', async () => {
    const { state, completion } = await importFiles([untypedGpx(run, '2001.gpx')])

    expect(state.rejected.map((file) => file.code)).toEqual(['no-sport'])
    expect(completion.needsList).toBe(true)
  })

  it('give no such advice when the file names its sport, even one the app does not count', async () => {
    const hike = untypedGpx(run, 'hike.gpx')
    const text = (await hike.text()).replace('<trk>', '<trk><type>hiking</type>')
    const { state, completion } = await importFiles([new File([text], 'hike.gpx')])

    expect(state.rejected.map((file) => file.code)).toEqual(['unsupported-sport'])
    expect(completion.needsList).toBeUndefined()
  })

  it('give no such advice when the sport is in the file', async () => {
    const { completion } = await importFiles([
      new File([new Uint8Array(encodeFit(run, { gps: true }))], 'a.fit'),
    ])
    expect(completion.needsList).toBeUndefined()
  })

  it('give no such advice from a zip: the zip’s list is the one to ask for', async () => {
    const zip = new File(
      [new Uint8Array(zipSync({ 'x.gpx': strToU8(untypedGpx(run, 'x.gpx').name) }))],
      'export.zip',
    )
    const { completion } = await importFiles([zip])
    expect(completion.needsList).toBeUndefined()
  })
})

describe('the list beside a zip', () => {
  it('counts the zip’s files that it names as in the import', async () => {
    const zip = new File(
      [new Uint8Array(zipSync({ 'activities/2001.fit': encodeFit(run, { gps: true }) }))],
      'export.zip',
    )
    const { completion } = await importFiles([
      zip,
      csv(
        'activities.csv',
        '2001,Morning Run,Run,activities/2001.fit',
        '2002,Gone,Ride,activities/2002.fit',
      ),
    ])

    expect(completion.listed).toEqual({ named: 2, received: 1 })
  })
})

describe('takeCompanion', () => {
  it('knows the list by its name', () => {
    expect(isCompanion('activities.csv')).toBe(true)
    expect(isCompanion('C:\\export\\Activities.CSV')).toBe(true)
    expect(isCompanion('my-activities.csv')).toBe(false)
    expect(isCompanion('activities.csv.zip')).toBe(false)
  })

  it('merges lists, the first row for a name winning, and ignores a list that is too large', async () => {
    const { rest, companion } = await takeCompanion([
      csv('a/activities.csv', '1,First,Run,x/one.fit'),
      csv('b/activities.csv', '2,Second,Ride,y/ONE.fit.gz', '3,Third,Run,y/two.fit'),
      new File(['x'], 'run.fit'),
    ])

    expect(rest.map((source) => source.name)).toEqual(['run.fit'])
    expect(companion?.named).toBe(2)
    expect(companion?.lookup('one.fit')).toEqual({ name: 'First', type: 'Run' })
  })

  it('is null when no list is given', async () => {
    const { rest, companion } = await takeCompanion([new File(['x'], 'run.fit')])
    expect(rest).toHaveLength(1)
    expect(companion).toBeNull()
  })
})
