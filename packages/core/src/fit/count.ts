import { DEFAULT_EXTRACT_LIMITS } from './archive'
import type { ExtractLimits } from './archive'
import { ACTIVITY, directoryOf, isIgnored, readRange, walkDirectory, ZIP } from './zipDirectory'
import type { EntryFilter, RangedSource } from './zipDirectory'

export type { RangedSource } from './zipDirectory'

/**
 * How many activity files (FIT, GPX or TCX) the sources deliver, read from each zip's central
 * directory without reading its entries. Null when the total is not known cheaply: a zip inside a
 * zip is only listed once it is read, a directory larger than extraction would accept is not read,
 * and a directory that cannot be read is not guessed at. `listed` leaves out the entries of a zip
 * that extraction would leave out for the same filter.
 */
export async function countActivityFiles(
  sources: readonly RangedSource[],
  limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS,
  listed?: EntryFilter,
): Promise<number | null> {
  let total = 0
  for (const source of sources) {
    const count = await countSource(source, limits, listed)
    if (count === null) return null
    total += count
  }
  return total
}

async function countSource(
  source: RangedSource,
  limits: ExtractLimits,
  listed: EntryFilter | undefined,
): Promise<number | null> {
  // Extraction refuses a source this large before it reads it, so it delivers nothing.
  if (source.size > limits.maxSourceBytes) return ACTIVITY.test(source.name) ? 1 : 0
  if (ACTIVITY.test(source.name)) return 1
  if (!ZIP.test(source.name)) return 0
  try {
    return await countZipEntries(source, limits, listed)
  } catch {
    return null
  }
}

async function countZipEntries(
  source: RangedSource,
  limits: ExtractLimits,
  listed: EntryFilter | undefined,
): Promise<number | null> {
  const directory = await directoryOf(source, limits)
  if (directory === null) return null
  let count = 0
  let nested = false
  const complete = await walkDirectory(
    (start, end) => readRange(source, start, end),
    directory.offset,
    directory.size,
    limits.maxArchiveEntries,
    (name) => {
      if (isIgnored(name)) return
      // A zip inside this one is only listed once it is read, so its entries are not known yet.
      if (ZIP.test(name)) nested = true
      else if (ACTIVITY.test(name) && listed?.(name) !== false) count++
    },
  )
  if (!complete || nested) return null
  return count
}
