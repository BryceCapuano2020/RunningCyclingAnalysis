import { Gunzip } from 'fflate'
import { concat } from '../bytes'
import type { Rejection } from '../import/result'
export { DEFAULT_EXTRACT_LIMITS } from './extractLimits'
export type { ExtractLimits } from './extractLimits'
import { DEFAULT_EXTRACT_LIMITS } from './extractLimits'
import type { ExtractLimits } from './extractLimits'
import {
  bufferedTooLarge,
  corrupt,
  DECOMPRESS_FAILED,
  decompressedTooLarge,
  expandsTooLarge,
  fileTooLarge,
  notActivity,
  READ_FAILED,
  sourceTooLarge,
  UNSUPPORTED_FORMAT,
} from './archiveReasons'
import { readSource } from './archiveSource'
import { ACTIVITY, OTHER_ACTIVITY, otherExtensionOf, ZIP } from './zipDirectory'
import type { EntryFilter } from './zipDirectory'
import { ZipReader } from './zipReader'
import { DECOMPRESS_INPUT_CHUNK_BYTES, deliver, newBudget, ZipRun } from './zipRun'
import type { Sink, ZipBudget } from './zipRun'
export { DECOMPRESS_INPUT_CHUNK_BYTES } from './zipRun'

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

export interface ExtractSummary {
  /** Activity files (FIT, GPX or TCX) delivered to onFile. */
  fitFiles: number
  /** Activity files in formats this app does not read, seen and skipped. */
  otherActivityFiles: number
  /** Activity files in the zip that its list does not name, such as saved routes, seen and left unread. */
  notActivities: number
}

export type FitFileHandler = (file: FitFile) => void | Promise<void>

/** Called with the name of an entry that could not be read, as it appears in the source. */
export type FitErrorHandler = (fileName: string, rejection: Rejection) => void

/**
 * Calls onFile for each FIT, GPX or TCX file in a source, gunzipped and named without its .gz.
 * Content is streamed and bounded; completed files are handed to onFile one at a time. Zips nested
 * up to two levels deep are read too. Invalid and over-limit data is reported through onError and
 * skipped. Errors thrown by handlers propagate after stream cleanup. `listed` is for a zip whose own
 * list names its activities: an activity file of the zip itself that it refuses is counted as not
 * an activity, and is neither read nor counted against the file limit.
 */
export async function extractFitFiles(
  source: FitSource,
  onFile: FitFileHandler,
  onError: FitErrorHandler = () => undefined,
  limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS,
  listed?: EntryFilter,
  skipped?: (extension: string) => void,
): Promise<ExtractSummary> {
  const summary: ExtractSummary = { fitFiles: 0, otherActivityFiles: 0, notActivities: 0 }
  const sink: Sink = { summary, onFile, onError, limits, listed, skipped }
  const name = source.name
  if (source.size !== undefined && source.size > limits.maxSourceBytes) {
    onError(name, sourceTooLarge(limits.maxSourceBytes))
    return summary
  }
  if (OTHER_ACTIVITY.test(name)) {
    summary.otherActivityFiles = 1
    sink.skipped?.(otherExtensionOf(name))
  } else if (ACTIVITY.test(name)) {
    await extractSingle(source, sink)
  } else if (ZIP.test(name)) {
    await streamZip(source, sink, newBudget())
  } else {
    onError(name, notActivity(UNSUPPORTED_FORMAT))
  }
  return summary
}

async function extractSingle(source: FitSource, sink: Sink): Promise<void> {
  const isGzip = /\.gz$/i.test(source.name)
  const chunks: Uint8Array[] = []
  let outputBytes = 0
  let failure: Rejection | null = null
  const gunzip = isGzip
    ? new Gunzip((data) => {
        if (data.length > sink.limits.maxTotalDecompressedBytes - outputBytes) {
          failure = expandsTooLarge(sink.limits.maxTotalDecompressedBytes)
          return
        }
        if (!appendChunk(chunks, data, outputBytes, sink.limits.maxEntryBytes)) {
          failure = decompressedTooLarge(sink.limits.maxEntryBytes)
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
          failure = corrupt(DECOMPRESS_FAILED)
          return false
        }
      } else {
        if (chunk.length > sink.limits.maxTotalDecompressedBytes - outputBytes) {
          failure = expandsTooLarge(sink.limits.maxTotalDecompressedBytes)
          return false
        }
        if (!appendChunk(chunks, chunk, outputBytes, sink.limits.maxEntryBytes)) {
          failure = fileTooLarge(sink.limits.maxEntryBytes)
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
        failure = corrupt(DECOMPRESS_FAILED)
      }
    }
    if (failure === null && readFailure !== null) failure = readFailure
  } catch {
    failure = corrupt(READ_FAILED)
  }
  if (failure !== null) {
    sink.onError(source.name, failure)
    return
  }
  if (outputBytes > sink.limits.maxBufferedBytes - outputBytes) {
    sink.onError(source.name, bufferedTooLarge(sink.limits.maxBufferedBytes))
    return
  }
  const bytes = concat(chunks, outputBytes)
  const fileName = isGzip ? source.name.slice(0, -'.gz'.length) : source.name
  await deliver(fileName, bytes, sink)
}

async function streamZip(source: FitSource, sink: Sink, budget: ZipBudget): Promise<void> {
  const run = new ZipRun(sink, budget)
  const reader = new ZipReader(source.name, 0, run, true)
  try {
    const readFailure = await readSource(source, sink.limits.maxSourceBytes, async (chunk) => {
      for (let offset = 0; offset < chunk.length; offset += DECOMPRESS_INPUT_CHUNK_BYTES) {
        if (budget.abort !== null) return false
        if (!reader.push(chunk.subarray(offset, offset + DECOMPRESS_INPUT_CHUNK_BYTES))) {
          return false
        }
        await run.drain()
      }
      return budget.abort === null
    })
    reader.finishRead(readFailure)
  } catch {
    reader.failed()
  }
  // A handler error may have been swallowed by the unzip callbacks; it always wins.
  if (run.handlerFailed) throw run.handlerError
  reader.closeOpen()
  await run.drain()
  await reader.verify()
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
