import { gzipSync, strToU8, zipSync } from 'fflate'
import type { Zippable } from 'fflate'
import { encodeFit } from '@rca/core/fit'
import { encodeGpx } from '@rca/core/gpx/encode'
import type { FileFormat, Library, LibraryEntry } from '@rca/core/synthetic'
import { encodeTcx } from '@rca/core/tcx/encode'
import type { Sport } from '@rca/core/types'

/** Fixed zip entry time (zip cannot store a date before 1980), so the same library gives the same bytes. */
const ZIP_MTIME = new Date('2025-06-15T12:00:00Z')
const STRAVA_TYPE: Record<Sport, string> = { run: 'Run', ride: 'Ride' }

export interface LibraryFile {
  /** Path inside the output folder or the zip. */
  name: string
  bytes: Uint8Array
}

/** One activity as the device or export would hold it. A treadmill run is a FIT with the treadmill sub-sport, or a TCX without positions. */
export function encodeEntry({
  activity,
  format,
}: Pick<LibraryEntry, 'activity' | 'format'>): Uint8Array {
  const outdoor = !activity.indoor
  const encoders: Record<FileFormat, () => Uint8Array> = {
    fit: () =>
      encodeFit(activity, { gps: outdoor, ...(outdoor ? {} : { subSport: 'treadmill' as const }) }),
    gpx: () => encodeGpx(activity),
    tcx: () => encodeTcx(activity, { gps: outdoor }),
  }
  return encoders[format]()
}

const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

/** The files of a library, one per activity, named in order: `NNNN.fit`, `NNNN.gpx`, `NNNN.tcx`. */
export function makeLibraryFiles(library: Library): LibraryFile[] {
  return library.entries.map((entry, i) => ({
    name: `${String(i + 1).padStart(4, '0')}.${entry.format}`,
    bytes: encodeEntry(entry),
  }))
}

/** The library as a Strava bulk export: `activities.csv` listing every file, and the files gzipped. */
export function makeStravaZip(library: Library): Uint8Array {
  const zipped: Zippable = {}
  const rows: string[] = []
  makeLibraryFiles(library).forEach((file, i) => {
    const entry = library.entries[i]!
    const path = `activities/${file.name}.gz`
    zipped[path] = [gzipSync(file.bytes, { mtime: 0, level: 9 }), { mtime: ZIP_MTIME, level: 0 }]
    rows.push(
      [
        i + 1,
        stamp(entry.activity.startMs),
        entry.activity.name,
        STRAVA_TYPE[entry.activity.sport],
        entry.activity.n,
        path,
      ].join(','),
    )
  })
  const header = 'Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Filename\n'
  zipped['activities.csv'] = [
    strToU8(`${header}${rows.join('\n')}\n`),
    { mtime: ZIP_MTIME, level: 9 },
  ]
  return zipSync(zipped)
}
