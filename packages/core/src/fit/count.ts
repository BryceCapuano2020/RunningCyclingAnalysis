import { DEFAULT_EXTRACT_LIMITS } from './archive'
import type { ExtractLimits, FitSource } from './archive'
import {
  ACTIVITY,
  DIRECTORY_TAIL_BYTES,
  isIgnored,
  readDirectory,
  walkDirectory,
  ZIP,
} from './zipDirectory'

/**
 * A source whose bytes can be read by range, such as a browser File, so that a zip's directory can
 * be read without its entries.
 */
export interface RangedSource extends FitSource {
  readonly size: number
  slice(start: number, end: number): Blob
}

/**
 * How many activity files (FIT, GPX or TCX) the sources deliver, read from each zip's central
 * directory without reading its entries. Null when the total is not known cheaply: a zip inside a
 * zip is only listed once it is read, a directory larger than extraction would accept is not read,
 * and a directory that cannot be read is not guessed at.
 */
export async function countActivityFiles(
  sources: readonly RangedSource[],
  limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS,
): Promise<number | null> {
  let total = 0
  for (const source of sources) {
    const count = await countSource(source, limits)
    if (count === null) return null
    total += count
  }
  return total
}

async function countSource(source: RangedSource, limits: ExtractLimits): Promise<number | null> {
  // Extraction refuses a source this large before it reads it, so it delivers nothing.
  if (source.size > limits.maxSourceBytes) return ACTIVITY.test(source.name) ? 1 : 0
  if (ACTIVITY.test(source.name)) return 1
  if (!ZIP.test(source.name)) return 0
  try {
    return await countZipEntries(source, limits)
  } catch {
    return null
  }
}

async function countZipEntries(
  source: RangedSource,
  limits: ExtractLimits,
): Promise<number | null> {
  const tailStart = Math.max(0, source.size - DIRECTORY_TAIL_BYTES)
  const tail = new Uint8Array(await source.slice(tailStart, source.size).arrayBuffer())
  const directory = readDirectory(tail, tailStart)
  // A directory that lists more entries, or is larger in bytes, than extraction accepts is refused
  // before any of it is read.
  if (
    directory === null ||
    directory.count > limits.maxArchiveEntries ||
    directory.size > limits.maxBufferedBytes ||
    directory.offset + directory.size > source.size
  ) {
    return null
  }
  let count = 0
  let nested = false
  const complete = await walkDirectory(
    async (start, end) => new Uint8Array(await source.slice(start, end).arrayBuffer()),
    directory.offset,
    directory.size,
    limits.maxArchiveEntries,
    (name) => {
      if (isIgnored(name)) return
      // A zip inside this one is only listed once it is read, so its entries are not known yet.
      if (ZIP.test(name)) nested = true
      else if (ACTIVITY.test(name)) count++
    },
  )
  if (!complete || nested) return null
  return count
}
