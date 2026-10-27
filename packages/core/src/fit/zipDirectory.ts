import type { ExtractLimits, FitSource } from './archive'

/** Activity formats this app reads: FIT, GPX and TCX, each optionally gzipped. */
export const ACTIVITY = /\.(fit|gpx|tcx)(\.gz)?$/i
/** Activity formats this app does not read. They are counted, not delivered. */
export const OTHER_ACTIVITY = /\.(kml|kmz|pwx|hrm)(\.gz)?$/i
export const ZIP = /\.zip$/i

/**
 * Whether a zip entry may be an activity. Extraction and counting take one to leave out the activity
 * files an export's own list does not name, such as the saved routes in a Strava export.
 */
export type EntryFilter = (entryName: string) => boolean

/**
 * The end of an archive, where the End of Central Directory record, its ZIP64 locator and the ZIP64
 * record sit behind the largest comment a zip can carry (64 KiB less one byte).
 */
export const DIRECTORY_TAIL_BYTES = 0xffff + 22 + 20 + 56
const EOCD_SIGNATURE = 0x06054b50
const ZIP64_EOCD_SIGNATURE = 0x06064b50
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
/** The fixed part of a central directory header. Its name, extra field and comment follow it. */
const CENTRAL_HEADER_BYTES = 46
/** Directory bytes read at a time when the headers are walked. Memory stays at this size. */
const WALK_CHUNK_BYTES = 64 * 1024
/** A 32-bit size or offset this large means the real value is in the ZIP64 extra field. */
const ZIP32_MAX = 0xffffffff
const ZIP64_EXTRA_ID = 0x0001

/** Where an archive's central directory is, and how many entries it lists. */
export interface Directory {
  /** Byte offset of the central directory from the start of the archive. */
  offset: number
  size: number
  count: number
}

/** What a central directory header says about its entry. ZIP64 values replace the 32-bit ones. */
export interface CentralEntry {
  flags: number
  method: number
  /** Bytes stored in the archive. */
  compressedSize: number
  /** Bytes once decompressed, as the header claims. */
  size: number
  /** Byte offset of the entry's local header from the start of the archive. */
  localOffset: number
}

/**
 * The central directory of an archive, read from its end. `tail` starts at byte `tailStart` of the
 * archive. Returns null when no readable directory is there.
 */
export function readDirectory(tail: Uint8Array, tailStart: number): Directory | null {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  let eocd = -1
  for (let p = tail.length - 22; p >= 0 && eocd < 0; p--) {
    const commentLength = p + 22 <= tail.length ? view.getUint16(p + 20, true) : 0
    if (view.getUint32(p, true) === EOCD_SIGNATURE && p + 22 + commentLength <= tail.length) {
      eocd = p
    }
  }
  if (eocd < 0) return null
  const count = view.getUint16(eocd + 10, true)
  if (count !== 0xffff && view.getUint32(eocd + 16, true) !== ZIP32_MAX) {
    return { count, offset: view.getUint32(eocd + 16, true), size: view.getUint32(eocd + 12, true) }
  }
  // ZIP64: the locator sits just before the EOCD and gives the absolute offset of the ZIP64 record.
  const locator = eocd - 20
  if (locator < 0 || view.getUint32(locator, true) !== ZIP64_LOCATOR_SIGNATURE) return null
  const record = Number(view.getBigUint64(locator + 8, true)) - tailStart
  if (record < 0 || record + 56 > tail.length) return null
  if (view.getUint32(record, true) !== ZIP64_EOCD_SIGNATURE) return null
  return {
    count: Number(view.getBigUint64(record + 32, true)),
    size: Number(view.getBigUint64(record + 40, true)),
    offset: Number(view.getBigUint64(record + 48, true)),
  }
}

/** Reads the bytes from `start` to `end` of an archive. A short read ends the walk. */
export type ReadRange = (start: number, end: number) => Promise<Uint8Array>

/**
 * Calls visit with the name and the header of each entry in the central directory at
 * [offset, offset + size), reading it in chunks, so only one chunk is held at a time. Returns true
 * only when the walk reaches the end of the directory. It stops early at a header that is missing,
 * short or corrupt, and at more than maxEntries headers, so a directory that lies about its size or
 * count cannot make it run on.
 */
