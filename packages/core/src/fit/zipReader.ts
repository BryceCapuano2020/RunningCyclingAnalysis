import { Gunzip, Unzip } from 'fflate'
import type { UnzipFile } from 'fflate'
import { concat } from '../bytes'
import { StreamTail } from './streamTail'
import type { Rejection } from '../import/result'
import { registerDecoders, registerDiscarder } from './unsupportedMethods'
import { checkStream } from './zipCheck'
import {
  DECOMPRESS_INPUT_CHUNK_BYTES,
  deliver,
  MAX_NESTED_ARCHIVE_DEPTH,
  skipEntry,
  withPrefix,
} from './zipRun'
import type { PendingEntry, ZipRun } from './zipRun'
import {
  activityCountTooLarge,
  ARCHIVE_FAILED,
  bufferedTooLarge,
  corrupt,
  decompressedTooLarge,
  DECOMPRESS_FAILED,
  entryCountTooLarge,
  entryTooLarge,
  expandsTooLarge,
  INCOMPLETE,
  TOO_DEEP,
  unreadable,
  UNSUPPORTED_COMPRESSION,
} from './archiveReasons'
import { ACTIVITY, isIgnored, OTHER_ACTIVITY, ZIP } from './zipDirectory'

/**
 * One zip being read as a stream: the top-level source, or a zip inside it, fed by the entry that holds
 * it and never held whole. Activity files are buffered within the budget the whole read shares, and
 * queued on the run when complete.
 */
export class ZipReader {
  private readonly name: string
  private readonly depth: number
  private readonly run: ZipRun
  private readonly owned: boolean
  private readonly unzip: Unzip
  private readonly prefix: string
  /** Entries still being read; one done or failed is let go, with the zip it held. */
  private readonly open = new Set<PendingEntry>()
  private archivePrefix = new Uint8Array(0)
  private sawEntry = false
  private seenEntries = 0
  private streamFailure: Rejection | null = null
  private interruption: Rejection | null = null
  private dead = false
  /** The last bytes streamed, to read the central directory after the last entry. */
  private readonly tail = new StreamTail()

  /**
   * `name` is the zip's name as errors give it: for a nested zip its path in the archive. `owned` is
   * true when the chunks pushed stay as they are, which a source's do and a decompressor's output may not.
   */
  constructor(name: string, depth: number, run: ZipRun, owned: boolean) {
    this.name = name
    this.depth = depth
    this.run = run
    this.owned = owned
    // Entries of a nested zip are named after the zip that holds them, e.g. "rides.zip/a.fit".
    this.prefix = depth === 0 ? '' : `${name}/`
    this.unzip = new Unzip((file) => this.onEntry(file))
    registerDecoders(this.unzip)
  }

  /** Pushes at most DECOMPRESS_INPUT_CHUNK_BYTES. False when the zip cannot be read on. */
  push(piece: Uint8Array): boolean {
    if (this.dead) return false
    this.holdTail(piece)
    this.archivePrefix = withPrefix(this.archivePrefix, piece)
    try {
      this.unzip.push(piece, false)
    } catch {
      this.streamFailure ??= corrupt(ARCHIVE_FAILED)
      this.dead = true
      // Only a nested zip holds a counted copy of its tail, and is told here; a source learns from its read.
      if (!this.owned) {
        this.releaseTail()
        this.interruption = this.streamFailure
      }
      return false
    }
    return true
  }

  /** Ends the stream: the last push, or the reason the source stopped before its end. */
  finishRead(readFailure: Rejection | null): void {
    this.interruption = readFailure
    if (readFailure !== null) {
      if (this.run.budget.abort === null) this.streamFailure ??= readFailure
      return
    }
    this.end()
  }

  /** The last push of a stream that reached its end. */
  end(): void {
    if (this.dead) return
    try {
      this.unzip.push(new Uint8Array(0), true)
    } catch {
      this.streamFailure ??= corrupt(ARCHIVE_FAILED)
    }
  }

  /** Records that reading the source threw. */
  failed(): void {
    this.streamFailure ??= corrupt(ARCHIVE_FAILED)
  }

  /**
   * Entries still open when extraction stops are reported, with the reason it stopped. A zip being read
   * when a shared limit stopped the archive is not: the entry that hit it has reported itself.
   */
  closeOpen(): void {
    const { budget } = this.run
    for (const pending of [...this.open]) {
      if (pending.child !== undefined && budget.abort !== null) this.dropQuietly(pending)
      else this.failEntry(pending, budget.abort ?? this.interruption ?? corrupt(INCOMPLETE))
    }
  }

  /**
   * Reports a stream that failed, or whose entries the central directory lists more of than were read.
   * The zip is finished with after this, and lets go of what it held.
   */
  async verify(): Promise<void> {
    try {
      await checkStream(this.run, {
        name: this.name,
        streamFailure: this.streamFailure,
        interruption: this.interruption,
        sawEntry: this.sawEntry,
        archivePrefix: this.archivePrefix,
        seenEntries: this.seenEntries,
        tail: this.tail,
      })
    } finally {
      this.releaseTail()
      this.open.clear()
    }
  }

