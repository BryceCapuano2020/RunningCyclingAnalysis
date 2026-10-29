import type { UnzipFile } from 'fflate'
import type { Rejection } from '../import/result'
import type { ExtractLimits } from './extractLimits'
import type { ZipReader } from './zipReader'
import type { EntryFilter } from './zipDirectory'

/** Compressed input is fed to the decompressors this many bytes at a time, so their output stays bounded. */
export const DECOMPRESS_INPUT_CHUNK_BYTES = 16 * 1024
/** A zip may hold zips this many levels down. A zip inside the deepest level is rejected. */
export const MAX_NESTED_ARCHIVE_DEPTH = 2

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
  /** Why the whole archive stopped at a shared limit. The entry that hit it reports the reason. */
  abort: Rejection | null
}

export function newBudget(): ZipBudget {
  return { decompressedBytes: 0, bufferedBytes: 0, fitEntries: 0, archiveEntries: 0, abort: null }
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

// fflate keeps the compressed input of an entry that is never started, so a skipped entry is
// started with its output discarded. Otherwise a large skipped file (a photo, say) stays in memory.
export function discard(file: UnzipFile): void {
  file.ondata = () => undefined
  try {
    file.start()
  } catch {
    // Nothing is retained for an entry that cannot start.
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
