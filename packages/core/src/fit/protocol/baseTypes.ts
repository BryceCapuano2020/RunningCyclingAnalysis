/** FIT base type numbers: the low five bits of a field's base type byte. */
export const BASE = {
  enum: 0,
  sint8: 1,
  uint8: 2,
  sint16: 3,
  uint16: 4,
  sint32: 5,
  uint32: 6,
  string: 7,
  float32: 8,
  float64: 9,
  uint8z: 10,
  uint16z: 11,
  uint32z: 12,
  byte: 13,
  sint64: 14,
  uint64: 15,
  uint64z: 16,
} as const

/** Byte width of one element of a base type, or undefined for an unknown base type. */
export function baseSize(base: number): number | undefined {
  switch (base) {
    case BASE.enum:
    case BASE.sint8:
    case BASE.uint8:
    case BASE.string:
    case BASE.uint8z:
    case BASE.byte:
      return 1
    case BASE.sint16:
    case BASE.uint16:
    case BASE.uint16z:
      return 2
    case BASE.sint32:
    case BASE.uint32:
    case BASE.float32:
    case BASE.uint32z:
      return 4
    case BASE.float64:
    case BASE.sint64:
    case BASE.uint64:
    case BASE.uint64z:
      return 8
    default:
      return undefined
  }
}

/**
 * Reads the first element of a numeric base type. The invalid value of each type (0xFF, 0x7FFF,
 * zero for the "z" types and so on) reads as undefined. Callers check bounds first.
 */
export function readElement(
  view: DataView,
  offset: number,
  base: number,
  little: boolean,
): number | undefined {
  switch (base) {
    case BASE.enum:
    case BASE.uint8:
    case BASE.byte:
      return absentIf(view.getUint8(offset), 0xff)
    case BASE.sint8:
      return absentIf(view.getInt8(offset), 0x7f)
    case BASE.uint8z:
      return absentIf(view.getUint8(offset), 0)
    case BASE.sint16:
      return absentIf(view.getInt16(offset, little), 0x7fff)
    case BASE.uint16:
      return absentIf(view.getUint16(offset, little), 0xffff)
    case BASE.uint16z:
      return absentIf(view.getUint16(offset, little), 0)
    case BASE.sint32:
      return absentIf(view.getInt32(offset, little), 0x7fffffff)
    case BASE.uint32:
      return absentIf(view.getUint32(offset, little), 0xffffffff)
    case BASE.uint32z:
      return absentIf(view.getUint32(offset, little), 0)
    case BASE.float32: {
      const value = view.getFloat32(offset, little)
      return Number.isNaN(value) ? undefined : value
    }
    case BASE.float64: {
      const value = view.getFloat64(offset, little)
      return Number.isNaN(value) ? undefined : value
    }
    case BASE.sint64:
      return absentIf(view.getBigInt64(offset, little), 0x7fffffffffffffffn, Number)
    case BASE.uint64:
      return absentIf(view.getBigUint64(offset, little), 0xffffffffffffffffn, Number)
    case BASE.uint64z:
      return absentIf(view.getBigUint64(offset, little), 0n, Number)
    default:
      return undefined
  }
}

function absentIf(value: number, invalid: number): number | undefined
function absentIf(
  value: bigint,
  invalid: bigint,
  convert: (v: bigint) => number,
): number | undefined
function absentIf(
  value: number | bigint,
  invalid: number | bigint,
  convert?: (v: bigint) => number,
): number | undefined {
  if (value === invalid) return undefined
  return typeof value === 'bigint' ? convert?.(value) : value
}

/**
 * Reads one field value: strings up to the first NUL, numeric types from their first element
 * (arrays read as their first element), anything narrower than one element as undefined.
 */
export function readField(
  view: DataView,
  offset: number,
  size: number,
  base: number,
  little: boolean,
): number | string | undefined {
  if (base === BASE.string) return readString(view, offset, size)
  const width = baseSize(base)
  if (width === undefined || size < width) return undefined
  return readElement(view, offset, base, little)
}

function readString(view: DataView, offset: number, size: number): string | undefined {
  let text = ''
  for (let i = 0; i < size; i++) {
    const code = view.getUint8(offset + i)
    if (code === 0) break
    text += String.fromCharCode(code)
  }
  return text === '' ? undefined : text
}
