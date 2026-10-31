/**
 * The file types the import reads: a FIT, GPX or TCX file, a gzipped file such as a Garmin .fit.gz,
 * or a zip of them. Named once, for the name check and for the file picker's list.
 */
const READABLE_EXTENSIONS = ['fit', 'gpx', 'tcx', 'gz', 'zip'] as const

const READABLE_NAME = new RegExp(`\\.(${READABLE_EXTENSIONS.join('|')})$`, 'i')

/**
 * The list of a Strava export, given beside the files it names. The picker offers any .csv, since it cannot ask for
 * a name; a drop is read only when the file is called exactly this, whatever folder it came from.
 */
const COMPANION_NAME = /(^|[\\/])activities\.csv$/i

/** The file picker's accept list: the types the import reads, and the export's list. */
export const READABLE_ACCEPT = [...READABLE_EXTENSIONS, 'csv']
  .map((extension) => `.${extension}`)
  .join(',')

/**
 * Whether a file's name says the import can read it. The contents are checked later; this decides
 * only whether a drop is worth a question before its first analysis.
 */
export function isReadableFileName(name: string): boolean {
  return READABLE_NAME.test(name) || COMPANION_NAME.test(name)
}