  /** Stops reading a zip whose holder failed, and says nothing: the holder has reported itself. */
  private abandon(): void {
    this.dead = true
    for (const pending of [...this.open]) this.dropQuietly(pending)
    this.releaseTail()
  }

  /** Keeps the end of the stream. What a nested zip keeps is a copy, and counts against the buffer. */
  private holdTail(piece: Uint8Array): void {
    const net = this.tail.push(this.owned ? piece : piece.slice())
    if (!this.owned) this.run.budget.bufferedBytes += net
  }

  private releaseTail(): void {
    const held = this.tail.release()
    if (!this.owned) this.run.budget.bufferedBytes -= held
  }

  /** An entry that is no longer being read: its zip, if it was one, is let go with it. */
  private settle(pending: PendingEntry): void {
    this.open.delete(pending)
    pending.child = undefined
  }

  private dropQuietly(pending: PendingEntry): void {
    pending.state = 'failed'
    pending.terminate?.()
    pending.child?.abandon()
    this.settle(pending)
    this.run.budget.bufferedBytes -= pending.bytes
    pending.chunks = []
    pending.bytes = 0
  }

  private reportEntryError(name: string, rejection: Rejection): void {
    try {
      this.run.sink.onError(name, rejection)
    } catch (error) {
      this.run.noteHandlerError(error)
      throw error
    }
  }

  private failEntry(pending: PendingEntry, rejection: Rejection): void {
    if (pending.state !== 'open') return
    this.dropQuietly(pending)
    this.reportEntryError(pending.name, rejection)
  }

  // A shared total limit fails the entry being read and stops the whole archive.
  private expandLimit(pending: PendingEntry): void {
    const rejection = expandsTooLarge(this.run.sink.limits.maxTotalDecompressedBytes)
    this.run.budget.abort ??= rejection
    this.failEntry(pending, rejection)
  }

  /** Skips an entry the import does not read, stopping it if it inflates past its budget. */
  private skip(file: UnzipFile): void {
    registerDiscarder(this.unzip, file.compression)
    skipEntry(file, this.run, this.tail, (rejection) => {
      this.reportEntryError(this.prefix + file.name, rejection)
    })
  }

  private onEntry(file: UnzipFile): void {
    const { sink, budget } = this.run
    const { limits } = sink
    this.sawEntry = true
    this.seenEntries++
    // Once the archive has stopped, its remaining entries are covered by the archive-wide reason.
    if (budget.abort !== null) return this.skip(file)
    budget.archiveEntries++
    const entry = file.name
    const name = this.prefix + entry
    if (budget.archiveEntries > limits.maxArchiveEntries) {
      // The entry is rejected and the archive stops. Later entries in this push return early.
      const rejection = entryCountTooLarge(limits.maxArchiveEntries)
      this.reportEntryError(name, rejection)
      budget.abort ??= rejection
      return this.skip(file)
    }
    if (isIgnored(entry)) return this.skip(file)
    // A file of the zip that its list leaves out is not an activity, in a format the app reads or not.
    const unlisted = this.depth === 0 && sink.listed?.(entry) === false
    if (OTHER_ACTIVITY.test(entry)) {
      sink.summary[unlisted ? 'notActivities' : 'otherActivityFiles']++
      return this.skip(file)
    }
    const nested = ZIP.test(entry)
    if (!nested && !ACTIVITY.test(entry)) return this.skip(file)
    if (unlisted && !nested) {
      sink.summary.notActivities++
      return this.skip(file)
    }
    if (nested && this.depth >= MAX_NESTED_ARCHIVE_DEPTH) {
      this.reportEntryError(name, unreadable(TOO_DEEP))
      return this.skip(file)
    }
    if (!nested) {
      budget.fitEntries++
      if (budget.fitEntries > limits.maxFitFiles) {
        this.reportEntryError(name, activityCountTooLarge(limits.maxFitFiles))
        return this.skip(file)
      }
      // A zip is not held whole, so only an activity file is held to the size of one entry.
      if (file.originalSize !== undefined && file.originalSize > limits.maxEntryBytes) {
        this.reportEntryError(name, entryTooLarge(limits.maxEntryBytes))
        return this.skip(file)
      }
    }

    const pending: PendingEntry = { name, state: 'open', chunks: [], bytes: 0 }
    pending.terminate = () => {
      file.terminate()
    }
    if (nested) pending.child = new ZipReader(name, this.depth + 1, this.run, false)
    this.open.add(pending)
    if (file.compression !== 0 && file.compression !== 8) {
      this.failEntry(pending, unreadable(UNSUPPORTED_COMPRESSION))
      // Started and drained, or fflate holds the compressed input of the entry whole.
      return this.skip(file)
    }
    file.ondata = this.entryReader(pending, /\.gz$/i.test(entry))
    try {
      file.start()
    } catch {
      this.failEntry(pending, unreadable(UNSUPPORTED_COMPRESSION))
    }
  }

