import { Inflate } from 'fflate'
import { concat } from '../bytes'
import { DECOMPRESS_INPUT_CHUNK_BYTES, DEFAULT_EXTRACT_LIMITS } from './archive'
import type { ExtractLimits } from './archive'
import type { CentralEntry, RangedSource } from './zipDirectory'
import { directoryOf, isIgnored, readRange, walkDirectory } from './zipDirectory'

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const LOCAL_HEADER_BYTES = 30
const ENCRYPTED = 0x1
const STORED = 0
const DEFLATED = 8

export interface ZipEntryBytes {
  name: string
  bytes: Uint8Array<ArrayBuffer>
}

interface Found {
  name: string
  entry: CentralEntry
}

/**
 * The bytes of one entry of a zip, read by range: only the central directory and the entry itself
 * are read. Of the entries `isWanted` accepts, the one nearest the root is taken. Null when none is
 * wanted, when the zip or the entry cannot be read, when the entry is encrypted, uses a method other
 * than stored or deflate, or its local header names another file, or when it is larger than
 * limits.maxEntryBytes, compressed or decompressed. Never throws.
 */
export async function readZipEntry(
  source: RangedSource,
  isWanted: (name: string) => boolean,
  limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS,
): Promise<ZipEntryBytes | null> {
  try {
    const found = await wantedEntries(source, isWanted, limits)
    const best = found?.reduce<Found | undefined>(
      (a, b) => (a === undefined || depthOf(b.name) < depthOf(a.name) ? b : a),
      undefined,
    )
    const read = best === undefined ? null : await readFound(source, best, limits)
    return read === 'over' ? null : read
  } catch {
    return null
  }
}

/** What visiting a zip's wanted entries took and found. */
export interface EntriesVisited {
  /** The bytes inflated for the entries, plus the most an entry could have taken when it was refused for size. */
  inflatedBytes: number
  /** Entries visited. */
  read: number
  /** Directory headers left unread because they point at an entry an earlier header already did. */
  repeated: number
}

/**
 * Calls `visit` with each entry `isWanted` accepts, read as readZipEntry reads one, in the order the zip
 * lists them, and lets go of its bytes before the next is read, so one entry is held at a time. The
 * entries together inflate to at most `maxBytes`, and one to what is left of that, of
 * limits.maxEntryBytes, and of a third of the buffer less what it was compressed to (read, inflated, and
 * decoded as text each take its size). An entry that would pass its share is left out, and the most it
 * could have taken is counted, so a directory of such entries cannot make the read run on. A header
 * that names the data of an entry already read is not read again, whatever it is called: a zip of a few
 * kilobytes could otherwise list one large entry thousands of times. At most `maxEntries` entries are
 * read. Never throws.
 */
export async function visitZipEntries(
  source: RangedSource,
  isWanted: (name: string) => boolean,
  limits: ExtractLimits,
  share: { maxBytes: number; maxEntries: number },
  visit: (entry: ZipEntryBytes) => void,
): Promise<EntriesVisited> {
  const visited: EntriesVisited = { inflatedBytes: 0, read: 0, repeated: 0 }
  try {
    const offsets = new Set<number>()
    let attempts = 0
    for (const found of (await wantedEntries(source, isWanted, limits)) ?? []) {
      if (offsets.has(found.entry.localOffset)) {
        visited.repeated++
        continue
      }
      offsets.add(found.entry.localOffset)
      const left = share.maxBytes - visited.inflatedBytes
      const buffered = Math.floor(
        (limits.maxBufferedBytes - found.entry.compressedSize) / BUFFER_COPIES,
      )
      const cap = Math.min(limits.maxEntryBytes, left, buffered)
      if (visited.read >= share.maxEntries || left <= 0) break
      // Entries that cannot be read count too, so a directory of them cannot make the walk read on.
      if (++attempts > share.maxEntries * ATTEMPTS_PER_ENTRY) break
      if (cap <= 0 || found.entry.size > cap) {
        visited.inflatedBytes += Math.max(0, Math.min(cap, found.entry.size))
        continue
      }
      const entry = await readFound(source, found, limits, cap)
      if (entry === 'over') visited.inflatedBytes += cap
      if (entry === null || entry === 'over') continue
      visited.inflatedBytes += entry.bytes.length
      visited.read++
      visit(entry)
    }
  } catch {
    // What was visited stays.
  }
  return visited
}

