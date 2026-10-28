import { BASE } from './baseTypes'
import { crc16 } from './crc'

export interface FieldDef<K extends string = string> {
  readonly name: K
  readonly num: number
  readonly base: number
}

/** The fields of one message type, in the order they are written. */
export interface Layout<K extends string = string> {
  readonly mesg: number
  readonly fields: readonly FieldDef<K>[]
}

export function defineLayout<K extends string>(
  mesg: number,
  fields: readonly FieldDef<K>[],
): Layout<K> {
  return { mesg, fields }
}

interface Writable {
  size: number
  min: number
  max: number
  /** The base type's invalid value, written for an absent field. */
  invalid: number
  signed?: boolean
}

const UINT8: Writable = { size: 1, min: 0, max: 0xfe, invalid: 0xff }
const SINT8: Writable = { size: 1, min: -0x80, max: 0x7e, invalid: 0x7f, signed: true }
const WRITABLE: Partial<Record<number, Writable>> = {
  [BASE.enum]: UINT8,
  [BASE.sint8]: SINT8,
  [BASE.uint8]: UINT8,
  [BASE.uint16]: { size: 2, min: 0, max: 0xfffe, invalid: 0xffff },
  [BASE.uint32]: { size: 4, min: 0, max: 0xfffffffe, invalid: 0xffffffff },
  [BASE.sint32]: { size: 4, min: -0x7fffffff, max: 0x7ffffffe, invalid: 0x7fffffff },
}

const HEADER_SIZE = 14
const PROTOCOL_VERSION = 0x20
const PROFILE_VERSION = 2132
const MAX_LOCAL_TYPES = 16
const FIT_SIGNATURE = [0x2e, 0x46, 0x49, 0x54]

interface Registered {
  local: number
  size: number
}

/**
 * Writes one FIT file: a 14-byte header, a definition message for each layout the first time it
 * is used, then data messages, and the file CRC. Absent (undefined) values write the base type's
 * invalid value, so every message of a layout has the same shape. Only the numeric base types the
 * library writes are supported. Use the same Layout object for each message of a type.
 */
export class FitWriter {
  private data = new Uint8Array(4096)
  private length = 0
  private readonly layouts = new Map<Layout, Registered>()

  message<K extends string>(
    layout: Layout<K>,
    values: Partial<Record<K, number | undefined>>,
  ): void {
    const registered = this.layouts.get(layout) ?? this.define(layout)
    this.reserve(1 + registered.size)
    const view = new DataView(this.data.buffer)
    this.data[this.length] = registered.local
    let offset = this.length + 1
    for (const field of layout.fields) {
      const writable = writableOf(field.base)
      writeValue(view, offset, writable, values[field.name])
      offset += writable.size
    }
    this.length += 1 + registered.size
  }

  /** The complete file: header, data messages and CRC. The writer can still be used afterwards. */
  finish(): Uint8Array {
    const header = new Uint8Array(HEADER_SIZE)
    const headerView = new DataView(header.buffer)
    header[0] = HEADER_SIZE
    header[1] = PROTOCOL_VERSION
    headerView.setUint16(2, PROFILE_VERSION, true)
    headerView.setUint32(4, this.length, true)
    header.set(FIT_SIGNATURE, 8)
    headerView.setUint16(12, crc16(header, 0, 12), true)

    const file = new Uint8Array(HEADER_SIZE + this.length + 2)
    file.set(header, 0)
    file.set(this.data.subarray(0, this.length), HEADER_SIZE)
    const end = HEADER_SIZE + this.length
    new DataView(file.buffer).setUint16(end, crc16(file, 0, end), true)
    return file
  }

  /** Writes the definition message for a layout and assigns it the next local message type. */
  private define(layout: Layout): Registered {
    if (this.layouts.size >= MAX_LOCAL_TYPES) {
      throw new RangeError(`A FIT file holds at most ${MAX_LOCAL_TYPES} message layouts`)
    }
    const local = this.layouts.size
    const size = layout.fields.reduce((sum, field) => sum + writableOf(field.base).size, 0)
    this.reserve(6 + 3 * layout.fields.length)
    const at = this.length
    const view = new DataView(this.data.buffer)
    this.data[at] = 0x40 | local
    this.data[at + 1] = 0
    this.data[at + 2] = 0
    view.setUint16(at + 3, layout.mesg, true)
    this.data[at + 5] = layout.fields.length
    let cursor = at + 6
    for (const field of layout.fields) {
      this.data[cursor] = field.num
      this.data[cursor + 1] = writableOf(field.base).size
      // FIT marks multi-byte base types as endian-capable in the base-type byte. The data
      // architecture byte above selects little-endian for this file; the flag still belongs in
      // each field definition (for example uint16 is 0x84, not just 0x04).
      this.data[cursor + 2] = field.base | (writableOf(field.base).size > 1 ? 0x80 : 0)
      cursor += 3
    }
    this.length = cursor
    const registered = { local, size }
    this.layouts.set(layout, registered)
    return registered
  }

  private reserve(extra: number): void {
    const needed = this.length + extra
    if (needed <= this.data.length) return
    const grown = new Uint8Array(Math.max(needed, this.data.length * 2))
    grown.set(this.data.subarray(0, this.length))
    this.data = grown
  }
}

function writableOf(base: number): Writable {
  const writable = WRITABLE[base]
  if (writable === undefined) throw new RangeError(`FIT writer cannot write base type ${base}`)
  return writable
}

/** Writes a value as a little-endian integer. Non-integers round; out-of-range values are invalid. */
function writeValue(
  view: DataView,
  offset: number,
  writable: Writable,
  value: number | undefined,
): void {
  const rounded = value === undefined ? NaN : Math.round(value)
  const raw = rounded >= writable.min && rounded <= writable.max ? rounded : writable.invalid
  if (writable.size === 1 && writable.signed) view.setInt8(offset, raw)
  else if (writable.size === 1) view.setUint8(offset, raw)
  else if (writable.size === 2) view.setUint16(offset, raw, true)
  else view.setUint32(offset, raw >>> 0, true)
}
