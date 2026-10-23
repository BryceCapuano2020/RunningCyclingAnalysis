/** Activity formats this app reads: FIT, GPX and TCX, each optionally gzipped. */
export const ACTIVITY = /\.(fit|gpx|tcx)(\.gz)?$/i
/** Activity formats this app does not read. They are counted, not delivered. */
export const OTHER_ACTIVITY = /\.(kml|kmz|pwx|hrm)(\.gz)?$/i
export const ZIP = /\.zip$/i

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

/** Where an archive's central directory is, and how many entries it lists. */
export interface Directory {
  /** Byte offset of the central directory from the start of the archive. */
  offset: number
  size: number
  count: number
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
  if (count !== 0xffff && view.getUint32(eocd + 16, true) !== 0xffffffff) {
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
 * Calls visit with the name of each header in the central directory at [offset, offset + size),
 * reading it in chunks, so only one chunk is held at a time. Returns true only when the walk
 * reaches the end of the directory. It stops early at a header that is missing, short or corrupt,
 * and at more than maxEntries headers, so a directory that lies about its size or count cannot make
 * it run on.
 */
export async function walkDirectory(
  read: ReadRange,
  offset: number,
  size: number,
  maxEntries: number,
  visit: (name: string) => void,
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
    visit(decoder.decode(window.subarray(nameStart, nameStart + nameLength)))
    position += headerLength
  }
  return position === end
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

/** Directory entries and macOS resource-fork metadata. */
export function isIgnored(name: string): boolean {
  return name.endsWith('/') || /(^|\/)__MACOSX\//.test(name) || /(^|\/)\._/.test(name)
}