/** Entries tried for each one that may be read, readable or not. */
const ATTEMPTS_PER_ENTRY = 4

/** The times an entry's size is held at once when it is read as text: compressed aside, inflated twice, decoded. */
const BUFFER_COPIES = 4

/** The entries of the zip's central directory that `isWanted` accepts. Null when it has no readable directory. */
async function wantedEntries(
  source: RangedSource,
  isWanted: (name: string) => boolean,
  limits: ExtractLimits,
): Promise<Found[] | null> {
  const directory = await directoryOf(source, limits)
  if (directory === null) return null
  const found: Found[] = []
  await walkDirectory(
    (start, end) => readRange(source, start, end),
    directory.offset,
    directory.size,
    limits.maxArchiveEntries,
    (name, entry) => {
      if (!isIgnored(name) && isWanted(name)) found.push({ name, entry })
    },
  )
  return found
}

/** One listed entry's bytes, or null when it cannot be read within the limits. */
async function readFound(
  source: RangedSource,
  { name, entry }: Found,
  limits: ExtractLimits,
  maxInflated = limits.maxEntryBytes,
): Promise<ZipEntryBytes | 'over' | null> {
  const head = await readBytes(source, entry.localOffset, LOCAL_HEADER_BYTES)
  if (head === null) return null
  const view = new DataView(head.buffer)
  if (view.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE) return null
  if ((entry.flags & ENCRYPTED) !== 0) return null
  const nameLength = view.getUint16(26, true)
  const localName = await readBytes(source, entry.localOffset + LOCAL_HEADER_BYTES, nameLength)
  if (localName === null || new TextDecoder().decode(localName) !== name) return null
  if (entry.compressedSize > limits.maxEntryBytes) return null
  const dataStart = entry.localOffset + LOCAL_HEADER_BYTES + nameLength + view.getUint16(28, true)
  const data = await readBytes(source, dataStart, entry.compressedSize)
  if (data === null) return null
  const bytes = decompress(entry.method, data, maxInflated)
  if (bytes === null) return entry.method === DEFLATED || entry.method === STORED ? 'over' : null
  return { name, bytes }
}

/** Folders in an entry's name: the nearer the root, the fewer. */
function depthOf(name: string): number {
  return name.split(/[\\/]/).length
}

/** The bytes from `start` for `length` bytes, or null when the source ends before them. */
async function readBytes(
  source: RangedSource,
  start: number,
  length: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  if (start < 0 || start + length > source.size) return null
  const bytes = await readRange(source, start, start + length)
  return bytes.length === length ? bytes : null
}

/** The entry's bytes once decompressed, or null for another method, a corrupt stream or too much output. */
function decompress(
  method: number,
  data: Uint8Array<ArrayBuffer>,
  limit: number,
): Uint8Array<ArrayBuffer> | null {
  if (method === STORED) return data.length > limit ? null : data
  if (method !== DEFLATED) return null
  return inflateWithin(data, limit)
}

/**
 * Inflates a deflate stream in pieces of DECOMPRESS_INPUT_CHUNK_BYTES, and gives up once the output
 * passes the limit, so a small stream that expands hugely is refused early. The limit is checked on
 * each output callback, so the stream can run on through the rest of the piece that crossed it, but
 * output past the limit is counted and dropped, never kept. Null when the stream is corrupt or too
 * large.
 */
function inflateWithin(data: Uint8Array, limit: number): Uint8Array<ArrayBuffer> | null {
  const chunks: Uint8Array[] = []
  let total = 0
  let over = false
  const inflate = new Inflate((chunk) => {
    total += chunk.length
    if (total > limit) over = true
    else chunks.push(chunk.slice())
  })
  try {
    for (let offset = 0; !over; offset += DECOMPRESS_INPUT_CHUNK_BYTES) {
      const end = Math.min(offset + DECOMPRESS_INPUT_CHUNK_BYTES, data.length)
      const last = end === data.length
      inflate.push(data.subarray(offset, end), last)
      if (last) break
    }
  } catch {
    return null
  }
  return over ? null : concat(chunks, total)
}
