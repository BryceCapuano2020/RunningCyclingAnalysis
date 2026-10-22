import { Gunzip, Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'

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
  /** Total bytes emitted by decompressors for FIT entries in one source. */
  maxTotalDecompressedBytes: number
  /** FIT and FIT.GZ entries allowed in one source. */
  maxFitFiles: number
  /** All archive entry headers allowed, including ignored and non-FIT files. */
  maxArchiveEntries: number
  /** Maximum retained output bytes while ZIP entries are being streamed. */
  maxBufferedBytes: number
}

export const DEFAULT_EXTRACT_LIMITS: Readonly<ExtractLimits> = {
  maxSourceBytes: 2 * 1024 ** 3,
  maxEntryBytes: 64 * 1024 ** 2,
  maxTotalDecompressedBytes: 4 * 1024 ** 3,
  maxFitFiles: 10_000,
  maxArchiveEntries: 100_000,
  maxBufferedBytes: 128 * 1024 ** 2,
}

export interface ExtractSummary {
  /** FIT files delivered to onFile. */
  fitFiles: number
  /** GPX and TCX files seen and skipped. */
  otherActivityFiles: number
}

export type FitFileHandler = (file: FitFile) => void | Promise<void>

/** Called with the name of an entry that could not be read, as it appears in the source. */
export type FitErrorHandler = (fileName: string, reason: string) => void

const DECOMPRESS_FAILED = 'Could not decompress this file'
const INCOMPLETE = 'File is incomplete or corrupt'
const READ_FAILED = 'Could not read this file'
const ARCHIVE_FAILED = 'Could not read archive'
const DECOMPRESS_INPUT_CHUNK_BYTES = 16 * 1024

interface PendingEntry {
  name: string
  state: 'open' | 'done' | 'failed'
  chunks: Uint8Array[]
  bytes: number
  terminate?: () => void
}

interface ReadyEntry {
  name: string
  bytes: Uint8Array
}

interface Sink {
  summary: ExtractSummary
  onFile: FitFileHandler
  onError: FitErrorHandler
  limits: ExtractLimits
}

const OTHER_ACTIVITY = /\.(gpx|tcx)(\.gz)?$/i
const FIT = /\.fit(\.gz)?$/i

