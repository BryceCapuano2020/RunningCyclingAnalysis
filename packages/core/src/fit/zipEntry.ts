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
    const directory = await directoryOf(source, limits)
    if (directory === null) return null
    const found: { name: string; entry: CentralEntry }[] = []
    await walkDirectory(
      (start, end) => readRange(source, start, end),
      directory.offset,
      directory.size,
      limits.maxArchiveEntries,
      (name, entry) => {
        if (!isIgnored(name) && isWanted(name)) found.push({ name, entry })
      },
    )
    const best = found.reduce<{ name: string; entry: CentralEntry } | undefined>(
      (a, b) => (a === undefined || depthOf(b.name) < depthOf(a.name) ? b : a),
      undefined,
    )
    if (best === undefined) return null

    const head = await readBytes(source, best.entry.localOffset, LOCAL_HEADER_BYTES)
    if (head === null) return null
    const view = new DataView(head.buffer)
    if (view.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE) return null
    if ((best.entry.flags & ENCRYPTED) !== 0) return null
    const nameLength = view.getUint16(26, true)
    const localName = await readBytes(
      source,
      best.entry.localOffset + LOCAL_HEADER_BYTES,
      nameLength,
    )
    if (localName === null || new TextDecoder().decode(localName) !== best.name) return null
    if (best.entry.compressedSize > limits.maxEntryBytes) return null
    const dataStart =
      best.entry.localOffset + LOCAL_HEADER_BYTES + nameLength + view.getUint16(28, true)
    const data = await readBytes(source, dataStart, best.entry.compressedSize)
    if (data === null) return null
    const bytes = decompress(best.entry.method, data, limits.maxEntryBytes)
    return bytes === null ? null : { name: best.name, bytes }
  } catch {
    return null
  }
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
