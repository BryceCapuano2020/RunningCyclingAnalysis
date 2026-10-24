import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS } from '../fit/archive'
import {
  entryKey,
  MAX_ACTIVITY_LIST_BYTES,
  namesFromActivityList,
  readActivityNames,
} from './activitiesCsv'

/** The columns of a Strava export's activities.csv, in its order, with two rows that need quoting. */
const LIST = [
  'Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Distance,Filename',
  '1001,"Apr 2, 2025, 6:30:00 AM",Morning Run,Run,2700,10000,activities/1001.fit.gz',
  '1002,"May 3, 2025, 5:00:00 PM","Hill repeats, 6 x 2 min",Ride,3600,30000,activities/1002.gpx.gz',
  '1003,"May 4, 2025, 7:00:00 AM",Manual entry,Run,600,,',
  '',
].join('\r\n')

function fileOf(name: string, bytes: Uint8Array): File {
  return new File([new Uint8Array(bytes)], name)
}

/** The names of a list that must read, as a map. */
function namesOf(text: string, folder?: string, maxRows?: number): Map<string, string> {
  const names = namesFromActivityList(text, folder, maxRows)
  if (names === null) throw new Error('expected the list to read')
  return names
}

describe('entryKey', () => {
  it('lowercases a path, turns backslashes into slashes, and drops a leading ./ or / and a .gz', () => {
    expect(entryKey('./Activities\\1001.FIT.GZ')).toBe('activities/1001.fit')
    expect(entryKey('/activities/1002.gpx')).toBe('activities/1002.gpx')
  })
})

describe('namesFromActivityList', () => {
  it('maps each activity file to its name, under its key', () => {
    expect([...namesOf(LIST)]).toEqual([
      ['activities/1001.fit', 'Morning Run'],
      ['activities/1002.gpx', 'Hill repeats, 6 x 2 min'],
    ])
  })

  it('puts the folder the list sits in in front of each file name', () => {
    const names = namesOf(LIST, 'export/')
    expect(names.get('export/activities/1001.fit')).toBe('Morning Run')
    expect(names.has('activities/1001.fit')).toBe(false)
  })

  it('reads an export whose activity columns are only ID, name and file', () => {
    const names = namesOf('Activity ID,Activity Name,Filename\n1,Lunch Ride,a/1.fit\n')
    expect(names.get('a/1.fit')).toBe('Lunch Ride')
  })

  it('matches the header whatever its case', () => {
    const names = namesOf('activity name,FILENAME\nLunch Ride,a/1.fit\n')
    expect(names.get('a/1.fit')).toBe('Lunch Ride')
  })

  it('returns no names when the list has no file or name column', () => {
    expect(namesOf('Activity ID,Activity Name\n1,Morning Run\n').size).toBe(0)
    expect(namesOf('Activity ID,Filename\n1,activities/1.fit\n').size).toBe(0)
  })

  it('skips a row with a blank name or no file', () => {
    const names = namesOf(
      'Activity Name,Filename\n   ,activities/1.fit\nRun,\nRide,activities/2.fit\n',
    )
    expect([...names.keys()]).toEqual(['activities/2.fit'])
  })

  it('normalises the keys, so a path written another way still finds its file', () => {
    const names = namesOf(
      'Activity Name,Filename\nRun,./Activities\\1.FIT.GZ\nRide,/activities/2.fit\n',
    )
    expect([...names.keys()]).toEqual(['activities/1.fit', 'activities/2.fit'])
  })

  it('keeps the first row for a file name that appears twice', () => {
    const names = namesOf(
      'Activity Name,Filename\nFirst,activities/1.fit\nSecond,ACTIVITIES/1.fit\n',
    )
    expect(names.get('activities/1.fit')).toBe('First')
    expect(names.size).toBe(1)
  })

  it('returns null for a list that ends inside a quoted field, which is malformed', () => {
    expect(namesFromActivityList('Activity Name,Filename\nRun,"activities/1.fit\n')).toBeNull()
  })

  it('stops at the row cap, so it never reads the rows past it', () => {
    // The last row is malformed, and a list that reads to its end would refuse the whole list.
    const rows = Array.from({ length: 1_000_000 }, (_, i) => `Run ${i},activities/${i}.fit`)
    const text = ['Activity Name,Filename', ...rows, 'Ride,"activities/x.fit'].join('\n')
    const names = namesFromActivityList(text)

    expect(names).not.toBeNull()
    expect(names?.size).toBe(DEFAULT_EXTRACT_LIMITS.maxFitFiles)
    expect(names?.has(`activities/${DEFAULT_EXTRACT_LIMITS.maxFitFiles - 1}.fit`)).toBe(true)
    expect(names?.has(`activities/${DEFAULT_EXTRACT_LIMITS.maxFitFiles}.fit`)).toBe(false)
  })

  it('honours a row cap given by the caller', () => {
    expect(namesOf(LIST, '', 1).size).toBe(1)
  })
})

