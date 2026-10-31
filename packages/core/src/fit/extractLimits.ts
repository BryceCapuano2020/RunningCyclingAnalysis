import { GIB, MIB } from '../constants'
import {
  MAX_SKIPPED_ENTRY_FREE_BYTES,
  MAX_SKIPPED_GLOBAL_FREE_BYTES,
  MAX_SKIPPED_GLOBAL_RATIO,
  MAX_SKIPPED_INFLATE_BYTES,
  MAX_SKIPPED_INFLATE_RATIO,
} from '../import/limits'

/** The limits one import applies to what it reads. The constants unless a test or caller sets others. */
export interface ExtractLimits {
  /** Compressed or uncompressed bytes accepted from one source. */
  maxSourceBytes: number
  /** Bytes in one archive entry, or final bytes after optional gzip decompression. */
  maxEntryBytes: number
  /** Total bytes emitted by decompressors for one source, including nested zips. Reaching it stops extraction. */
  maxTotalDecompressedBytes: number
  /** FIT, GPX and TCX entries (each optionally gzipped) allowed in one source. */
  maxFitFiles: number
  /** All archive entry headers allowed, including ignored, non-activity and nested-zip entries. */
  maxArchiveEntries: number
  /** Maximum retained output bytes while ZIP entries are being streamed. */
  maxBufferedBytes: number
  /** Bytes a skipped entry may inflate to before its ratio is judged (see skipEntry). */
  maxSkippedEntryFreeBytes: number
  /** The most a skipped entry may inflate to, as a multiple of the compressed bytes it was read from. */
  maxSkippedInflateRatio: number
  /** Bytes all skipped entries of one source may inflate to, nested zips included, before their ratio is judged. */
  maxSkippedGlobalFreeBytes: number
  /** The most all skipped entries of a source may inflate to, as a multiple of the compressed bytes read for them. */
  maxSkippedGlobalRatio: number
  /** Bytes all skipped entries of one source may inflate to whatever their ratio. */
  maxSkippedInflateBytes: number
}

export const DEFAULT_EXTRACT_LIMITS: Readonly<ExtractLimits> = {
  maxSourceBytes: 2 * GIB,
  maxEntryBytes: 64 * MIB,
  maxTotalDecompressedBytes: 2 * GIB,
  maxFitFiles: 10_000,
  maxArchiveEntries: 100_000,
  maxBufferedBytes: 128 * MIB,
  maxSkippedEntryFreeBytes: MAX_SKIPPED_ENTRY_FREE_BYTES,
  maxSkippedInflateRatio: MAX_SKIPPED_INFLATE_RATIO,
  maxSkippedGlobalFreeBytes: MAX_SKIPPED_GLOBAL_FREE_BYTES,
  maxSkippedGlobalRatio: MAX_SKIPPED_GLOBAL_RATIO,
  maxSkippedInflateBytes: MAX_SKIPPED_INFLATE_BYTES,
}
