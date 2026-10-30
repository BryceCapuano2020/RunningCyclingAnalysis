import type { UnzipFile } from 'fflate'
import type { Rejection } from '../import/result'
import { skippedTooCompressed, skippedTooLarge } from './archiveReasons'
import type { ExtractLimits } from './extractLimits'
import type { StreamTail } from './streamTail'
import type { ZipReader } from './zipReader'
import type { EntryFilter } from './zipDirectory'

export { DECOMPRESS_INPUT_CHUNK_BYTES, MAX_NESTED_ARCHIVE_DEPTH } from '../import/limits'

/** What a read of a source delivers and counts. See extractFitFiles. */
export interface Sink {
  summary: { fitFiles: number; otherActivityFiles: number; notActivities: number }
  onFile: (file: { fileName: string; bytes: Uint8Array }) => void | Promise<void>
  onError: (fileName: string, rejection: Rejection) => void
  limits: ExtractLimits
  /** Which entries of the top-level zip may be activities. Absent when every activity file may. */
  listed: EntryFilter | undefined
}

/** Counters shared by a top-level zip and every zip nested inside it. */
export interface ZipBudget {
  decompressedBytes: number
  bufferedBytes: number
  fitEntries: number
  archiveEntries: number
  /** Bytes the deflated entries the import skips have inflated to, over the whole archive. */
  skippedBytes: number
  /** Compressed bytes read for those entries, as far as they can be told apart from the rest. */
  skippedRead: number
  /** Why skipped entries are no longer inflated, once one budget of theirs has run out. */
  skipStopped: Rejection | null
  /** Why the whole archive stopped at a shared limit. The entry that hit it reports the reason. */
  abort: Rejection | null
}

export function newBudget(): ZipBudget {
  return {
    decompressedBytes: 0,
    bufferedBytes: 0,
    fitEntries: 0,
    archiveEntries: 0,
    skippedBytes: 0,
    skippedRead: 0,
    skipStopped: null,
    abort: null,
  }
}

/** Hands one activity file to the sink, gunzipped and named without its .gz. */
export async function deliver(name: string, bytes: Uint8Array, sink: Sink): Promise<void> {
  const fileName = name.replace(/\.gz$/i, '')
  sink.summary.fitFiles++
  await sink.onFile({ fileName, bytes })
}

/**
 * The work one read of a source leaves to do between pushes: delivering a finished activity file, or
 * closing a zip nested in it. Done in the order it was queued, so a nested zip is closed after its files.
 */
export class ZipRun {
  readonly tasks: Array<() => Promise<void>> = []
  handlerFailed = false
  handlerError: unknown

  readonly sink: Sink
  readonly budget: ZipBudget

  constructor(sink: Sink, budget: ZipBudget) {
    this.sink = sink
    this.budget = budget
  }

  /** Runs the queued work. An error from the handler ends the read and wins over every other outcome. */
  async drain(): Promise<void> {
    for (const task of this.tasks.splice(0)) {
      try {
        await task()
      } catch (error) {
        this.noteHandlerError(error)
        throw error
      }
    }
  }

  noteHandlerError(error: unknown): void {
    this.handlerFailed = true
    this.handlerError = error
  }
}

/**
 * Skips an entry. fflate keeps the compressed input of an entry that is never started, so a skipped
 * entry is started with its output discarded; otherwise a large skipped file (a photo, say) stays in
 * memory. The output of a deflated entry is counted, and the entry is stopped, with nothing more
 * inflated, when
 * - it has inflated past limits.maxSkippedEntryFreeBytes and to more than limits.maxSkippedInflateRatio
 *   times the compressed bytes `source` has streamed since it began, which a real file never does; or
 * - all the skipped entries of the archive have inflated past limits.maxSkippedGlobalFreeBytes and to
 *   more than limits.maxSkippedGlobalRatio times the compressed bytes read for them, which is how many
 *   small bombs add up; or
 * - they have inflated past limits.maxSkippedInflateBytes, whatever the ratio; or
 * - its decoder fails.
 * When the archive's budget runs out, the entry that ran it out is reported once and every skipped
 * entry after it is started and stopped at once, so nothing more is inflated. The entries the import
 * wants are read all the same: skipping costs nothing, and nothing a skipped entry holds is wanted. A
 * stopped entry is not an error of its own: the import never wanted it. A stored entry, and an entry
 * in a method this build cannot read, inflate nothing and are not counted.
 */
export function skipEntry(
  file: UnzipFile,
  run: ZipRun,
  source: StreamTail,
  stop: (rejection: Rejection) => void,
): void {
  const from = source.streamed
  const { limits } = run.sink
  const { budget } = run
  const inflating = file.compression === 8
  let inflated = 0
  let seen = from
  let stopped = false
  const exhaust = (rejection: Rejection): void => {
    budget.skipStopped = rejection
    stop(rejection)
  }
  file.ondata = (error, data) => {
    if (stopped) return
    if (error) {
      stopped = true
    } else if (inflating) {
      inflated += data.length
      budget.skippedBytes += data.length
      budget.skippedRead += source.streamed - seen
      seen = source.streamed
      if (budget.skipStopped !== null || budget.abort !== null) {
        stopped = true
      } else if (budget.skippedBytes > limits.maxSkippedInflateBytes) {
        stopped = true
        exhaust(skippedTooLarge(limits.maxSkippedInflateBytes))
      } else if (
        budget.skippedBytes > limits.maxSkippedGlobalFreeBytes &&
        budget.skippedBytes > limits.maxSkippedGlobalRatio * Math.max(budget.skippedRead, 1)
      ) {
        stopped = true
        exhaust(skippedTooCompressed())
      } else if (
        inflated > limits.maxSkippedEntryFreeBytes &&
        inflated > limits.maxSkippedInflateRatio * Math.max(source.streamed - from, 1)
      ) {
        stopped = true
      }
    }
    if (stopped) file.terminate()
  }
  try {
    file.start()
  } catch {
    // Nothing is retained for an entry that cannot start.
    return
  }
  // The budget ran out before this entry began: it is stopped before it inflates more than its first piece.
  if (budget.skipStopped !== null && inflating) {
    stopped = true
    file.terminate()
  }
}

export interface PendingEntry {
  name: string
  state: 'open' | 'done' | 'failed'
  chunks: Uint8Array[]
  bytes: number
  terminate?: () => void
  /** The zip this entry is, read as its bytes arrive instead of being held whole. */
  child?: ZipReader
}

/** The first four bytes of a stream, to tell an empty zip, grown by the next piece. */
export function withPrefix(
  prefix: Uint8Array<ArrayBuffer>,
  piece: Uint8Array,
): Uint8Array<ArrayBuffer> {
  if (prefix.length >= 4) return prefix
  const take = Math.min(4 - prefix.length, piece.length)
  const grown = new Uint8Array(prefix.length + take)
  grown.set(prefix)
  grown.set(piece.subarray(0, take), prefix.length)
  return grown
}