/**
 * Calls onFile for each FIT file in a source. FIT, gzip and ZIP content is streamed and bounded;
 * completed activities are handed to onFile one at a time. Invalid and over-limit data is
 * reported through onError and skipped. Errors thrown by handlers propagate after stream cleanup.
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
  } else if (FIT.test(name)) {
    await extractSingle(source, sink)
  } else if (/\.zip$/i.test(name)) {
    await streamZip(source, sink)
  } else {
    onError(name, 'Unsupported file format')
  }
  return summary
}

async function extractSingle(source: FitSource, sink: Sink): Promise<void> {
  const isGzip = /\.gz$/i.test(source.name)
  const chunks: Uint8Array[] = []
  let outputBytes = 0
  let failure: string | null = null
  const gunzip = isGzip
    ? new Gunzip((data) => {
        if (data.length > sink.limits.maxTotalDecompressedBytes - outputBytes) {
          failure = `Total decompressed data exceeds the ${sink.limits.maxTotalDecompressedBytes}-byte limit`
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
          failure = `Total decompressed data exceeds the ${sink.limits.maxTotalDecompressedBytes}-byte limit`
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
  if (outputBytes > sink.limits.maxTotalDecompressedBytes) {
    sink.onError(
      source.name,
      `Total decompressed data exceeds the ${sink.limits.maxTotalDecompressedBytes}-byte limit`,
    )
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

async function streamZip(source: FitSource, sink: Sink): Promise<void> {
  const ready: ReadyEntry[] = []
  const started: PendingEntry[] = []
  let decompressedBytes = 0
  let bufferedBytes = 0
  let fitEntryCount = 0
  let archiveEntryCount = 0
  let archivePrefix = new Uint8Array(0)
  let sawEntry = false
  let streamFailure: string | null = null
  let handlerFailed = false
  let handlerError: unknown

  const reportEntryError = (entry: string, reason: string) => {
    try {
      sink.onError(entry, reason)
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
    bufferedBytes -= pending.bytes
    pending.chunks = []
    pending.bytes = 0
    reportEntryError(pending.name, reason)
  }

  const unzip = new Unzip((file) => {
    sawEntry = true
    archiveEntryCount++
    if (archiveEntryCount > sink.limits.maxArchiveEntries) {
      streamFailure = `Archive exceeds the ${sink.limits.maxArchiveEntries}-entry limit`
      throw new Error('archive-entry-limit')
    }
    const entry = file.name
    if (isIgnored(entry)) return
    if (OTHER_ACTIVITY.test(entry)) {
      sink.summary.otherActivityFiles++
      return
    }
    if (!FIT.test(entry)) return
    fitEntryCount++
    if (fitEntryCount > sink.limits.maxFitFiles) {
      reportEntryError(entry, `Archive exceeds the ${sink.limits.maxFitFiles}-FIT-file limit`)
      return
    }
    if (file.originalSize !== undefined && file.originalSize > sink.limits.maxEntryBytes) {
      reportEntryError(entry, `Archive entry exceeds the ${sink.limits.maxEntryBytes}-byte limit`)
      return
    }

    const pending: PendingEntry = { name: entry, state: 'open', chunks: [], bytes: 0 }
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
        if (data.length > sink.limits.maxTotalDecompressedBytes - decompressedBytes) {
          failEntry(
            pending,
            `Total decompressed data exceeds the ${sink.limits.maxTotalDecompressedBytes}-byte limit`,
          )
          return
        }
        if (data.length > sink.limits.maxBufferedBytes - bufferedBytes) {
          failEntry(pending, `Buffered data exceeds the ${sink.limits.maxBufferedBytes}-byte limit`)
          return
        }
        pending.chunks.push(data.slice())
        pending.bytes += data.length
        bufferedBytes += data.length
        decompressedBytes += data.length
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
      if (data.length > sink.limits.maxTotalDecompressedBytes - decompressedBytes) {
        failEntry(
          pending,
          `Total decompressed data exceeds the ${sink.limits.maxTotalDecompressedBytes}-byte limit`,
        )
        return
      }
      decompressedBytes += data.length
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
        if (data.length > sink.limits.maxEntryBytes - pending.bytes) {
          failEntry(pending, `Archive entry exceeds the ${sink.limits.maxEntryBytes}-byte limit`)
          return
        }
        if (data.length > sink.limits.maxBufferedBytes - bufferedBytes) {
          failEntry(pending, `Buffered data exceeds the ${sink.limits.maxBufferedBytes}-byte limit`)
          return
        }
        pending.chunks.push(data.slice())
        pending.bytes += data.length
        bufferedBytes += data.length
      }
      if (final && pending.state === 'open') {
        if (pending.bytes > sink.limits.maxBufferedBytes - bufferedBytes) {
          failEntry(pending, `Buffered data exceeds the ${sink.limits.maxBufferedBytes}-byte limit`)
          return
        }
        bufferedBytes += pending.bytes // Bound the temporary concat copy as well as retained chunks.
        pending.state = 'done'
        ready.push({ name: entry, bytes: concat(pending.chunks, pending.bytes) })
        bufferedBytes -= pending.bytes
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

  try {
    const readFailure = await readSource(source, sink.limits.maxSourceBytes, async (chunk) => {
      if (archivePrefix.length < 4) {
        const take = Math.min(4 - archivePrefix.length, chunk.length)
        const prefix = new Uint8Array(archivePrefix.length + take)
        prefix.set(archivePrefix)
        prefix.set(chunk.subarray(0, take), archivePrefix.length)
        archivePrefix = prefix
      }
      for (let offset = 0; offset < chunk.length; offset += DECOMPRESS_INPUT_CHUNK_BYTES) {
        try {
          unzip.push(chunk.subarray(offset, offset + DECOMPRESS_INPUT_CHUNK_BYTES), false)
        } catch {
          streamFailure ??= ARCHIVE_FAILED
          return false
        }
        for (const entry of ready.splice(0)) {
          bufferedBytes -= entry.bytes.length
          try {
            await deliver(entry.name, entry.bytes, sink)
          } catch (error) {
            handlerFailed = true
            handlerError = error
            throw error
          }
        }
      }
      return true
    })
    if (handlerFailed) throw handlerError
    streamFailure ??= readFailure
    if (readFailure === null) {
      try {
        unzip.push(new Uint8Array(0), true)
      } catch {
        streamFailure = ARCHIVE_FAILED
      }
      for (const entry of ready.splice(0)) {
        bufferedBytes -= entry.bytes.length
        try {
          await deliver(entry.name, entry.bytes, sink)
        } catch (error) {
          handlerFailed = true
          handlerError = error
          throw error
        }
      }
    }
  } catch (error) {
    if (handlerFailed) throw error
    streamFailure = ARCHIVE_FAILED
  }

  for (const pending of started) {
    if (pending.state === 'open') failEntry(pending, INCOMPLETE)
  }
  if (streamFailure !== null) {
    sink.onError(source.name, streamFailure)
  } else if (!sawEntry && !isZipPrefix(archivePrefix)) {
    sink.onError(source.name, ARCHIVE_FAILED)
  }

  for (const entry of ready) await deliver(entry.name, entry.bytes, sink)
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

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function isZipPrefix(prefix: Uint8Array): boolean {
  return (
    prefix.length >= 4 &&
    prefix[0] === 0x50 &&
    prefix[1] === 0x4b &&
    ((prefix[2] === 0x03 && prefix[3] === 0x04) ||
      (prefix[2] === 0x05 && prefix[3] === 0x06) ||
      (prefix[2] === 0x07 && prefix[3] === 0x08))
  )
}

/** Directory entries and macOS resource-fork metadata. */
function isIgnored(name: string): boolean {
  return name.endsWith('/') || /(^|\/)__MACOSX\//.test(name) || /(^|\/)\._/.test(name)
}
