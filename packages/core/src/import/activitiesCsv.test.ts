import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS } from '../fit/archive'
import {
  countImportFiles,
  entryKey,
  listedOnly,
  MAX_ACTIVITY_LIST_BYTES,
  parseActivityList,
  readActivityList,
} from './activitiesCsv'
import type { ListedActivity } from './activitiesCsv'

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

/** The files of a list that must read, as a map. */
function filesOf(text: string, folder?: string, maxRows?: number): Map<string, ListedActivity> {
  const list = parseActivityList(text, folder, maxRows)
  if (list === null) throw new Error('expected the list to read')
  return list.files
}

/** The name the list gives a file, by key. */
function nameOf(files: Map<string, ListedActivity>, key: string): string | undefined {
  return files.get(key)?.name
}

describe('entryKey', () => {
  it('lowercases a path, turns backslashes into slashes, and drops a leading ./ or / and a .gz', () => {
    expect(entryKey('./Activities\\1001.FIT.GZ')).toBe('activities/1001.fit')
    expect(entryKey('/activities/1002.gpx')).toBe('activities/1002.gpx')
  })
})

describe('parseActivityList', () => {
  it('maps each activity file to its name and type, under its key', () => {
    expect([...filesOf(LIST)]).toEqual([
      ['activities/1001.fit', { name: 'Morning Run', type: 'Run' }],
      ['activities/1002.gpx', { name: 'Hill repeats, 6 x 2 min', type: 'Ride' }],
    ])
  })

  it('puts the folder the list sits in in front of each file name', () => {
    const files = filesOf(LIST, 'export/')
    expect(nameOf(files, 'export/activities/1001.fit')).toBe('Morning Run')
    expect(files.has('activities/1001.fit')).toBe(false)
  })

  it('reads an export whose activity columns are only ID, name and file', () => {
    const files = filesOf('Activity ID,Activity Name,Filename\n1,Lunch Ride,a/1.fit\n')
    expect(files.get('a/1.fit')).toEqual({ name: 'Lunch Ride' })
  })

  it('matches the headers whatever their case', () => {
    const files = filesOf('activity name,FILENAME,Activity TYPE\nLunch Ride,a/1.fit,Virtual Ride\n')
    expect(files.get('a/1.fit')).toEqual({ name: 'Lunch Ride', type: 'Virtual Ride' })
  })

  it('reads the type as written, trimmed, and leaves out a blank one', () => {
    const files = filesOf(
      'Activity Name,Activity Type,Filename\nA,  Trail Run ,a/1.fit\nB,,a/2.fit\n',
    )
    expect(files.get('a/1.fit')?.type).toBe('Trail Run')
    expect(files.get('a/2.fit')).toEqual({ name: 'B' })
  })

  it('keeps a row whose name is blank, because its type still says what the file is', () => {
    const files = filesOf('Activity Name,Activity Type,Filename\n   ,Run,activities/1.fit\n')
    expect(files.get('activities/1.fit')).toEqual({ type: 'Run' })
  })

  it('keeps a row that has a file and neither name nor type, so the list still names the file', () => {
    const files = filesOf('Activity Name,Activity Type,Filename\n,,activities/1.fit\n')
    expect(files.get('activities/1.fit')).toEqual({})
  })

  it('reads a list that has a file column and no name or type column', () => {
    const files = filesOf('Activity ID,Filename\n1,activities/1.fit\n')
    expect([...files.keys()]).toEqual(['activities/1.fit'])
  })

  it('returns no files when the list has no file column', () => {
    expect(filesOf('Activity ID,Activity Name\n1,Morning Run\n').size).toBe(0)
  })

  it('skips a row with no file', () => {
    const files = filesOf('Activity Name,Filename\nRun,\nRide,activities/2.fit\n')
    expect([...files.keys()]).toEqual(['activities/2.fit'])
  })

  it('normalises the keys, so a path written another way still finds its file', () => {
    const files = filesOf(
      'Activity Name,Filename\nRun,./Activities\\1.FIT.GZ\nRide,/activities/2.fit\n',
    )
    expect([...files.keys()]).toEqual(['activities/1.fit', 'activities/2.fit'])
  })

  it('keeps the first row for a file name that appears twice', () => {
    const files = filesOf(
      'Activity Name,Filename\nFirst,activities/1.fit\nSecond,ACTIVITIES/1.fit\n',
    )
    expect(nameOf(files, 'activities/1.fit')).toBe('First')
    expect(files.size).toBe(1)
  })

  it('returns null for a list that ends inside a quoted field, which is malformed', () => {
    expect(parseActivityList('Activity Name,Filename\nRun,"activities/1.fit\n')).toBeNull()
  })

  it('stops at the row cap, so it never reads the rows past it', () => {
    // The last row is malformed, and a list that reads to its end would refuse the whole list.
    const rows = Array.from({ length: 1_000_000 }, (_, i) => `Run ${i},activities/${i}.fit`)
    const text = ['Activity Name,Filename', ...rows, 'Ride,"activities/x.fit'].join('\n')
    const list = parseActivityList(text)

    expect(list).not.toBeNull()
    expect(list?.files.size).toBe(DEFAULT_EXTRACT_LIMITS.maxFitFiles)
    expect(list?.files.has(`activities/${DEFAULT_EXTRACT_LIMITS.maxFitFiles - 1}.fit`)).toBe(true)
    expect(list?.files.has(`activities/${DEFAULT_EXTRACT_LIMITS.maxFitFiles}.fit`)).toBe(false)
  })

  it('honours a row cap given by the caller', () => {
    expect(filesOf(LIST, '', 1).size).toBe(1)
  })

  it('says whether it read the list to its end, which a list cut at the row cap did not', () => {
    expect(parseActivityList(LIST)?.complete).toBe(true)
    // A list of exactly the cap is read to its end.
    expect(parseActivityList(LIST, '', 3)?.complete).toBe(true)
    expect(parseActivityList(LIST, '', 2)?.complete).toBe(false)
  })
})

