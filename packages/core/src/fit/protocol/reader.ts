import { readField } from './baseTypes'
import { crc16 } from './crc'

export const NOT_FIT_ERROR = 'Not a FIT file'
export const TRUNCATED_ERROR = 'File is truncated'
const CHECKSUM_ERROR = 'Checksum mismatch'
const OVERRUN_ERROR = 'A message runs past the end of the data section'
const UNDEFINED_TYPE_ERROR = 'A message uses a local message type that was never defined'
const MAX_LOCAL_TYPES = 16
const TIMESTAMP_FIELD = 253

/** One data message: its global number and its field values (absent when invalid). */
export interface FitMessage {
  globalNum: number
  values: Map<number, number | string>
}

export interface FitFileScan {
  errors: string[]
  warnings: string[]
  /** True only when the file CRC was read and matches. */
  crcValid: boolean
}

interface FieldDef {
  num: number
  size: number
  base: number
}

interface MessageDef {
  globalNum: number
  little: boolean
  fields: FieldDef[]
  /** Bytes of one data message, developer fields included. */
  size: number
}

/** True when the bytes hold a FIT header: at least 12 bytes with the ".FIT" signature. */
export function isFitFile(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[8] === 0x2e &&
    bytes[9] === 0x46 &&
    bytes[10] === 0x49 &&
    bytes[11] === 0x54
  )
}

/**
 * Walks one FIT file: header, data records and trailing CRC. Each data message is passed to
 * `visit` in file order; returning false stops the walk. Never throws on malformed input.
 * Trailing bytes after the first file are reported as a warning, not decoded.
 */
export function scanFit(bytes: Uint8Array, visit: (message: FitMessage) => boolean): FitFileScan {
  const scan: FitFileScan = { errors: [], warnings: [], crcValid: false }
  if (!isFitFile(bytes)) {
    scan.errors.push(NOT_FIT_ERROR)
    return scan
  }
  const headerSize = bytes[0]
  if (headerSize !== 12 && headerSize !== 14) {
    scan.errors.push('Unsupported FIT header size')
    return scan
  }
  if (bytes.length < headerSize) {
    scan.errors.push(TRUNCATED_ERROR)
    return scan
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (headerSize === 14) {
    const stored = view.getUint16(12, true)
    if (stored !== 0 && stored !== crc16(bytes, 0, 12)) scan.errors.push('Header checksum mismatch')
  }

  const dataEnd = headerSize + view.getUint32(4, true)
  const complete = dataEnd + 2 <= bytes.length
  if (!complete) scan.errors.push(TRUNCATED_ERROR)

  const finished = scanRecords(
    bytes,
    view,
    headerSize,
    Math.min(dataEnd, bytes.length),
    visit,
    scan,
  )
  if (complete && finished) {
    scan.crcValid = view.getUint16(dataEnd, true) === crc16(bytes, 0, dataEnd)
    if (!scan.crcValid) scan.errors.push(CHECKSUM_ERROR)
  }
  if (complete && dataEnd + 2 < bytes.length) scan.warnings.push('trailing data')
  return scan
}

/**
 * Reads records from `start` to `limit`. Returns false when it stopped early, either because
 * `visit` asked it to or because of an error recorded in `scan`.
 */
function scanRecords(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  limit: number,
  visit: (message: FitMessage) => boolean,
  scan: FitFileScan,
): boolean {
  const defs: Array<MessageDef | undefined> = new Array<MessageDef | undefined>(MAX_LOCAL_TYPES)
  // The last full timestamp, used to expand compressed-timestamp headers.
  let lastTime: number | undefined
  const overrun = (): boolean => {
    scan.errors.push(limit < bytes.length ? OVERRUN_ERROR : TRUNCATED_ERROR)
    return false
  }

  let pos = start
  while (pos < limit) {
    const header = bytes[pos]!
    if ((header & 0x80) !== 0) {
      const def = defs[(header >> 5) & 0x03]
      if (def === undefined) {
        scan.errors.push(UNDEFINED_TYPE_ERROR)
        return false
      }
      if (pos + 1 + def.size > limit) return overrun()
      const values = readValues(view, pos + 1, def)
      pos += 1 + def.size
      const offset = header & 0x1f
      if (lastTime !== undefined) {
        lastTime += (offset - (lastTime & 0x1f)) & 0x1f
        values.set(TIMESTAMP_FIELD, lastTime)
      }
      if (!visit({ globalNum: def.globalNum, values })) return false
    } else if ((header & 0x40) !== 0) {
      const parsed = readDefinition(bytes, view, pos, limit)
      if (parsed === undefined) return overrun()
      defs[header & 0x0f] = parsed.def
      pos = parsed.next
    } else {
      const def = defs[header & 0x0f]
      if (def === undefined) {
        scan.errors.push(UNDEFINED_TYPE_ERROR)
        return false
      }
      if (pos + 1 + def.size > limit) return overrun()
      const values = readValues(view, pos + 1, def)
      pos += 1 + def.size
      const time = values.get(TIMESTAMP_FIELD)
      if (typeof time === 'number') lastTime = time
      if (!visit({ globalNum: def.globalNum, values })) return false
    }
  }
  return true
}

/** Parses a definition message whose header byte is at `pos`, or returns undefined if it overruns. */
function readDefinition(
  bytes: Uint8Array,
  view: DataView,
  pos: number,
  limit: number,
): { def: MessageDef; next: number } | undefined {
  if (pos + 6 > limit) return undefined
  const header = bytes[pos]!
  const little = bytes[pos + 2] === 0
  const globalNum = view.getUint16(pos + 3, little)
  const count = bytes[pos + 5]!
  let cursor = pos + 6
  if (cursor + 3 * count > limit) return undefined
  const fields: FieldDef[] = []
  let size = 0
  for (let i = 0; i < count; i++) {
    // The top bit of the base type byte is the endian flag; the architecture byte decides.
    const field = { num: bytes[cursor]!, size: bytes[cursor + 1]!, base: bytes[cursor + 2]! & 0x1f }
    fields.push(field)
    size += field.size
    cursor += 3
  }
  if ((header & 0x20) !== 0) {
    if (cursor + 1 > limit) return undefined
    const devCount = bytes[cursor]!
    cursor += 1
    if (cursor + 3 * devCount > limit) return undefined
    for (let i = 0; i < devCount; i++) {
      size += bytes[cursor + 1]!
      cursor += 3
    }
  }
  return { def: { globalNum, little, fields, size }, next: cursor }
}

/** Reads the field values of the data message whose first field byte is at `start`. */
function readValues(view: DataView, start: number, def: MessageDef): Map<number, number | string> {
  const values = new Map<number, number | string>()
  let offset = start
  for (const field of def.fields) {
    const value = readField(view, offset, field.size, field.base, def.little)
    if (value !== undefined) values.set(field.num, value)
    offset += field.size
  }
  return values
}