describe('readActivityNames', () => {
  it('reads the list from the root of an export whose list comes after the activities', async () => {
    const zip = zipSync({
      'activities/1001.fit.gz': gzipSync(strToU8('fit')),
      'activities/1002.gpx.gz': gzipSync(strToU8('gpx')),
      'activities.csv': strToU8(LIST),
    })
    const listed = await readActivityNames(fileOf('export.zip', zip))

    expect(listed?.names.get('activities/1001.fit')).toBe('Morning Run')
    expect(listed?.names.get('activities/1002.gpx')).toBe('Hill repeats, 6 x 2 min')
  })

  it('reads the list in the folder an export was zipped from', async () => {
    const zip = zipSync({
      'export/activities/1001.fit.gz': gzipSync(strToU8('fit')),
      'export/activities.csv': strToU8(LIST),
    })
    const listed = await readActivityNames(fileOf('export.zip', zip))

    expect(listed?.names.get('export/activities/1001.fit')).toBe('Morning Run')
  })

  it('prefers the list nearest the root of the zip', async () => {
    const zip = zipSync({
      'old/activities.csv': strToU8('Activity Name,Filename\nOld name,activities/1.fit\n'),
      'activities.csv': strToU8('Activity Name,Filename\nNew name,activities/1.fit\n'),
    })
    const listed = await readActivityNames(fileOf('export.zip', zip))

    expect(listed?.names.get('activities/1.fit')).toBe('New name')
  })

  it('returns null when the zip has no list, or is not a zip', async () => {
    const plain = zipSync({ 'activities/1.fit': strToU8('fit') })
    expect(await readActivityNames(fileOf('export.zip', plain))).toBeNull()
    expect(await readActivityNames(fileOf('ride.fit', strToU8('fit')))).toBeNull()
  })

  it('returns null when the zip is larger than the source limit', async () => {
    const zip = zipSync({ 'activities.csv': strToU8(LIST) })
    const limits = { ...DEFAULT_EXTRACT_LIMITS, maxSourceBytes: 10 }
    expect(await readActivityNames(fileOf('export.zip', zip), limits)).toBeNull()
  })

  it('returns null when the list inflates past the list cap, though it is small when zipped', async () => {
    const zip = zipSync({ 'activities.csv': new Uint8Array(MAX_ACTIVITY_LIST_BYTES + 1) })
    expect(await readActivityNames(fileOf('export.zip', zip))).toBeNull()
  })

  it('reports the bytes the list inflated to, so they count against the export budget', async () => {
    const zip = zipSync({ 'activities.csv': strToU8(LIST) })
    const listed = await readActivityNames(fileOf('export.zip', zip))

    expect(listed?.decompressedBytes).toBe(strToU8(LIST).length)
  })

  it('still charges the bytes of a malformed list, which gives no names', async () => {
    const malformed = strToU8('Activity Name,Filename\nRun,"activities/1.fit\n')
    const zip = zipSync({ 'activities.csv': malformed })
    const listed = await readActivityNames(fileOf('export.zip', zip))

    expect(listed).not.toBeNull()
    expect(listed?.names.size).toBe(0)
    expect(listed?.decompressedBytes).toBe(malformed.length)
  })

  it('returns null when the list alone exceeds the export budget for decompressed bytes', async () => {
    const zip = zipSync({ 'activities.csv': strToU8(LIST) })
    const limits = { ...DEFAULT_EXTRACT_LIMITS, maxTotalDecompressedBytes: 16 }
    expect(await readActivityNames(fileOf('export.zip', zip), limits)).toBeNull()
  })
})
