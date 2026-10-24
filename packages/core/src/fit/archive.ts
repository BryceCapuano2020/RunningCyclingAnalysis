import { Gunzip, Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'
import type { UnzipFile } from 'fflate'
import { concat } from '../bytes'
import {
  ACTIVITY,
  DIRECTORY_TAIL_BYTES,
  isIgnored,
  listedEntries,
  OTHER_ACTIVITY,
  ZIP,
} from './zipDirectory'

export interface FitFile {
  fileName: string
  bytes: Uint8Array
}

/** A browser File satisfies this. `size` is an optional early check; streamed bytes are always counted. */
export interface FitSource {
  name: string
  size?: number
  stream(): ReadableStream<Uint8Array>
  arrayBuffer(): Promise<ArrayBuffer>
}

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

const GIB = 1024 ** 3
const MIB = 1024 ** 2

export const DEFAULT_EXTRACT_LIMITS: Readonly<ExtractLimits> = {
  maxSourceBytes: 2 * GIB,
  maxEntryBytes: 64 * MIB,
  maxTotalDecompressedBytes: 2 * GIB,
  maxFitFiles: 10_000,
  maxArchiveEntries: 100_000,
  maxBufferedBytes: 128 * MIB,
}

export interface ExtractSummary {
  /** Activity files (FIT, GPX or TCX) delivered to onFile. */
  fitFiles: number
  /** Activity files in formats this app does not read, seen and skipped. */
  otherActivityFiles: number
}

export type FitFileHandler = (file: FitFile) => void | Promise<void>

/** Called with the name of an entry that could not be read, as it appears in the source. */
export type FitErrorHandler = (fileName: string, reason: string) => void

const DECOMPRESS_FAILED = 'Could not decompress this file'
const INCOMPLETE = 'File is incomplete or corrupt'
const READ_FAILED = 'Could not read this file'
const ARCHIVE_FAILED = 'Could not read archive'
const TOO_DEEP = 'Nested archives are too deep'
/** Compressed input is fed to the decompressors this many bytes at a time, so their output stays bounded. */
export const DECOMPRESS_INPUT_CHUNK_BYTES = 16 * 1024
/** A zip may hold zips this many levels down. A zip inside the deepest level is rejected. */
const MAX_NESTED_ARCHIVE_DEPTH = 2
const DAMAGED_DIRECTORY = 'Archive is damaged; some activities may be missing'

interface PendingEntry {
  name: string
  state: 'open' | 'done' | 'failed'
  chunks: Uint8Array[]
  bytes: number
  terminate?: () => void
}

interface ReadyEntry {
  name: string
  bytes: Uint8Array<ArrayBuffer>
  /** A zip to extract, rather than an activity file to deliver. */
  nested: boolean
}

interface Sink {
  summary: ExtractSummary
  onFile: FitFileHandler
  onError: FitErrorHandler
  limits: ExtractLimits
}

/** Counters shared by a top-level zip and every zip nested inside it. */
interface ZipBudget {
  decompressedBytes: number
  bufferedBytes: number
  fitEntries: number
  archiveEntries: number
  /** Why the whole archive stopped at a shared limit. The entry that hit it reports the reason. */
  abort: string | null
}

/**
 * Calls onFile for each FIT, GPX or TCX file in a source, gunzipped and named without its .gz.
 * Content is streamed and bounded; completed files are handed to onFile one at a time. Zips nested
 * up to two levels deep are read too. Invalid and over-limit data is reported through onError and
 * skipped. Errors thrown by handlers propagate after stream cleanup.
 */
export async function extractFitFiles(
  source: FitSource,
  onFile: FitFileHandler,
  onError: FitErrorHandler = () => undefined,
  limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS,
): Promise<ExtractSummary> {
  const summary: ExtractSummary = { fitFiles: 0, otherActivityFiles: 0 }
  const sink: Sink = { summary, onFile, onError, limits }
  const name = source.name
  if (source.size !== undefined && source.size > limits.maxSourceBytes) {
    onError(name, `Source exceeds the ${limits.maxSourceBytes}-byte limit`)
    return summary
  }
  if (OTHER_ACTIVITY.test(name)) {
    summary.otherActivityFiles = 1
  } else if (ACTIVITY.test(name)) {
    await extractSingle(source, sink)
  } else if (ZIP.test(name)) {
    await streamZip(source, sink, 0, {
      decompressedBytes: 0,
      bufferedBytes: 0,
      fitEntries: 0,
      archiveEntries: 0,
      abort: null,
    })
  } else {
    onError(name, 'Unsupported file format')
  }
  return summary
}

/** The reason reported when a total size limit is reached, e.g. "Archive expands to more than 2 GB". */
export function expandsReason(limit: number): string {
  return `Archive expands to more than ${limitText(limit)}`
}

function limitText(bytes: number): string {
  if (bytes % GIB === 0) return `${bytes / GIB} GB`
  if (bytes % MIB === 0) return `${bytes / MIB} MB`
  return `${bytes} bytes`
}

async function extractSingle(source: FitSource, sink: Sink): Promise<void> {
  const isGzip = /\.gz$/i.test(source.name)
  const chunks: Uint8Array[] = []
  let outputBytes = 0
  let failure: string | null = null
  const gunzip = isGzip
    ? new Gunzip((data) => {
        if (data.length > sink.limits.maxTotalDecompressedBytes - outputBytes) {
          failure = expandsReason(sink.limits.maxTotalDecompressedBytes)
          return
        }
        if (!appendChunk(chunks, data, outputBytes, sink.limits.maxEntryBytes)) {
          failure = `Decompressed file exceeds the ${sink.limits.maxEntryBytes}-byte limit`
          return
        }
        outputBytes += data.length
      })
    : null

  try {
    const readFailure = await readSource(source, sink.limits.maxSourceBytes, (chunk) => {
      if (isGzip) {
        try {
          for (let offset = 0; offset < chunk.length; offset += DECOMPRESS_INPUT_CHUNK_BYTES) {
            gunzip!.push(chunk.subarray(offset, offset + DECOMPRESS_INPUT_CHUNK_BYTES))
            if (failure !== null) return false
          }
        } catch {
          failure = DECOMPRESS_FAILED
          return false
        }
      } else {
        if (chunk.length > sink.limits.maxTotalDecompressedBytes - outputBytes) {
          failure = expandsReason(sink.limits.maxTotalDecompressedBytes)
          return false
        }
        if (!appendChunk(chunks, chunk, outputBytes, sink.limits.maxEntryBytes)) {
          failure = `File exceeds the ${sink.limits.maxEntryBytes}-byte limit`
          return false
        }
        outputBytes += chunk.length
      }
      return failure === null
    })
    if (isGzip && readFailure === null && failure === null) {
      try {
        gunzip!.push(new Uint8Array(0), true)
      } catch {
        failure = DECOMPRESS_FAILED
      }
    }
    failure ??= readFailure
  } catch {
    failure = READ_FAILED
  }
  if (failure !== null) {
    sink.onError(source.name, failure)
    return
  }
  if (outputBytes > sink.limits.maxBufferedBytes - outputBytes) {
    sink.onError(
      source.name,
      `Buffered data exceeds the ${sink.limits.maxBufferedBytes}-byte limit`,
    )
    return
  }
  const bytes = concat(chunks, outputBytes)
  const fileName = isGzip ? source.name.slice(0, -'.gz'.length) : source.name
  await deliver(fileName, bytes, sink)
}

async function streamZip(
  source: FitSource,
  sink: Sink,
  depth: number,
  budget: ZipBudget,
): Promise<void> {
  // Entries of a nested zip are named after the zip that holds them, e.g. "rides.zip/a.fit".
  const prefix = depth === 0 ? '' : `${source.name}/`
  const ready: ReadyEntry[] = []
  const started: PendingEntry[] = []
  let archivePrefix = new Uint8Array(0)
  let sawEntry = false
  let streamFailure: string | null = null
  let interruption: string | null = null
  let handlerFailed = false
  let handlerError: unknown
  let seenEntries = 0
  // The last bytes streamed, to read the central directory after the last entry.
  const tailChunks: Uint8Array[] = []
  let tailLength = 0
  let streamedBytes = 0

  const reportEntryError = (name: string, reason: string) => {
    try {
      sink.onError(name, reason)
    } catch (error) {
      handlerFailed = true
      handlerError = error
      throw error
    }
  }

  const failEntry = (pending: PendingEntry, reason: string) => {
    if (pending.state !== 'open') return
    pending.state = 'failed'
    pending.terminate?.()
    budget.bufferedBytes -= pending.bytes
    pending.chunks = []
    pending.bytes = 0
    reportEntryError(pending.name, reason)
  }

  // A shared total limit fails the entry being read and stops the whole archive.
  const expandLimit = (pending: PendingEntry) => {
    const reason = expandsReason(sink.limits.maxTotalDecompressedBytes)
    budget.abort ??= reason
    failEntry(pending, reason)
  }

  // fflate keeps the compressed input of an entry that is never started, so a skipped entry is
  // started with its output discarded. Otherwise a large skipped file (a photo, say) stays in memory.
  const drain = (file: UnzipFile) => {
    file.ondata = () => undefined
    try {
      file.start()
    } catch {
      // Nothing is retained for an entry that cannot start.
    }
  }

  const unzip = new Unzip((file) => {
    sawEntry = true
    seenEntries++
    // Once the archive has stopped, its remaining entries are covered by the archive-wide reason.
    if (budget.abort !== null) return drain(file)
    budget.archiveEntries++
    const entry = file.name
    const name = prefix + entry
    if (budget.archiveEntries > sink.limits.maxArchiveEntries) {
      // The entry is rejected and the archive stops. Later entries in this push return early.
      const reason = `Archive exceeds the ${sink.limits.maxArchiveEntries}-entry limit`
      reportEntryError(name, reason)
      budget.abort ??= reason
      return drain(file)
    }
    if (isIgnored(entry)) return drain(file)
    if (OTHER_ACTIVITY.test(entry)) {
      sink.summary.otherActivityFiles++
      return drain(file)
    }
    const nested = ZIP.test(entry)
    if (!nested && !ACTIVITY.test(entry)) return drain(file)
    if (nested && depth >= MAX_NESTED_ARCHIVE_DEPTH) {
      reportEntryError(name, TOO_DEEP)
      return drain(file)
    }
    if (!nested) {
      budget.fitEntries++
      if (budget.fitEntries > sink.limits.maxFitFiles) {
        reportEntryError(name, `Archive exceeds the ${sink.limits.maxFitFiles}-activity-file limit`)
        return drain(file)
      }
    }
    if (file.originalSize !== undefined && file.originalSize > sink.limits.maxEntryBytes) {
      reportEntryError(name, `Archive entry exceeds the ${sink.limits.maxEntryBytes}-byte limit`)
      return drain(file)
    }

    const pending: PendingEntry = { name, state: 'open', chunks: [], bytes: 0 }
    pending.terminate = () => {
      file.terminate()
    }
    started.push(pending)
    if (file.compression !== 0 && file.compression !== 8) {
      failEntry(pending, 'Unsupported compression method')
      return
    }
    const isGzip = /\.gz$/i.test(entry)
    let entryBytes = 0
    let gunzip: Gunzip | null = null
    if (isGzip) {
      gunzip = new Gunzip((data) => {
        if (pending.state !== 'open') return
        if (data.length > sink.limits.maxEntryBytes - pending.bytes) {
          failEntry(
            pending,
            `Decompressed file exceeds the ${sink.limits.maxEntryBytes}-byte limit`,
          )
          return
        }
        if (data.length > sink.limits.maxTotalDecompressedBytes - budget.decompressedBytes) {
          expandLimit(pending)
          return
        }
        if (data.length > sink.limits.maxBufferedBytes - budget.bufferedBytes) {
          failEntry(pending, `Buffered data exceeds the ${sink.limits.maxBufferedBytes}-byte limit`)
          return
        }
        pending.chunks.push(data.slice())
        pending.bytes += data.length
        budget.bufferedBytes += data.length
        budget.decompressedBytes += data.length
      })
    }

    file.ondata = (error, data, final) => {
      if (pending.state !== 'open') return
      if (error) {
        failEntry(pending, DECOMPRESS_FAILED)
        return
      }
      entryBytes += data.length
      if (entryBytes > sink.limits.maxEntryBytes) {
        failEntry(pending, `Archive entry exceeds the ${sink.limits.maxEntryBytes}-byte limit`)
        return
      }
      if (data.length > sink.limits.maxTotalDecompressedBytes - budget.decompressedBytes) {
        expandLimit(pending)
        return
      }
      budget.decompressedBytes += data.length
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
          failEntry(pending, DECOMPRESS_FAILED)
          return
        }
      } else {
        if (data.length > sink.limits.maxBufferedBytes - budget.bufferedBytes) {
          failEntry(pending, `Buffered data exceeds the ${sink.limits.maxBufferedBytes}-byte limit`)
          return
        }
        pending.chunks.push(data.slice())
        pending.bytes += data.length
        budget.bufferedBytes += data.length
      }
      if (final && pending.state === 'open') {
        // The concatenated copy is made while the chunks are still held, so both must fit.
        if (pending.bytes > sink.limits.maxBufferedBytes - budget.bufferedBytes) {
          failEntry(pending, `Buffered data exceeds the ${sink.limits.maxBufferedBytes}-byte limit`)
          return
        }
        budget.bufferedBytes += pending.bytes // Bound the temporary concat copy as well as retained chunks.
        pending.state = 'done'
        ready.push({ name, bytes: concat(pending.chunks, pending.bytes), nested })
        budget.bufferedBytes -= pending.bytes
        pending.chunks = []
      }
    }
    try {
      file.start()
    } catch {
      failEntry(pending, 'Unsupported compression method')
    }
  })
  unzip.register(UnzipPassThrough)
  unzip.register(UnzipInflate)

  // Completed entries leave the buffer here: activity files go to onFile, nested zips are read in turn.
  const dispatch = async (entry: ReadyEntry): Promise<void> => {
    try {
      if (entry.nested) {
        try {
          await streamZip(bytesSource(entry.name, entry.bytes), sink, depth + 1, budget)
        } finally {
          budget.bufferedBytes -= entry.bytes.length
        }
      } else {
        budget.bufferedBytes -= entry.bytes.length
        await deliver(entry.name, entry.bytes, sink)
      }
    } catch (error) {
      handlerFailed = true
      handlerError = error
      throw error
    }
  }
  // Once the archive has stopped, a zip inside it is not read: the abort reason covers it.
  const dispatchReady = async () => {
    for (const entry of ready.splice(0)) {
      if (budget.abort === null || !entry.nested) await dispatch(entry)
    }
  }

  try {
    const readFailure = await readSource(source, sink.limits.maxSourceBytes, async (chunk) => {
      streamedBytes += chunk.length
      keepTail(chunk)
      if (archivePrefix.length < 4) {
        const take = Math.min(4 - archivePrefix.length, chunk.length)
        const grown = new Uint8Array(archivePrefix.length + take)
        grown.set(archivePrefix)
        grown.set(chunk.subarray(0, take), archivePrefix.length)
        archivePrefix = grown
      }
      for (let offset = 0; offset < chunk.length; offset += DECOMPRESS_INPUT_CHUNK_BYTES) {
        if (budget.abort !== null) return false
        try {
          unzip.push(chunk.subarray(offset, offset + DECOMPRESS_INPUT_CHUNK_BYTES), false)
        } catch {
          streamFailure ??= ARCHIVE_FAILED
          return false
        }
        await dispatchReady()
      }
      return budget.abort === null
    })
    interruption = readFailure
    if (readFailure !== null) {
      if (budget.abort === null) streamFailure ??= readFailure
    } else {
      try {
        unzip.push(new Uint8Array(0), true)
      } catch {
        streamFailure ??= ARCHIVE_FAILED
      }
    }
  } catch {
    streamFailure ??= ARCHIVE_FAILED
  }
  // A handler error may have been swallowed by the unzip callbacks; it always wins.
  if (handlerFailed) throw handlerError

  // Entries still open when extraction stops are reported, with the reason it stopped.
  for (const pending of started) {
    if (pending.state === 'open') failEntry(pending, budget.abort ?? interruption ?? INCOMPLETE)
  }
  await dispatchReady()
  if (streamFailure !== null) {
    sink.onError(source.name, streamFailure)
  } else if (!sawEntry && !isEmptyZip(archivePrefix)) {
    sink.onError(source.name, ARCHIVE_FAILED)
  }
  // A corrupt local header ends fflate's scan silently, so compare with the central directory.
  if (budget.abort === null && interruption === null && (sawEntry || isEmptyZip(archivePrefix))) {
    const tail = tailBytes()
    const listed = await listedEntries(tail, streamedBytes - tail.length)
    if (listed === null) {
      sink.onError(source.name, DAMAGED_DIRECTORY)
    } else if (listed > seenEntries) {
      sink.onError(
        source.name,
        `${listed - seenEntries} entries could not be read because the archive is damaged`,
      )
    }
  }

  function keepTail(chunk: Uint8Array): void {
    tailChunks.push(chunk)
    tailLength += chunk.length
    while (tailChunks.length > 1) {
      const oldest = tailChunks[0]
      if (oldest === undefined || tailLength - oldest.length < DIRECTORY_TAIL_BYTES) break
      tailChunks.shift()
      tailLength -= oldest.length
    }
  }

  function tailBytes(): Uint8Array {
    const all = concat(tailChunks, tailLength)
    return all.subarray(Math.max(0, all.length - DIRECTORY_TAIL_BYTES))
  }
}