export async function walkDirectory(
  read: ReadRange,
  offset: number,
  size: number,
  maxEntries: number,
  visit: (name: string, entry: CentralEntry) => void,
): Promise<boolean> {
  const end = offset + size
  const decoder = new TextDecoder()
  let position = offset
  let window: Uint8Array = new Uint8Array(0)
  let windowStart = offset
  let entries = 0
  // Makes the window hold the bytes from the position for `length` bytes, reading more if needed.
  const cover = async (length: number): Promise<boolean> => {
    if (position - windowStart >= 0 && position - windowStart + length <= window.length) return true
    if (position + length > end) return false
    windowStart = position
    window = await read(position, Math.min(end, position + Math.max(WALK_CHUNK_BYTES, length)))
    return window.length >= length
  }
  const headerView = () => new DataView(window.buffer, window.byteOffset, window.byteLength)
  while (position < end) {
    if (!(await cover(CENTRAL_HEADER_BYTES))) break
    let local = position - windowStart
    if (headerView().getUint32(local, true) !== CENTRAL_HEADER_SIGNATURE) break
    const nameLength = headerView().getUint16(local + 28, true)
    const headerLength =
      CENTRAL_HEADER_BYTES +
      nameLength +
      headerView().getUint16(local + 30, true) +
      headerView().getUint16(local + 32, true)
    if (!(await cover(headerLength))) break
    local = position - windowStart
    entries++
    if (entries > maxEntries) return false
    const nameStart = local + CENTRAL_HEADER_BYTES
    const name = decoder.decode(window.subarray(nameStart, nameStart + nameLength))
    visit(name, centralEntry(headerView(), local, nameLength))
    position += headerLength
  }
  return position === end
}

/**
 * The header at `local` in `view`. Its extra field's ZIP64 values replace the 32-bit values that
 * are 0xFFFFFFFF. Reads stay inside the extra field, so a damaged one cannot throw.
 */
function centralEntry(view: DataView, local: number, nameLength: number): CentralEntry {
  const entry: CentralEntry = {
    flags: view.getUint16(local + 8, true),
    method: view.getUint16(local + 10, true),
    compressedSize: view.getUint32(local + 20, true),
    size: view.getUint32(local + 24, true),
    localOffset: view.getUint32(local + 42, true),
  }
  const extraStart = local + CENTRAL_HEADER_BYTES + nameLength
  const extraEnd = Math.min(extraStart + view.getUint16(local + 30, true), view.byteLength)
  let at = extraStart
  while (at + 4 <= extraEnd) {
    const end = Math.min(at + 4 + view.getUint16(at + 2, true), extraEnd)
    if (view.getUint16(at, true) === ZIP64_EXTRA_ID) readZip64(view, at + 4, end, entry)
    at = end
  }
  return entry
}

/** Fills in the values the header marks as 0xFFFFFFFF, in the order the ZIP64 field gives them. */
function readZip64(view: DataView, start: number, end: number, entry: CentralEntry): void {
  let at = start
  const next = (): number | undefined => {
    if (at + 8 > end) return undefined
    const value = Number(view.getBigUint64(at, true))
    at += 8
    return value
  }
  if (entry.size === ZIP32_MAX) entry.size = next() ?? entry.size
  if (entry.compressedSize === ZIP32_MAX) entry.compressedSize = next() ?? entry.compressedSize
  if (entry.localOffset === ZIP32_MAX) entry.localOffset = next() ?? entry.localOffset
}

/**
 * How many entries an archive's tail lists. When the whole directory is in the tail, its headers
 * are counted, so an end record whose count lies is not trusted, unless the headers cannot all be
 * read.
 * Otherwise the count the record gives.
 */
export async function listedEntries(tail: Uint8Array, tailStart: number): Promise<number | null> {
  const directory = readDirectory(tail, tailStart)
  if (directory === null) return null
  const inTail =
    directory.offset >= tailStart && directory.offset + directory.size <= tailStart + tail.length
  if (!inTail) return directory.count
  let entries = 0
  const complete = await walkDirectory(
    (start, stop) => Promise.resolve(tail.subarray(start - tailStart, stop - tailStart)),
    directory.offset,
    directory.size,
    Number.POSITIVE_INFINITY,
    () => {
      entries++
    },
  )
  return complete ? entries : directory.count
}

/**
 * A source whose bytes can be read by range, such as a browser File, so that a zip's directory can
 * be read without its entries.
 */
export interface RangedSource extends FitSource {
  readonly size: number
  slice(start: number, end: number): Blob
}

/** The bytes from `start` to `end` of a ranged source, as one array. */
export async function readRange(
  source: RangedSource,
  start: number,
  end: number,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await source.slice(start, end).arrayBuffer())
}

/**
 * The central directory of a zip, read from its end and checked against the limits. Null when there
 * is no readable directory, or one that extraction would refuse before reading any of it.
 */
export async function directoryOf(
  source: RangedSource,
  limits: ExtractLimits,
): Promise<Directory | null> {
  const tailStart = Math.max(0, source.size - DIRECTORY_TAIL_BYTES)
  const directory = readDirectory(await readRange(source, tailStart, source.size), tailStart)
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
  return directory
}

/** Directory entries and macOS resource-fork metadata. */
export function isIgnored(name: string): boolean {
  return name.endsWith('/') || /(^|\/)__MACOSX\//.test(name) || /(^|\/)\._/.test(name)
}

/** A zip with no entries starts with its end-of-central-directory record. */
const EMPTY_ZIP_SIGNATURE = [0x50, 0x4b, 0x05, 0x06]
export function isEmptyZip(prefix: Uint8Array): boolean {
  return prefix.length === 4 && EMPTY_ZIP_SIGNATURE.every((byte, i) => prefix[i] === byte)
}