describe('listedOnly', () => {
  const list = (text: string) => {
    const parsed = parseActivityList(text)
    if (parsed === null) throw new Error('expected the list to read')
    return { ...parsed, decompressedBytes: 0 }
  }

  it('keeps the files the list names, however the entry spells its path', () => {
    const keep = listedOnly(list(LIST))
    expect(keep?.('activities/1001.fit.gz')).toBe(true)
    expect(keep?.('Activities\\1002.GPX')).toBe(true)
    expect(keep?.('routes/1.gpx')).toBe(false)
  })

  it('does not filter without a list, with a list that names no file, or with one cut at the cap', () => {
    expect(listedOnly(null)).toBeUndefined()
    expect(listedOnly(list('Activity ID,Activity Name\n1,Morning Run\n'))).toBeUndefined()
    expect(listedOnly(list('Activity Name,Filename\nManual entry,\n'))).toBeUndefined()
    expect(listedOnly({ ...list(LIST), complete: false })).toBeUndefined()
  })
})

describe('readActivityList', () => {
  it('reads the list from the root of an export whose list comes after the activities', async () => {
    const zip = zipSync({
      'activities/1001.fit.gz': gzipSync(strToU8('fit')),
      'activities/1002.gpx.gz': gzipSync(strToU8('gpx')),
      'activities.csv': strToU8(LIST),
    })
    const listed = await readActivityList(fileOf('export.zip', zip))

    expect(listed?.files.get('activities/1001.fit')).toEqual({ name: 'Morning Run', type: 'Run' })
    expect(nameOf(listed?.files ?? new Map(), 'activities/1002.gpx')).toBe(
      'Hill repeats, 6 x 2 min',
    )
    expect(listed?.complete).toBe(true)
  })

  it('reads the list in the folder an export was zipped from', async () => {
    const zip = zipSync({
      'export/activities/1001.fit.gz': gzipSync(strToU8('fit')),
      'export/activities.csv': strToU8(LIST),
    })
    const listed = await readActivityList(fileOf('export.zip', zip))

    expect(listed?.files.get('export/activities/1001.fit')?.name).toBe('Morning Run')
  })

  it('prefers the list nearest the root of the zip', async () => {
    const zip = zipSync({
      'old/activities.csv': strToU8('Activity Name,Filename\nOld name,activities/1.fit\n'),
      'activities.csv': strToU8('Activity Name,Filename\nNew name,activities/1.fit\n'),
    })
    const listed = await readActivityList(fileOf('export.zip', zip))

    expect(listed?.files.get('activities/1.fit')?.name).toBe('New name')
  })

  it('returns null when the zip has no list, or is not a zip', async () => {
    const plain = zipSync({ 'activities/1.fit': strToU8('fit') })
    expect(await readActivityList(fileOf('export.zip', plain))).toBeNull()
    expect(await readActivityList(fileOf('ride.fit', strToU8('fit')))).toBeNull()
  })

  it('returns null when the zip is larger than the source limit', async () => {
    const zip = zipSync({ 'activities.csv': strToU8(LIST) })
    const limits = { ...DEFAULT_EXTRACT_LIMITS, maxSourceBytes: 10 }
    expect(await readActivityList(fileOf('export.zip', zip), limits)).toBeNull()
  })

  // Zipping and inflating past the real cap is slow under coverage on a shared runner, so this one
  // test has a longer limit than the default 5 s.
  it('returns null when the list inflates past the list cap, though it is small when zipped', async () => {
    const zip = zipSync({ 'activities.csv': new Uint8Array(MAX_ACTIVITY_LIST_BYTES + 1) })
    expect(await readActivityList(fileOf('export.zip', zip))).toBeNull()
  }, 30_000)

  it('reports the bytes the list inflated to, so they count against the export budget', async () => {
    const zip = zipSync({ 'activities.csv': strToU8(LIST) })
    const listed = await readActivityList(fileOf('export.zip', zip))

    expect(listed?.decompressedBytes).toBe(strToU8(LIST).length)
  })

  it('still charges the bytes of a malformed list, which names no files', async () => {
    const malformed = strToU8('Activity Name,Filename\nRun,"activities/1.fit\n')
    const zip = zipSync({ 'activities.csv': malformed })
    const listed = await readActivityList(fileOf('export.zip', zip))

    expect(listed).not.toBeNull()
    expect(listed?.files.size).toBe(0)
    expect(listed?.decompressedBytes).toBe(malformed.length)
    expect(listedOnly(listed)).toBeUndefined()
  })

  it('returns null when the list alone exceeds the export budget for decompressed bytes', async () => {
    const zip = zipSync({ 'activities.csv': strToU8(LIST) })
    const limits = { ...DEFAULT_EXTRACT_LIMITS, maxTotalDecompressedBytes: 16 }
    expect(await readActivityList(fileOf('export.zip', zip), limits)).toBeNull()
  })
})

describe('countImportFiles', () => {
  const FIT = new Uint8Array([14, 16, 0, 0, 1, 2, 3, 4, 46, 70, 73, 84, 9, 9])

  it('leaves out the activity files the export list does not name', async () => {
    const zip = zipSync({
      'activities/1001.fit.gz': gzipSync(FIT),
      'activities/1002.gpx.gz': gzipSync(strToU8('gpx')),
      'routes/1.gpx': strToU8('gpx'),
      'routes/2.gpx': strToU8('gpx'),
      'activities.csv': strToU8(LIST),
    })

    expect(await countImportFiles([fileOf('export.zip', zip)])).toBe(2)
  })

  it('counts every activity file of a zip without a list, and sums its sources', async () => {
    const zip = zipSync({ 'activities/1.fit': FIT, 'routes/1.gpx': strToU8('gpx') })

    expect(await countImportFiles([fileOf('export.zip', zip), fileOf('ride.fit', FIT)])).toBe(3)
  })

  it('is unknown when any source cannot be counted from its directory', async () => {
    const inner = zipSync({ 'a.fit': FIT })
    const zip = zipSync({ 'inner.zip': inner })

    expect(await countImportFiles([fileOf('export.zip', zip)])).toBeNull()
  })
})
