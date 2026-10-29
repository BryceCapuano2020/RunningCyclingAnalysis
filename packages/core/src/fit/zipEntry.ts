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
    return best === undefined ? null : await readFound(source, best, limits)
  } catch {
    return null
  }
}

/**
 * The entries `isWanted` accepts, each read as readZipEntry reads one, in the order the zip lists them. An
 * entry that cannot be read is left out. Reading stops before an entry that would take the bytes read past
 * `maxBytes`, or after `maxEntries` entries, so the rest are not read. Never throws.
 */
export async function readZipEntries(
  source: RangedSource,
  isWanted: (name: string) => boolean,
  limits: ExtractLimits,
  maxBytes: number,
  maxEntries: number,
): Promise<ZipEntryBytes[]> {
  const read: ZipEntryBytes[] = []
  try {
    let bytes = 0
    for (const found of (await wantedEntries(source, isWanted, limits))?.slice(0, maxEntries) ??
      []) {
      const entry = await readFound(source, found, limits)
      if (entry === null) continue
      bytes += entry.bytes.length
      if (bytes > maxBytes) break
      read.push(entry)
    }
  } catch {
    // What was read stays.
  }
  return read
}

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
): Promise<ZipEntryBytes | null> {
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
  const bytes = decompress(entry.method, data, limits.maxEntryBytes)
  return bytes === null ? null : { name, bytes }
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
  if (method === STORED) return data
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
