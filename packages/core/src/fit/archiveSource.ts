import { corrupt, fileTooLarge, READ_FAILED, sourceTooLarge } from './archiveReasons'
import type { FitSource } from './archive'
import type { Rejection } from '../import/result'

/** Reading a source's bytes: a stream in bounded chunks, or bytes already in memory. */

/**
 * Reads a source's stream chunk by chunk, handing each to onChunk. It stops, and says why, at a source
 * larger than maxBytes, at a chunk onChunk declines, or at a stream that fails. An error onChunk throws
 * is rethrown once the stream is released.
 */
export async function readSource(
  source: FitSource,
  maxBytes: number,
  onChunk: (chunk: Uint8Array) => boolean | Promise<boolean>,
): Promise<Rejection | null> {
  let reader: ReadableStreamDefaultReader<Uint8Array>
  try {
    reader = source.stream().getReader()
  } catch {
    return corrupt(READ_FAILED)
  }
  let total = 0
  let complete = false
  let failure: Rejection | null = null
  let callbackError: unknown
  try {
    while (true) {
      let step: ReadableStreamReadResult<Uint8Array>
      try {
        step = await reader.read()
      } catch {
        failure = corrupt(READ_FAILED)
        break
      }
      if (step.done) {
        complete = true
        break
      }
      if (step.value.length > maxBytes - total) {
        failure = sourceTooLarge(maxBytes)
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
        failure = fileTooLarge(maxBytes)
        break
      }
    }
  } finally {
    if (!complete) {
      try {
        await reader.cancel(failure?.reason ?? 'Extraction stopped')
      } catch {
        // Releasing the lock is still required if cancellation is rejected by the source.
      }
    }
    reader.releaseLock()
  }
  if (callbackError !== undefined) throw callbackError
  return failure
}
