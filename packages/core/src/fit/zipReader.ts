import { Gunzip, Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'
import type { UnzipFile } from 'fflate'
import { concat } from '../bytes'
import { StreamTail } from './streamTail'
import type { Rejection } from '../import/result'
import { DECOMPRESS_INPUT_CHUNK_BYTES, deliver, MAX_NESTED_ARCHIVE_DEPTH } from './zipRun'
import type { ZipRun } from './zipRun'
import {
  activityCountTooLarge,
  ARCHIVE_FAILED,
  bufferedTooLarge,
  corrupt,
  DAMAGED_DIRECTORY,
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
import { ACTIVITY, isEmptyZip, isIgnored, listedEntries, OTHER_ACTIVITY, ZIP } from './zipDirectory'

interface PendingEntry {
  name: string
  state: 'open' | 'done' | 'failed'
  chunks: Uint8Array[]
  bytes: number
  terminate?: () => void
  /** The zip this entry is, read as its bytes arrive instead of being held whole. */
  child?: ZipReader
}

/**
 * One zip being read as a stream: the top-level source, or a zip inside it, whose bytes come from the
 * entry that holds it and are never held whole. Activity files are buffered one at a time, within the
 * budget the whole read shares, and handed to the run's queue when they are complete.
 */
export class ZipReader {
  private readonly name: string
  private readonly depth: number
  private readonly run: ZipRun
  private readonly owned: boolean
  private readonly unzip: Unzip
  private readonly prefix: string
  private readonly started: PendingEntry[] = []
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
    this.unzip.register(UnzipPassThrough)
    this.unzip.register(UnzipInflate)
  }

  /** Pushes at most DECOMPRESS_INPUT_CHUNK_BYTES. False when the zip cannot be read on. */
  push(piece: Uint8Array): boolean {
    if (this.dead) return false
    this.tail.push(this.owned ? piece : piece.slice())
    if (this.archivePrefix.length < 4) {
      const take = Math.min(4 - this.archivePrefix.length, piece.length)
      const grown = new Uint8Array(this.archivePrefix.length + take)
      grown.set(this.archivePrefix)
      grown.set(piece.subarray(0, take), this.archivePrefix.length)
      this.archivePrefix = grown
    }
    try {
      this.unzip.push(piece, false)
    } catch {
      this.streamFailure ??= corrupt(ARCHIVE_FAILED)
      this.dead = true
      // The top-level source learns it from the refusal its read callback gives; a nested zip is told here.
      if (!this.owned) this.interruption = this.streamFailure
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
   * Entries still open when extraction stops are reported, with the reason it stopped. A zip that was
   * being read when a shared limit stopped the archive is not: the entry in it that hit the limit has
   * reported itself, and the abort reason covers the rest.
   */
  closeOpen(): void {
    const { budget } = this.run
    for (const pending of this.started) {
      if (pending.state !== 'open') continue
      if (pending.child !== undefined && budget.abort !== null) this.dropQuietly(pending)
      else this.failEntry(pending, budget.abort ?? this.interruption ?? corrupt(INCOMPLETE))
    }
  }

  /** Reports a stream that failed, or whose entries the central directory lists more of than were read. */
  async verify(): Promise<void> {
    const { sink, budget } = this.run
    if (this.streamFailure !== null) {
      sink.onError(this.name, this.streamFailure)
    } else if (!this.sawEntry && !isEmptyZip(this.archivePrefix)) {
      sink.onError(this.name, corrupt(ARCHIVE_FAILED))
    }
    // A corrupt local header ends fflate's scan silently, so compare with the central directory.
    if (
      budget.abort === null &&
      this.interruption === null &&
      (this.sawEntry || isEmptyZip(this.archivePrefix))
    ) {
      const tail = this.tail.bytes()
      const listed = await listedEntries(tail, this.tail.streamed - tail.length)
      if (listed === null) {
        sink.onError(this.name, corrupt(DAMAGED_DIRECTORY))
      } else if (listed > this.seenEntries) {
        const lost = listed - this.seenEntries
        sink.onError(
          this.name,
          corrupt(`${lost} entries could not be read because the archive is damaged`, lost),
        )
      }
    }
  }

  /** Stops reading a zip whose holder failed, and says nothing: the holder has reported itself. */
  private abandon(): void {
    this.dead = true
    for (const pending of this.started) if (pending.state === 'open') this.dropQuietly(pending)
  }

  private dropQuietly(pending: PendingEntry): void {
    pending.state = 'failed'
    pending.terminate?.()
    pending.child?.abandon()
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
    pending.state = 'failed'
    pending.terminate?.()
    pending.child?.abandon()
    this.run.budget.bufferedBytes -= pending.bytes
    pending.chunks = []
    pending.bytes = 0
    this.reportEntryError(pending.name, rejection)
  }

  // A shared total limit fails the entry being read and stops the whole archive.
  private expandLimit(pending: PendingEntry): void {
    const rejection = expandsTooLarge(this.run.sink.limits.maxTotalDecompressedBytes)
    this.run.budget.abort ??= rejection
    this.failEntry(pending, rejection)
  }

  // fflate keeps the compressed input of an entry that is never started, so a skipped entry is
  // started with its output discarded. Otherwise a large skipped file (a photo, say) stays in memory.
  private discard(file: UnzipFile): void {
    file.ondata = () => undefined
    try {
      file.start()
    } catch {
      // Nothing is retained for an entry that cannot start.
    }
  }

  private onEntry(file: UnzipFile): void {
    const { sink, budget } = this.run
    const { limits } = sink
    this.sawEntry = true
    this.seenEntries++
    // Once the archive has stopped, its remaining entries are covered by the archive-wide reason.
    if (budget.abort !== null) return this.discard(file)
    budget.archiveEntries++
    const entry = file.name
    const name = this.prefix + entry
    if (budget.archiveEntries > limits.maxArchiveEntries) {
      // The entry is rejected and the archive stops. Later entries in this push return early.
      const rejection = entryCountTooLarge(limits.maxArchiveEntries)
      this.reportEntryError(name, rejection)
      budget.abort ??= rejection
      return this.discard(file)
    }
    if (isIgnored(entry)) return this.discard(file)
    // A file of the zip that its list leaves out is not an activity, in a format the app reads or not.
    const unlisted = this.depth === 0 && sink.listed?.(entry) === false
    if (OTHER_ACTIVITY.test(entry)) {
      sink.summary[unlisted ? 'notActivities' : 'otherActivityFiles']++
      return this.discard(file)
    }
    const nested = ZIP.test(entry)
    if (!nested && !ACTIVITY.test(entry)) return this.discard(file)
    if (unlisted && !nested) {
      sink.summary.notActivities++
      return this.discard(file)
    }
    if (nested && this.depth >= MAX_NESTED_ARCHIVE_DEPTH) {
      this.reportEntryError(name, unreadable(TOO_DEEP))
      return this.discard(file)
    }
    if (!nested) {
      budget.fitEntries++
      if (budget.fitEntries > limits.maxFitFiles) {
        this.reportEntryError(name, activityCountTooLarge(limits.maxFitFiles))
        return this.discard(file)
      }
      // A zip is not held whole, so only an activity file is held to the size of one entry.
      if (file.originalSize !== undefined && file.originalSize > limits.maxEntryBytes) {
        this.reportEntryError(name, entryTooLarge(limits.maxEntryBytes))
        return this.discard(file)
      }
    }

    const pending: PendingEntry = { name, state: 'open', chunks: [], bytes: 0 }
    pending.terminate = () => {
      file.terminate()
    }
    if (nested) pending.child = new ZipReader(name, this.depth + 1, this.run, false)
    this.started.push(pending)
    if (file.compression !== 0 && file.compression !== 8) {
      this.failEntry(pending, unreadable(UNSUPPORTED_COMPRESSION))
      return
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
          // ZIP Inflate can emit a much larger callback chunk than the 16 KiB source slice.
          // Re-slice before feeding the nested gzip decoder so both decompressor layers have
          // the same bounded input quantum.
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
    const { budget } = this.run
    for (let offset = 0; offset < data.length; offset += DECOMPRESS_INPUT_CHUNK_BYTES) {
      if (
        budget.abort !== null ||
        !child.push(data.subarray(offset, offset + DECOMPRESS_INPUT_CHUNK_BYTES))
      ) {
        break
      }
    }
    if (!final || pending.state !== 'open') return
    pending.state = 'done'
    // Once the archive has stopped, a zip inside it is not read on: the abort reason covers it.
    if (budget.abort === null) child.end()
    this.run.tasks.push(async () => {
      child.closeOpen()
      await child.verify()
    })
  }
}