async function deliver(name: string, bytes: Uint8Array, sink: Sink): Promise<void> {
  const fileName = name.replace(/\.gz$/i, '')
  sink.summary.fitFiles++
  await sink.onFile({ fileName, bytes })
}

function appendChunk(
  chunks: Uint8Array[],
  chunk: Uint8Array,
  existingBytes: number,
  limit: number,
): boolean {
  if (chunk.length > limit - existingBytes) return false
  chunks.push(chunk.slice())
  return true
}

async function readSource(
  source: FitSource,
  maxBytes: number,
  onChunk: (chunk: Uint8Array) => boolean | Promise<boolean>,
): Promise<string | null> {
  let reader: ReadableStreamDefaultReader<Uint8Array>
  try {
    reader = source.stream().getReader()
  } catch {
    return READ_FAILED
  }
  let total = 0
  let complete = false
  let failure: string | null = null
  let callbackError: unknown
  try {
    while (true) {
      let step: ReadableStreamReadResult<Uint8Array>
      try {
        step = await reader.read()
      } catch {
        failure = READ_FAILED
        break
      }
      if (step.done) {
        complete = true
        break
      }
      if (step.value.length > maxBytes - total) {
        failure = `Source exceeds the ${maxBytes}-byte limit`
        break
      }
      total += step.value.length
      let accepted: boolean
      try {
        accepted = await onChunk(step.value)
      } catch (error) {
        callbackError = error
        break
      }
      if (!accepted) {
        failure = `File exceeds the ${maxBytes}-byte limit`
        break
      }
    }
  } finally {
    if (!complete) {
      try {
        await reader.cancel(failure ?? 'Extraction stopped')
      } catch {
        // Releasing the lock is still required if cancellation is rejected by the source.
      }
    }
    reader.releaseLock()
  }
  if (callbackError !== undefined) throw callbackError
  return failure
}

/** A source over bytes already in memory, such as a zip nested in another zip. */
function bytesSource(name: string, bytes: Uint8Array<ArrayBuffer>): FitSource {
  return {
    name,
    stream: () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes)
          controller.close()
        },
      }),
    arrayBuffer: async () => bytes.slice().buffer,
  }
}

/** A zip with no entries starts with its end-of-central-directory record. */
const EMPTY_ZIP_SIGNATURE = [0x50, 0x4b, 0x05, 0x06]
function isEmptyZip(prefix: Uint8Array): boolean {
  return prefix.length === 4 && EMPTY_ZIP_SIGNATURE.every((byte, i) => prefix[i] === byte)
}
