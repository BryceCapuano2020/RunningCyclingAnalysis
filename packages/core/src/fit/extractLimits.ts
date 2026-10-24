import { GIB, MIB } from '../constants'

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
}

export const DEFAULT_EXTRACT_LIMITS: Readonly<ExtractLimits> = {
  maxSourceBytes: 2 * GIB,
  maxEntryBytes: 64 * MIB,
  maxTotalDecompressedBytes: 2 * GIB,
  maxFitFiles: 10_000,
  maxArchiveEntries: 100_000,
  maxBufferedBytes: 128 * MIB,
}
