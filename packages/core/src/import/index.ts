import { parseFit } from '../fit/parse'
import { parseGpx } from '../gpx/parse'
import { parseTcx } from '../tcx/parse'
import type { ParseLimits, ParseOptions, ParseResult } from './result'

export { DEFAULT_PARSE_LIMITS } from './result'
export { MAX_ACTIVITY_LIST_BYTES, MAX_CSV_CELLS_PER_ROW } from './activitiesCsv'
export {
  MAX_GARMIN_SUMMARIES_BYTES,
  MAX_GARMIN_SUMMARY_BYTES,
  MAX_GARMIN_SUMMARY_DEPTH,
  MAX_GARMIN_SUMMARY_OBJECTS,
  MAX_SUMMARY_FILES,
} from './garminList'
export type { ParseLimits, ParseOptions, ParseResult } from './result'

const UNSUPPORTED = 'Not a FIT, GPX or TCX file'

/**
 * Parses one activity file, chosen by its extension after any .gz: .fit, .gpx or .tcx. The bytes
 * must already be decompressed. Anything else is refused with a clear reason. Never throws.
 */
export function parseActivityFile(
  bytes: Uint8Array,
  fileName: string,
  limits?: ParseLimits,
  opts?: ParseOptions,
): ParseResult {
  const extension = /\.([a-z0-9]+)(\.gz)?$/i.exec(fileName)?.[1]?.toLowerCase()
  switch (extension) {
    case 'fit':
      return parseFit(bytes, fileName, limits, opts)
    case 'gpx':
      return parseGpx(bytes, fileName, limits, opts)
    case 'tcx':
      return parseTcx(bytes, fileName, limits, opts)
    default:
      return { ok: false, fileName, reason: UNSUPPORTED, code: 'not-activity' }
  }
}