  /** The handler of an entry's decompressed bytes: a zip's go on to its reader, a file's are buffered. */
  private entryReader(pending: PendingEntry, isGzip: boolean): UnzipFile['ondata'] {
    const { sink, budget } = this.run
    const { limits } = sink
    let entryBytes = 0
    let gunzip: Gunzip | null = null
    if (isGzip) {
      gunzip = new Gunzip((data) => {
        if (pending.state !== 'open') return
        if (data.length > limits.maxEntryBytes - pending.bytes) {
          this.failEntry(pending, decompressedTooLarge(limits.maxEntryBytes))
          return
        }
        if (data.length > limits.maxTotalDecompressedBytes - budget.decompressedBytes) {
          this.expandLimit(pending)
          return
        }
        if (data.length > limits.maxBufferedBytes - budget.bufferedBytes) {
          this.failEntry(pending, bufferedTooLarge(limits.maxBufferedBytes))
          return
        }
        pending.chunks.push(data.slice())
        pending.bytes += data.length
        budget.bufferedBytes += data.length
        budget.decompressedBytes += data.length
      })
    }

    return (error, data, final) => {
      if (pending.state !== 'open') return
      if (error) {
        this.failEntry(pending, corrupt(DECOMPRESS_FAILED))
        return
      }
      entryBytes += data.length
      if (pending.child === undefined && entryBytes > limits.maxEntryBytes) {
        this.failEntry(pending, entryTooLarge(limits.maxEntryBytes))
        return
      }
      if (data.length > limits.maxTotalDecompressedBytes - budget.decompressedBytes) {
        this.expandLimit(pending)
        return
      }
      budget.decompressedBytes += data.length
      if (pending.child !== undefined) {
        this.passOn(pending, pending.child, data, final)
        return
      }
      if (gunzip !== null) {
        try {
          // ZIP Inflate can emit a much larger callback chunk than the 16 KiB source slice, so re-slice
          // it: both decompressor layers then have the same bounded input quantum.
          if (data.length === 0) gunzip.push(data, final)
          else {
            for (let offset = 0; offset < data.length; offset += DECOMPRESS_INPUT_CHUNK_BYTES) {
              const end = Math.min(offset + DECOMPRESS_INPUT_CHUNK_BYTES, data.length)
              gunzip.push(data.subarray(offset, end), final && end === data.length)
            }
          }
        } catch {
          this.failEntry(pending, corrupt(DECOMPRESS_FAILED))
          return
        }
      } else {
        if (data.length > limits.maxBufferedBytes - budget.bufferedBytes) {
          this.failEntry(pending, bufferedTooLarge(limits.maxBufferedBytes))
          return
        }
        pending.chunks.push(data.slice())
        pending.bytes += data.length
        budget.bufferedBytes += data.length
      }
      if (final && pending.state === 'open') this.complete(pending)
    }
  }

  /** An activity file is whole: it is counted as held, and queued for the sink. */
  private complete(pending: PendingEntry): void {
    const { budget } = this.run
    // The concatenated copy is made while the chunks are still held, so both must fit.
    if (pending.bytes > this.run.sink.limits.maxBufferedBytes - budget.bufferedBytes) {
      this.failEntry(pending, bufferedTooLarge(this.run.sink.limits.maxBufferedBytes))
      return
    }
    budget.bufferedBytes += pending.bytes // Bound the temporary concat copy as well as retained chunks.
    pending.state = 'done'
    this.settle(pending)
    const bytes = concat(pending.chunks, pending.bytes)
    budget.bufferedBytes -= pending.bytes
    pending.chunks = []
    this.run.tasks.push(async () => {
      budget.bufferedBytes -= bytes.length
      await deliver(pending.name, bytes, this.run.sink)
    })
  }

  /** Feeds a nested zip the bytes of the entry that holds it, and closes it, after its files, at the entry's end. */
  private passOn(pending: PendingEntry, child: ZipReader, data: Uint8Array, final: boolean): void {
    const { budget, sink } = this.run
    const { maxBufferedBytes } = sink.limits
    for (let offset = 0; offset < data.length; offset += DECOMPRESS_INPUT_CHUNK_BYTES) {
      if (budget.abort !== null) break
      const piece = data.subarray(offset, offset + DECOMPRESS_INPUT_CHUNK_BYTES)
      // The zip keeps the end of what it is given, which the buffer must have room for.
      if (piece.length > maxBufferedBytes - budget.bufferedBytes) {
        this.failEntry(pending, bufferedTooLarge(maxBufferedBytes))
        return
      }
      if (!child.push(piece)) break
    }
    if (!final || pending.state !== 'open') return
    pending.state = 'done'
    this.settle(pending)
    // Once the archive has stopped, a zip inside it is not read on: the abort reason covers it.
    if (budget.abort === null) child.end()
    this.run.tasks.push(async () => {
      child.closeOpen()
      await child.verify()
    })
  }
}
