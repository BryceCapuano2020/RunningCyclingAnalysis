import { gzipSync, strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXTRACT_LIMITS, extractFitFiles } from './archive'
import type { ExtractLimits } from './archive'
import type { EntryFilter } from './zipDirectory'

const FIT = new Uint8Array([14, 16, 0, 0, 1, 2, 3, 4, 46, 70, 73, 84, 9, 9])
const NOT_GZIP = new Uint8Array([1, 2, 3, 4, 5])

/** The activities of a Strava export: the files under activities/ are the ones its list names. */
const inActivities: EntryFilter = (entry) => entry.startsWith('activities/')

async function collect(
  file: File,
  listed?: EntryFilter,
  limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS,
) {
  const names: string[] = []
  const errors: { fileName: string; reason: string }[] = []
  const summary = await extractFitFiles(
    file,
    (delivered) => {
      names.push(delivered.fileName)
    },
    (fileName, rejection) => {
      errors.push({ fileName, reason: rejection.reason })
    },
    limits,
    listed,
  )
  return { names, errors, summary }
}

function zipFile(entries: Record<string, Uint8Array>): File {
  return new File([new Uint8Array(zipSync(entries))], 'export.zip')
}

describe('extractFitFiles with a filter on the zip entries', () => {
  it('leaves out the activity files the filter refuses, and counts them apart', async () => {
    const zip = zipFile({
      'activities/1.fit': FIT,
      'activities/2.gpx.gz': gzipSync(strToU8('gpx')),
      'routes/1.gpx': strToU8('gpx'),
      'routes/2.gpx.gz': gzipSync(strToU8('gpx')),
      'routes/3.tcx': strToU8('tcx'),
    })
    const { names, errors, summary } = await collect(zip, inActivities)

    expect(names).toEqual(['activities/1.fit', 'activities/2.gpx'])
    expect(errors).toEqual([])
    expect(summary).toEqual({ fitFiles: 2, otherActivityFiles: 0, notActivities: 3 })
  })

  it('delivers every activity file when it has no filter', async () => {
    const zip = zipFile({ 'activities/1.fit': FIT, 'routes/1.gpx': strToU8('gpx') })
    const { names, summary } = await collect(zip)

    expect(names).toEqual(['activities/1.fit', 'routes/1.gpx'])
    expect(summary.notActivities).toBe(0)
  })

  it('does not read a file it leaves out, so a damaged one raises nothing', async () => {
    const zip = zipFile({ 'activities/1.fit': FIT, 'routes/1.gpx.gz': NOT_GZIP })

    expect((await collect(zip, inActivities)).errors).toEqual([])
    expect((await collect(zip)).errors).toEqual([
      { fileName: 'routes/1.gpx.gz', reason: 'Could not decompress this file' },
    ])
  })

  it('keeps the files it leaves out from the cap on activity files', async () => {
    const zip = zipFile({
      'routes/1.gpx': strToU8('gpx'),
      'routes/2.gpx': strToU8('gpx'),
      'activities/1.fit': FIT,
      'routes/3.gpx': strToU8('gpx'),
      'activities/2.fit': FIT,
    })
    const limits = { ...DEFAULT_EXTRACT_LIMITS, maxFitFiles: 2 }
    const { names, errors, summary } = await collect(zip, inActivities, limits)

    expect(names).toEqual(['activities/1.fit', 'activities/2.fit'])
    expect(errors).toEqual([])
    expect(summary).toEqual({ fitFiles: 2, otherActivityFiles: 0, notActivities: 3 })
  })

  it('still caps the activity files it keeps', async () => {
    const zip = zipFile({
      'activities/1.fit': FIT,
      'activities/2.fit': FIT,
      'activities/3.fit': FIT,
    })
    const limits = { ...DEFAULT_EXTRACT_LIMITS, maxFitFiles: 2 }
    const { names, errors } = await collect(zip, inActivities, limits)

    expect(names).toEqual(['activities/1.fit', 'activities/2.fit'])
    expect(errors).toHaveLength(1)
  })

  it('counts a file in a format the app does not read as not an activity too, when the filter refuses it', async () => {
    const zip = zipFile({
      'routes/1.kml': strToU8('kml'),
      'routes/2.pwx.gz': gzipSync(strToU8('pwx')),
      'routes/3.hrm': strToU8('hrm'),
      'activities/4.kml': strToU8('kml'),
    })
    const { summary, errors } = await collect(zip, inActivities)

    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 1, notActivities: 3 })
    expect(errors).toEqual([])
  })

  it('counts nothing for folders, macOS metadata or other files', async () => {
    const zip = zipFile({
      'routes/': new Uint8Array(0),
      '__MACOSX/routes/._1.gpx': strToU8('metadata'),
      'routes/photo.jpg': strToU8('jpeg'),
      'notes.txt': strToU8('text'),
    })
    const { summary } = await collect(zip, inActivities)

    expect(summary).toEqual({ fitFiles: 0, otherActivityFiles: 0, notActivities: 0 })
  })

  it('applies to the zip it is given, not to the zips inside it', async () => {
    const inner = zipSync({ 'rides/1.fit': FIT })
    const zip = zipFile({ 'activities/1.fit': FIT, 'more.zip': inner })
    const { names, summary } = await collect(zip, inActivities)

    expect(names).toEqual(['activities/1.fit', 'more.zip/rides/1.fit'])
    expect(summary.notActivities).toBe(0)
  })

  it('does not apply to a single file', async () => {
    const { names, summary } = await collect(new File([FIT], 'ride.fit'), () => false)

    expect(names).toEqual(['ride.fit'])
    expect(summary.notActivities).toBe(0)
  })
})
