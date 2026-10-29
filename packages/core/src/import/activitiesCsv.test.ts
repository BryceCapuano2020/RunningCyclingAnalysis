import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS } from '../fit/archive'
import {
  countImportFiles,
  entryKey,
  listedOnly,
  MAX_ACTIVITY_LIST_BYTES,
  MAX_CSV_CELLS_PER_ROW,
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

/**
 * A list of `cells` cells in its header and in its one row: a name, filler columns, and the
 * Filename column last, which names activities/1.fit.
 */
function wideList(cells: number): string {
  const fillers = Array.from({ length: cells - 2 }, (_, i) => `Column ${i}`)
  const header = ['Activity Name', ...fillers, 'Filename'].join(',')
  const row = ['Morning Run', ...fillers.map(() => '1'), 'activities/1.fit'].join(',')
  return `${header}\n${row}\n`
}

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

  it('resolves . and .. segments and repeated slashes, so a path written another way is the same key', () => {
    expect(entryKey('export/./old//3.fit.gz')).toBe('export/old/3.fit')
    expect(entryKey('export/old/../activities/1.fit')).toBe('export/activities/1.fit')
    expect(entryKey('.\\old\\.\\3.FIT')).toBe('old/3.fit')
  })

  it('has no key for a path that climbs above the root of the zip', () => {
    expect(entryKey('../routes/1.gpx')).toBeNull()
    expect(entryKey('../../a/1.fit')).toBeNull()
    expect(entryKey('a/../../b.fit')).toBeNull()
    expect(entryKey('a/../b.fit')).toBe('b.fit')
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

  it('reads the Competition column as a race tag: set as 1, 1.0 or true, not as blank, 0 or false', () => {
    const rows = ['A,1.0', 'B,1', 'C,true', 'D,TRUE', 'E,', 'F,0.0', 'G,0', 'H,false']
    const files = filesOf(
      `Activity Name,Competition,Filename\n${rows.map((r, i) => `${r.replace(',', ',')},a/${i}.fit`).join('\n')}\n`,
    )
    const tagged = [...files].filter(([, listed]) => listed.race === true).map(([, l]) => l.name)
    expect(tagged).toEqual(['A', 'B', 'C', 'D'])
    expect(files.get('a/4.fit')).toEqual({ name: 'E' })
  })

  it('has no race tag when the list has no Competition column, and reads its header in any case', () => {
    expect(filesOf('Activity Name,Filename\nA,a/1.fit\n').get('a/1.fit')).toEqual({ name: 'A' })
    expect(filesOf('Activity Name,COMPETITION,Filename\nA,1.0,a/1.fit\n').get('a/1.fit')).toEqual({
      name: 'A',
      race: true,
    })
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

  it.each([
    ['climbs above the root of the zip', '../routes/1.gpx'],
    ['is the folder itself', '.'],
    ['is the root', './'],
    ['ends in a slash', 'activities/'],
    ['ends in ..', 'activities/old/..'],
    ['ends in .', 'activities/old/.'],
    ['is the zip written with backslashes, ending in one', 'activities\\'],
  ])('skips a row whose file %s, which names no file', (_what, file) => {
    const files = filesOf(`Activity Name,Filename\nRun,${file}\nRun,activities/1.fit\n`)
    expect([...files.keys()]).toEqual(['activities/1.fit'])
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

  it('reads a list whose rows have exactly the cell cap', () => {
    expect(nameOf(filesOf(wideList(MAX_CSV_CELLS_PER_ROW)), 'activities/1.fit')).toBe('Morning Run')
  })

  it('returns null for a list whose header has one cell past the cap, which is malformed', () => {
    expect(parseActivityList(wideList(MAX_CSV_CELLS_PER_ROW + 1))).toBeNull()
  })

  it('returns null for a 32 MiB header of commas, the crafted list that the cell cap stops', () => {
    expect(parseActivityList(','.repeat(MAX_ACTIVITY_LIST_BYTES))).toBeNull()
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

  it('makes the whole list malformed when a row past the row cap is also too wide', () => {
    const wide = ['Run', ...Array(MAX_CSV_CELLS_PER_ROW).fill('1'), 'activities/2.fit'].join(',')
    const narrow = 'Run,activities/2.fit'
    expect(
      parseActivityList(`Activity Name,Filename\nRun,activities/1.fit\n${narrow}\n`, '', 1)
        ?.complete,
    ).toBe(false)
    expect(
      parseActivityList(`Activity Name,Filename\nRun,activities/1.fit\n${wide}\n`, '', 1),
    ).toBeNull()
  })

  it('says whether it read the list to its end, which a list cut at the row cap did not', () => {
    expect(parseActivityList(LIST)?.complete).toBe(true)
    // A list of exactly the cap is read to its end.
    expect(parseActivityList(LIST, '', 3)?.complete).toBe(true)
    expect(parseActivityList(LIST, '', 2)?.complete).toBe(false)
  })
})

describe('listedOnly', () => {
  /** The filter for a zip of these entries, from the list it holds. */
  async function filterOf(entries: Record<string, Uint8Array>, limits = DEFAULT_EXTRACT_LIMITS) {
    const file = fileOf('export.zip', zipSync(entries))
    return listedOnly(file, limits, await readActivityList(file, limits))
  }
  const stravaLayout = {
    'activities/1001.fit.gz': strToU8('fit'),
    'activities/1002.gpx.gz': strToU8('gpx'),
    'routes/1.gpx': strToU8('gpx'),
    'activities.csv': strToU8(LIST),
  }

  it('keeps the files the list names, however the entry spells its path, and leaves out routes/', async () => {
    const keep = await filterOf(stravaLayout)
    expect(keep?.('activities/1001.fit.gz')).toBe(true)
    expect(keep?.('Activities\\1002.GPX')).toBe(true)
    expect(keep?.('routes/1.gpx')).toBe(false)
  })

  it('lists no folder for a row that is not a file, so the zip is not covered by it', async () => {
    const keep = await filterOf({
      ...stravaLayout,
      'activities.csv': strToU8(
        'Activity Name,Filename\nRun,activities/1001.fit.gz\nRun,../routes/1.gpx\nRun,.\nRun,./\nRun,activities/old/..\n',
      ),
    })
    expect(keep?.('activities/1001.fit.gz')).toBe(true)
    expect(keep?.('routes/1.gpx')).toBe(false)
    expect(keep?.('other/2.gpx')).toBe(false)
  })

  it('keeps a file the list does not name when it sits in the folder of one it does, as a partial list leaves it', async () => {
    const keep = await filterOf({ ...stravaLayout, 'activities/1003.fit': strToU8('fit') })
    expect(keep?.('activities/1003.fit')).toBe(true)
    expect(keep?.('routes/1.gpx')).toBe(false)
  })

  it('keeps a file in a folder below a listed one, and leaves out a sibling folder', async () => {
    const keep = await filterOf({
      ...stravaLayout,
      'activities/2019/1.fit': strToU8('fit'),
      'activities/2019/old/2.fit': strToU8('fit'),
    })
    expect(keep?.('activities/2019/1.fit')).toBe(true)
    expect(keep?.('activities/2019/old/2.fit')).toBe(true)
    expect(keep?.('routes/1.gpx')).toBe(false)
    expect(keep?.('routes/activities/1.gpx')).toBe(false)
  })

  it('keeps every folder when a listed file sits at the root of the zip', async () => {
    const keep = await filterOf({
      '1001.fit': strToU8('fit'),
      'routes/1.gpx': strToU8('gpx'),
      'activities.csv': strToU8('Activity Name,Filename\nRun,1001.fit\n'),
    })
    expect(keep?.('routes/1.gpx')).toBe(true)
  })

  it('keeps the folder of a listed file the zip does not hold, and reads . and .. in the rows', async () => {
    const keep = await filterOf({
      'export/activities/1001.fit': strToU8('fit'),
      'export/old/4.fit': strToU8('fit'),
      'export/routes/1.gpx': strToU8('gpx'),
      'export/activities.csv': strToU8(
        'Activity Name,Filename\nRun,activities/1001.fit\nRun,./old/3.fit.gz\nRun,activities/../new/5.fit\n',
      ),
    })
    expect(keep?.('export/old/3.fit')).toBe(true)
    expect(keep?.('export/old/4.fit')).toBe(true)
    expect(keep?.('export/new/9.fit')).toBe(true)
    expect(keep?.('export/routes/1.gpx')).toBe(false)
  })

  it('does not filter without a list, with a list that names no file, or with one cut at the cap', async () => {
    const file = fileOf('export.zip', zipSync(stravaLayout))
    const list = await readActivityList(file)
    expect(await listedOnly(file, DEFAULT_EXTRACT_LIMITS, null)).toBeUndefined()
    expect(
      await listedOnly(file, DEFAULT_EXTRACT_LIMITS, { ...list!, files: new Map() }),
    ).toBeUndefined()
    expect(
      await listedOnly(file, DEFAULT_EXTRACT_LIMITS, { ...list!, complete: false }),
    ).toBeUndefined()
  })

  it('does not filter a zip that holds more than one activities.csv', async () => {
    const keep = await filterOf({
      ...stravaLayout,
      'other/activities.csv': strToU8('Activity Name,Filename\nRun,activities/1001.fit\n'),
    })
    expect(keep).toBeUndefined()
  })

  it.each([
    ['a wrapper folder the list does not know of', 'export/'],
    ['names written another way', 'activities/My%20Run.fit'],
  ])(
    'does not filter when the list names none of the activity files in the zip: %s',
    async (_name, entry) => {
      const named = entry.endsWith('/') ? `${entry}activities/1001.fit` : entry
      const list = strToU8(
        'Activity Name,Filename\nRun,activities/My Run.fit\nRide,activities/1001.fit\n',
      )
      const keep = await filterOf({
        [named]: strToU8('fit'),
        'routes/1.gpx': strToU8('gpx'),
        'activities.csv': list,
      })
      expect(keep).toBeUndefined()
    },
  )
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

  it('finds the list of a zip written with backslashes, and prefers the one nearest the root', async () => {
    const zip = zipSync({
      'a\\b\\activities.csv': strToU8('Activity Name,Filename\nDeep,activities/1.fit\n'),
      'export\\activities.csv': strToU8('Activity Name,Filename\nNear,activities/1.fit\n'),
    })
    const listed = await readActivityList(fileOf('export.zip', zip))

    expect(listed?.files.get('export/activities/1.fit')?.name).toBe('Near')
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
    const file = fileOf('export.zip', zip)
    expect(await listedOnly(file, DEFAULT_EXTRACT_LIMITS, listed)).toBeUndefined()
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

  it('reads every file when a row of the list is past the cell cap, since the list is malformed', async () => {
    const zip = zipSync({
      'activities/1.fit': FIT,
      'routes/1.gpx': strToU8('gpx'),
      'activities.csv': strToU8(wideList(MAX_CSV_CELLS_PER_ROW + 1)),
    })

    expect(await countImportFiles([fileOf('export.zip', zip)])).toBe(2)
  })

  it('is unknown when any source cannot be counted from its directory', async () => {
    const inner = zipSync({ 'a.fit': FIT })
    const zip = zipSync({ 'inner.zip': inner })

    expect(await countImportFiles([fileOf('export.zip', zip)])).toBeNull()
  })
})
