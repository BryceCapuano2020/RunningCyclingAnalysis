import { describe, expect, it } from 'vitest'
import { BASE, readField } from './baseTypes'

/** A DataView over the given bytes. */
function view(bytes: number[]): DataView {
  return new DataView(Uint8Array.from(bytes).buffer)
}

describe('base types', () => {
  it.each([
    ['enum', BASE.enum, [0xff]],
    ['uint8', BASE.uint8, [0xff]],
    ['sint8', BASE.sint8, [0x7f]],
    ['uint8z', BASE.uint8z, [0x00]],
    ['byte', BASE.byte, [0xff]],
    ['sint16', BASE.sint16, [0xff, 0x7f]],
    ['uint16', BASE.uint16, [0xff, 0xff]],
    ['uint16z', BASE.uint16z, [0x00, 0x00]],
    ['sint32', BASE.sint32, [0xff, 0xff, 0xff, 0x7f]],
    ['uint32', BASE.uint32, [0xff, 0xff, 0xff, 0xff]],
    ['uint32z', BASE.uint32z, [0, 0, 0, 0]],
    ['float32', BASE.float32, [0xff, 0xff, 0xff, 0xff]],
    ['sint64', BASE.sint64, [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f]],
    ['uint64', BASE.uint64, [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]],
    ['uint64z', BASE.uint64z, [0, 0, 0, 0, 0, 0, 0, 0]],
  ])('reads the invalid value of %s as undefined', (_name, base, bytes) => {
    const size = bytes.length
    expect(readField(view(bytes), 0, size, base, true)).toBeUndefined()
  })

  it('reads ordinary values, little- and big-endian', () => {
    expect(readField(view([0x34, 0x12]), 0, 2, BASE.uint16, true)).toBe(0x1234)
    expect(readField(view([0x12, 0x34]), 0, 2, BASE.uint16, false)).toBe(0x1234)
    expect(readField(view([0xfe, 0xff, 0xff, 0xff]), 0, 4, BASE.sint32, true)).toBe(-2)
  })

  it('reads a uint16z field in the byte order of its message', () => {
    expect(readField(view([0x01, 0x00]), 0, 2, BASE.uint16z, false)).toBe(0x0100)
    expect(readField(view([0x00, 0x01]), 0, 2, BASE.uint16z, true)).toBe(0x0100)
  })

  it('reads an array field as its first element', () => {
    expect(readField(view([7, 8, 9, 10]), 0, 4, BASE.uint8, true)).toBe(7)
  })

  it('reads a field narrower than its base type as undefined', () => {
    expect(readField(view([1, 0]), 0, 1, BASE.uint16, true)).toBeUndefined()
  })

  it('reads a string up to its first NUL and an empty one as undefined', () => {
    expect(readField(view([0x41, 0x42, 0, 0x43]), 0, 4, BASE.string, true)).toBe('AB')
    expect(readField(view([0, 0x43]), 0, 2, BASE.string, true)).toBeUndefined()
  })

  it('reads an unknown base type as undefined', () => {
    expect(readField(view([1, 2]), 0, 2, 31, true)).toBeUndefined()
  })
})
