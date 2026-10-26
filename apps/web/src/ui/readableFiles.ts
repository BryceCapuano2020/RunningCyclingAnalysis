/**
 * The file types the import reads: a FIT, GPX or TCX file, a gzipped file such as a Garmin .fit.gz,
 * or a zip of them. Named once, for the name check and for the file picker's list.
 */
const READABLE_EXTENSIONS = ['fit', 'gpx', 'tcx', 'gz', 'zip'] as const

const READABLE_NAME = new RegExp(`\\.(${READABLE_EXTENSIONS.join('|')})$`, 'i')

/** The file picker's accept list, so the picker offers exactly the types the import reads. */
export const READABLE_ACCEPT = READABLE_EXTENSIONS.map((extension) => `.${extension}`).join(',')

/**
 * Whether a file's name says the import can read it. The contents are checked later; this decides
 * only whether a drop is worth a question before its first analysis.
 */
export function isReadableFileName(name: string): boolean {
  return READABLE_NAME.test(name)
}
